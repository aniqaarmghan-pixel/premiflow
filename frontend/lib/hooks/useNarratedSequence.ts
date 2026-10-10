"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { pickNarrationVoice } from "@/lib/app/landing-explainer";

/**
 * Shared narrated-sequence engine for the /demo product tour, the landing
 * inline player and the /demo/pitch deck. A deterministic timeline (fixed slot
 * per item) drives the composition.
 *
 * Voice hierarchy: 1. prerecorded voiceover (when configured it is the master
 * clock, so scenes follow the recording's timing), 2. browser speech synthesis
 * as a clearly labelled preview voice, 3. captions only.
 *
 * Record Mode is an explicit, separate state: 3 / 2 / 1 / Start countdown,
 * optional full screen, Esc to exit, and it exits on its own shortly after the
 * last item so it can never leak into normal viewing. Presentation only.
 */

export type NarratedItem = { durationMs: number; narration: string };
export type SequenceStatus = "idle" | "countdown" | "playing" | "paused" | "ended";
export type VoiceSource = "audio" | "speech" | "none";

export const RECORD_COUNTDOWN = ["3", "2", "1", "Start"] as const;
/** Record Mode holds the final frame this long, then returns to normal viewing. */
export const RECORD_END_HOLD_MS = 2500;
const COUNTDOWN_STEP_MS = 1000;
const TICK_MS = 100;
/** Seeking into a scene later than this skips its (already started) spoken line. */
const RESPEAK_WINDOW_MS = 1500;

function speechSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance === "function"
  );
}

export function sequenceTotalMs(items: readonly NarratedItem[]): number {
  return items.reduce((sum, item) => sum + item.durationMs, 0);
}

export function sequenceStartMs(items: readonly NarratedItem[], index: number): number {
  return items.slice(0, Math.max(0, index)).reduce((sum, item) => sum + item.durationMs, 0);
}

/** Timeline position -> item index + elapsed time inside that item. */
export function locateInSequence(
  items: readonly NarratedItem[],
  positionMs: number
): { index: number; elapsed: number } {
  let rest = Math.max(0, positionMs);
  for (let i = 0; i < items.length; i += 1) {
    const d = items[i].durationMs;
    if (rest < d || i === items.length - 1) return { index: i, elapsed: Math.min(rest, d) };
    rest -= d;
  }
  return { index: 0, elapsed: 0 };
}

export type NarratedSequence = {
  status: SequenceStatus;
  index: number;
  elapsed: number;
  position: number;
  totalMs: number;
  voiceOn: boolean;
  volume: number;
  recordMode: boolean;
  countdownLabel: string | null;
  voiceSource: VoiceSource;
  voiceName: string | null;
  voiceover: string | null;
  audioRef: RefObject<HTMLAudioElement | null>;
  onAudioError: () => void;
  play: () => void;
  pause: () => void;
  restart: () => void;
  jumpTo: (index: number) => void;
  seek: (positionMs: number) => void;
  toggleVoice: () => void;
  setVolume: (volume: number) => void;
  startRecordMode: () => void;
  exitRecordMode: () => void;
};

export function useNarratedSequence({
  items,
  voiceoverSrc,
  overrunCapMs,
  initialVoiceOn = true,
  speechRate = 1,
  autoAdvance = true,
  voiceURI,
}: {
  items: readonly NarratedItem[];
  voiceoverSrc: string | null;
  /** A spoken preview line may run past its slot by at most this much. */
  overrunCapMs: number;
  /** Landing player starts with voice off; the user turns it on. */
  initialVoiceOn?: boolean;
  speechRate?: number;
  /** false: hold (paused) at the end of each item until play / next. Record Mode always advances. */
  autoAdvance?: boolean;
  /**
   * Preview-voice choice by SpeechSynthesisVoice.voiceURI. undefined / null or
   * a voice the browser does not report: the automatic pickNarrationVoice choice.
   */
  voiceURI?: string | null;
}): NarratedSequence {
  const [status, setStatus] = useState<SequenceStatus>("idle");
  const [index, setIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [voiceOn, setVoiceOn] = useState(initialVoiceOn);
  const [volume, setVolumeState] = useState(1);
  const [recordMode, setRecordMode] = useState(false);
  const [countdown, setCountdown] = useState(-1);
  const [audioFailed, setAudioFailed] = useState(false);
  const [speechOk, setSpeechOk] = useState(false);
  const [voiceName, setVoiceName] = useState<string | null>(null);

  const itemsRef = useRef(items);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const speakingRef = useRef(false);
  const speechTokenRef = useRef(0);
  const overrunRef = useRef(0);
  const indexRef = useRef(0);
  const elapsedRef = useRef(0);
  const statusRef = useRef<SequenceStatus>("idle");
  const voiceOnRef = useRef(initialVoiceOn);
  const volumeRef = useRef(1);
  const sourceRef = useRef<VoiceSource>("none");
  const timersRef = useRef<number[]>([]);
  const enteredFullscreenRef = useRef(false);
  const autoAdvanceRef = useRef(autoAdvance);
  const voiceURIRef = useRef(voiceURI ?? null);

  const voiceover = audioFailed ? null : voiceoverSrc;
  const source: VoiceSource = voiceover ? "audio" : speechOk ? "speech" : "none";

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    autoAdvanceRef.current = autoAdvance || recordMode;
  }, [autoAdvance, recordMode]);
  useEffect(() => {
    sourceRef.current = source;
  }, [source]);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  /* ---------- voices (wait for voiceschanged; never fail without them) ---------- */
  const selectVoice = useCallback(() => {
    if (!speechSupported()) return;
    const voices = window.speechSynthesis.getVoices();
    const wanted = voiceURIRef.current;
    const voice = (wanted ? voices.find((v) => v.voiceURI === wanted) : undefined) ?? pickNarrationVoice(voices);
    voiceRef.current = voice;
    setVoiceName(voice?.name ?? null);
    setSpeechOk(true);
  }, []);

  useEffect(() => {
    voiceURIRef.current = voiceURI ?? null;
    selectVoice();
  }, [voiceURI, selectVoice]);

  useEffect(() => {
    if (!speechSupported()) return;
    const synth = window.speechSynthesis;
    const load = selectVoice;
    load();
    synth.addEventListener("voiceschanged", load);
    return () => {
      synth.removeEventListener("voiceschanged", load);
      synth.cancel();
    };
  }, [selectVoice]);

  const stopSpeech = useCallback(() => {
    speechTokenRef.current += 1;
    speakingRef.current = false;
    if (speechSupported()) window.speechSynthesis.cancel();
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!speechSupported()) return;
      const synth = window.speechSynthesis;
      const token = ++speechTokenRef.current;
      synth.cancel();
      if (!text || volumeRef.current <= 0) {
        speakingRef.current = false;
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      const voice = voiceRef.current;
      if (voice) utterance.voice = voice;
      utterance.lang = voice?.lang ?? "en-US";
      utterance.rate = speechRate;
      utterance.pitch = 1;
      utterance.volume = volumeRef.current;
      const done = () => {
        if (speechTokenRef.current === token) speakingRef.current = false;
      };
      utterance.onend = done;
      utterance.onerror = done;
      speakingRef.current = true;
      try {
        synth.speak(utterance);
      } catch {
        done();
      }
    },
    [speechRate]
  );

  /** Speech mode only: a prerecorded track already contains every line. */
  const narrate = useCallback(
    (i: number) => {
      if (!voiceOnRef.current || sourceRef.current !== "speech") return;
      speak(itemsRef.current[i]?.narration ?? "");
    },
    [speak]
  );

  const syncAudio = useCallback((positionMs: number, playIt: boolean) => {
    const audio = audioRef.current;
    if (!audio || sourceRef.current !== "audio") return;
    audio.muted = !voiceOnRef.current;
    audio.volume = volumeRef.current;
    try {
      if (Math.abs(audio.currentTime - positionMs / 1000) > 0.3) audio.currentTime = positionMs / 1000;
    } catch {
      /* metadata not loaded yet; playback starts from 0 */
    }
    if (playIt) audio.play().catch(() => undefined);
    else audio.pause();
  }, []);

  const clearTimers = useCallback(() => {
    for (const id of timersRef.current) window.clearTimeout(id);
    timersRef.current = [];
  }, []);

  const startAt = useCallback(
    (i: number) => {
      indexRef.current = i;
      elapsedRef.current = 0;
      overrunRef.current = 0;
      setIndex(i);
      setElapsed(0);
      setStatus("playing");
      statusRef.current = "playing";
      syncAudio(sequenceStartMs(itemsRef.current, i), true);
      narrate(i);
    },
    [narrate, syncAudio]
  );

  /* ---------- timeline (prerecorded audio is the master clock when present) ---------- */
  useEffect(() => {
    if (status !== "playing") return;
    let last = performance.now();
    const finish = (list: readonly NarratedItem[]) => {
      const lastIndex = list.length - 1;
      indexRef.current = lastIndex;
      elapsedRef.current = list[lastIndex].durationMs;
      setIndex(lastIndex);
      setElapsed(list[lastIndex].durationMs);
      setStatus("ended");
      statusRef.current = "ended";
    };
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      const list = itemsRef.current;

      const audio = audioRef.current;
      if (sourceRef.current === "audio" && audio && !audio.paused && !audio.ended && audio.readyState >= 2) {
        const pos = audio.currentTime * 1000;
        if (pos >= sequenceTotalMs(list)) {
          finish(list);
          return;
        }
        const at = locateInSequence(list, pos);
        if (at.index !== indexRef.current) {
          indexRef.current = at.index;
          setIndex(at.index);
        }
        elapsedRef.current = at.elapsed;
        setElapsed(at.elapsed);
        return;
      }

      const item = list[indexRef.current];
      let next = elapsedRef.current + dt;
      if (next >= item.durationMs) {
        const waitForSpeech =
          sourceRef.current === "speech" &&
          voiceOnRef.current &&
          speakingRef.current &&
          overrunRef.current < overrunCapMs;
        if (waitForSpeech) {
          overrunRef.current += dt;
          next = item.durationMs;
        } else {
          overrunRef.current = 0;
          const following = indexRef.current + 1;
          if (following >= list.length) {
            finish(list);
            return;
          }
          if (!autoAdvanceRef.current) {
            stopSpeech();
            elapsedRef.current = item.durationMs;
            setElapsed(item.durationMs);
            setStatus("paused");
            statusRef.current = "paused";
            return;
          }
          indexRef.current = following;
          elapsedRef.current = 0;
          setIndex(following);
          setElapsed(0);
          narrate(following);
          return;
        }
      }
      elapsedRef.current = next;
      setElapsed(next);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [status, narrate, overrunCapMs, stopSpeech]);

  const pause = useCallback(() => {
    if (statusRef.current !== "playing") return;
    setStatus("paused");
    statusRef.current = "paused";
    if (speechSupported()) window.speechSynthesis.pause();
    audioRef.current?.pause();
  }, []);

  const play = useCallback(() => {
    const current = statusRef.current;
    if (current === "playing" || current === "countdown") return;
    if (current === "paused") {
      setStatus("playing");
      statusRef.current = "playing";
      if (speakingRef.current) {
        if (speechSupported()) window.speechSynthesis.resume();
      } else if (elapsedRef.current < RESPEAK_WINDOW_MS) {
        narrate(indexRef.current);
      }
      syncAudio(sequenceStartMs(itemsRef.current, indexRef.current) + elapsedRef.current, true);
      return;
    }
    stopSpeech();
    startAt(current === "ended" ? 0 : indexRef.current);
  }, [narrate, startAt, stopSpeech, syncAudio]);

  const restart = useCallback(() => {
    clearTimers();
    stopSpeech();
    setCountdown(-1);
    startAt(0);
  }, [clearTimers, startAt, stopSpeech]);

  const jumpTo = useCallback(
    (i: number) => {
      const list = itemsRef.current;
      if (i < 0 || i >= list.length || statusRef.current === "countdown") return;
      stopSpeech();
      if (statusRef.current === "playing") {
        startAt(i);
        return;
      }
      indexRef.current = i;
      elapsedRef.current = 0;
      overrunRef.current = 0;
      setIndex(i);
      setElapsed(0);
      if (statusRef.current === "ended") {
        setStatus("idle");
        statusRef.current = "idle";
      }
      syncAudio(sequenceStartMs(list, i), false);
    },
    [startAt, stopSpeech, syncAudio]
  );

  /** Progress-bar scrubbing. Paused/idle stays paused at the new position. */
  const seek = useCallback(
    (positionMs: number) => {
      const list = itemsRef.current;
      if (statusRef.current === "countdown" || list.length === 0) return;
      const total = sequenceTotalMs(list);
      const at = locateInSequence(list, Math.min(Math.max(0, positionMs), total - 1));
      stopSpeech();
      indexRef.current = at.index;
      elapsedRef.current = at.elapsed;
      overrunRef.current = 0;
      setIndex(at.index);
      setElapsed(at.elapsed);
      const playing = statusRef.current === "playing";
      if (!playing) {
        setStatus("paused");
        statusRef.current = "paused";
      }
      syncAudio(sequenceStartMs(list, at.index) + at.elapsed, playing);
      if (playing && at.elapsed < RESPEAK_WINDOW_MS) narrate(at.index);
    },
    [narrate, stopSpeech, syncAudio]
  );

  const toggleVoice = useCallback(() => {
    const on = !voiceOnRef.current;
    voiceOnRef.current = on;
    setVoiceOn(on);
    if (!on) stopSpeech();
    if (on && volumeRef.current <= 0) {
      volumeRef.current = 1;
      setVolumeState(1);
    }
    if (audioRef.current) {
      audioRef.current.muted = !on;
      audioRef.current.volume = volumeRef.current;
    }
  }, [stopSpeech]);

  const setVolume = useCallback(
    (value: number) => {
      const v = Math.min(1, Math.max(0, value));
      volumeRef.current = v;
      setVolumeState(v);
      if (v > 0 && !voiceOnRef.current) {
        voiceOnRef.current = true;
        setVoiceOn(true);
      }
      if (v <= 0) stopSpeech();
      if (audioRef.current) {
        audioRef.current.volume = v;
        audioRef.current.muted = !voiceOnRef.current;
      }
    },
    [stopSpeech]
  );

  /* ---------- Record Mode (explicit; never active during normal viewing) ---------- */
  const startRecordMode = useCallback(() => {
    clearTimers();
    stopSpeech();
    audioRef.current?.pause();
    setRecordMode(true);
    indexRef.current = 0;
    elapsedRef.current = 0;
    setIndex(0);
    setElapsed(0);
    setStatus("countdown");
    statusRef.current = "countdown";
    setCountdown(0);
    const root = document.documentElement;
    if (!document.fullscreenElement && typeof root.requestFullscreen === "function") {
      root
        .requestFullscreen()
        .then(() => {
          enteredFullscreenRef.current = true;
        })
        .catch(() => undefined);
    }
    RECORD_COUNTDOWN.forEach((_, k) => {
      if (k === 0) return;
      timersRef.current.push(window.setTimeout(() => setCountdown(k), k * COUNTDOWN_STEP_MS));
    });
    timersRef.current.push(
      window.setTimeout(() => {
        setCountdown(-1);
        startAt(0);
      }, RECORD_COUNTDOWN.length * COUNTDOWN_STEP_MS)
    );
  }, [clearTimers, startAt, stopSpeech]);

  const exitRecordMode = useCallback(() => {
    clearTimers();
    setCountdown(-1);
    setRecordMode(false);
    if (statusRef.current === "countdown") {
      setStatus("idle");
      statusRef.current = "idle";
    } else if (statusRef.current === "playing") {
      pause();
    }
    if (enteredFullscreenRef.current && document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    }
    enteredFullscreenRef.current = false;
  }, [clearTimers, pause]);

  useEffect(() => {
    if (!recordMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitRecordMode();
    };
    const onFullscreen = () => {
      if (enteredFullscreenRef.current && !document.fullscreenElement) exitRecordMode();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
  }, [recordMode, exitRecordMode]);

  // Previously Record Mode stayed on after the last item: the full-screen
  // overlay kept covering the page (branding + controls) and the in-page frame
  // stayed blank. Hold the end frame briefly, then return to normal viewing.
  useEffect(() => {
    if (!recordMode || status !== "ended") return;
    const id = window.setTimeout(() => exitRecordMode(), RECORD_END_HOLD_MS);
    return () => window.clearTimeout(id);
  }, [recordMode, status, exitRecordMode]);

  useEffect(
    () => () => {
      for (const id of timersRef.current) window.clearTimeout(id);
      if (speechSupported()) window.speechSynthesis.cancel();
    },
    []
  );

  const onAudioError = useCallback(() => {
    // Configured voiceover missing or unplayable: fall back to the preview voice.
    setAudioFailed(true);
    sourceRef.current = speechSupported() ? "speech" : "none";
    if (statusRef.current === "playing") narrate(indexRef.current);
  }, [narrate]);

  return {
    status,
    index,
    elapsed,
    position: sequenceStartMs(items, index) + elapsed,
    totalMs: sequenceTotalMs(items),
    voiceOn,
    volume,
    recordMode,
    countdownLabel: countdown >= 0 ? RECORD_COUNTDOWN[countdown] : null,
    voiceSource: source,
    voiceName,
    voiceover,
    audioRef,
    onAudioError,
    play,
    pause,
    restart,
    jumpTo,
    seek,
    toggleVoice,
    setVolume,
    startRecordMode,
    exitRecordMode,
  };
}
