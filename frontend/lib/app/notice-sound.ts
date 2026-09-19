let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioContext) {
    audioContext = new Ctor();
  }
  return audioContext;
}

/** Resume/create the context from a user gesture. Never throws. */
export function unlockNoticeAudio(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => undefined);
    }
  } catch {
    // Autoplay policy or missing Web Audio — visual notices still work.
  }
}

/**
 * Short sine chime. Never throws. Returns whether playback was attempted
 * after a running/resumed context was obtained.
 */
export function playNoticeSound(): boolean {
  try {
    const ctx = getAudioContext();
    if (!ctx) return false;
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => undefined);
    }
    if (ctx.state === "closed") return false;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(784, now);
    osc.frequency.exponentialRampToValueAtTime(523.25, now + 0.11);
    gain.gain.setValueAtTime(0.045, now);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.16);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);
    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {
        // Ignore teardown races.
      }
    };
    return true;
  } catch {
    return false;
  }
}

/** Test helper. */
export function resetNoticeAudioForTests(): void {
  if (audioContext) {
    try {
      void audioContext.close();
    } catch {
      // ignore
    }
  }
  audioContext = null;
}
