"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { pickNarrationVoice } from "@/lib/app/landing-explainer";

/**
 * Shared narrated-sequence engine for the /demo product tour and the
 * /demo/pitch deck. A deterministic timeline (fixed slot per item) drives the
 * composition. Narration: prerecorded voiceover when configured, else browser
 * speech synthesis, else silent (captions only). Record Mode adds a 3 / 2 / 1 /
 * Start countdown, optional full screen and Esc to exit. Presentation only.
 */

export type NarratedItem = { durationMs: number; narration: string };
export type SequenceStatus = "idle" | "countdown" | "playing" | "paused" | "ended";
export type VoiceSource = "audio" | "speech" | "none";

export const RECORD_COUNTDOWN = ["3", "2", "1", "Start"] as const;
const COUNTDOWN_STEP_MS = 1000;
const TICK_MS = 100;

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

export type NarratedSequence = {
  status: SequenceStatus;
  index: number;
  elapsed: number;
  position: number;
  totalMs: number;
  voiceOn: boolean;
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
  toggleVoice: () => void;
  startRecordMode: () => void;
  exitRecordMode: () => void;
};

export function useNarratedSequence({
  items,
  voiceoverSrc,
  overrunCapMs,
}: {
  items: readonly NarratedItem[];
  voiceoverSrc: string | null;
  /** A spoken line may run past its slot by at most this much. */
  overrunCapMs: number;
}): NarratedSequence {
  const [status, setStatus] = useState<SequenceStatus>("idle");
  const [index, setIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [voiceOn, setVoiceOn] = useState(true);
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
  const voiceOnRef = useRef(true);
  const sourceRef = useRef<VoiceSource>("none");
  const timersRef = useRef<number[]>([]);
  const enteredFullscreenRef = useRef(false);

  const voiceover = audioFailed ? null : voiceoverSrc;
  const source: VoiceSource = voiceover ? "audio" : speechOk ? "speech" : "none";

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => {
    sourceRef.current = source;
  }, [source]);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  /* ---------- voices (wait for voiceschanged; never fail without them) ---------- */
  useEffect(() => {
    if (!speechSupported()) return;
    const synth = window.speechSynthesis;
    const load = () => {
      const voice = pickNarrationVoice(synth.getVoices());
      voiceRef.current = voice;
      setVoiceName(voice?.name ?? null);
      setSpeechOk(true);
    };
    load();
    synth.addEventListener("voiceschanged", load);
    return () => {
      synth.removeEventListener("voiceschanged", load);
      synth.cancel();
    };
  }, []);

  const stopSpeech = useCallback(() => {
    speechTokenRef.current += 1;
    speakingRef.current = false;
    if (speechSupported()) window.speechSynthesis.cancel();
  }, []);

  const speak = useCallback((text: string) => {
    if (!speechSupported()) return;
    const synth = window.speechSynthesis;
    const token = ++speechTokenRef.current;
    synth.cancel();
    if (!text) {
      speakingRef.current = false;
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = voiceRef.current;
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? "en-US";
    utterance.rate = 1;
    utterance.pitch = 1;
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
  }, []);

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

  /* ---------- deterministic timeline ---------- */
  useEffect(() => {
    if (status !== "playing") return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      const list = itemsRef.current;
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
            elapsedRef.current = item.durationMs;
            setElapsed(item.durationMs);
            setStatus("ended");
            statusRef.current = "ended";
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
  }, [status, narrate, overrunCapMs]);

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
      if (speechSupported()) window.speechSynthesis.resume();
      syncAudio(sequenceStartMs(itemsRef.current, indexRef.current) + elapsedRef.current, true);
      return;
    }
    stopSpeech();
    startAt(current === "ended" ? 0 : indexRef.current);
  }, [startAt, stopSpeech, syncAudio]);

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

  const toggleVoice = useCallback(() => {
    const on = !voiceOnRef.current;
    voiceOnRef.current = on;
    setVoiceOn(on);
    if (!on) stopSpeech();
    if (audioRef.current) audioRef.current.muted = !on;
  }, [stopSpeech]);

  /* ---------- Record Mode ---------- */
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

  useEffect(
    () => () => {
      for (const id of timersRef.current) window.clearTimeout(id);
      if (speechSupported()) window.speechSynthesis.cancel();
    },
    []
  );

  const onAudioError = useCallback(() => {
    // Configured voiceover missing or unplayable: fall back to speech synthesis.
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
    toggleVoice,
    startRecordMode,
    exitRecordMode,
  };
}
