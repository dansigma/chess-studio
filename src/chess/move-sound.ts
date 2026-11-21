export function shouldPlayMoveSound(enabled: boolean, previous: number[], next: number[]): boolean {
  if (!enabled || next.length === 0) {
    return false;
  }
  if (next.length <= previous.length && next.every((step, index) => step === previous[index])) {
    return false;
  }
  return true;
}

export function playMoveSound(): void {
  withAudioContext((audio, now) => {
    playTone(audio, {
      type: "triangle",
      startFreq: 540,
      endFreq: 190,
      startTime: now,
      rampDuration: 0.07,
      peakGain: 0.07,
      duration: 0.09,
    });
  });
}

/** Short rising three-note chime for solving a puzzle. */
export function playSuccessSound(): void {
  withAudioContext((audio, now) => {
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, index) => {
      playTone(audio, {
        type: "sine",
        startFreq: freq,
        startTime: now + index * 0.065,
        peakGain: 0.055,
        duration: 0.16,
      });
    });
  });
}

/** Soft low thud for an incorrect puzzle move. */
export function playErrorSound(): void {
  withAudioContext((audio, now) => {
    playTone(audio, {
      type: "triangle",
      startFreq: 170,
      endFreq: 85,
      startTime: now,
      rampDuration: 0.12,
      peakGain: 0.075,
      duration: 0.15,
    });
  });
}

type ToneOptions = {
  type: OscillatorType;
  startFreq: number;
  endFreq?: number;
  startTime: number;
  rampDuration?: number;
  peakGain: number;
  duration: number;
};

function playTone(audio: AudioContext, opts: ToneOptions): void {
  const tone = audio.createOscillator();
  const gain = audio.createGain();
  tone.type = opts.type;
  tone.frequency.setValueAtTime(opts.startFreq, opts.startTime);
  if (opts.endFreq !== undefined && opts.rampDuration !== undefined) {
    tone.frequency.exponentialRampToValueAtTime(opts.endFreq, opts.startTime + opts.rampDuration);
  }
  gain.gain.setValueAtTime(0.0001, opts.startTime);
  gain.gain.exponentialRampToValueAtTime(opts.peakGain, opts.startTime + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, opts.startTime + opts.duration);
  tone.connect(gain);
  gain.connect(audio.destination);
  tone.start(opts.startTime);
  tone.stop(opts.startTime + opts.duration + 0.01);
}

function withAudioContext(run: (audio: AudioContext, now: number) => void): void {
  if (typeof window === "undefined") {
    return;
  }
  const Context = window.AudioContext;
  if (!Context) {
    return;
  }
  const audio = sharedContext(Context);
  void audio.resume();
  run(audio, audio.currentTime);
}

let audioContext: AudioContext | null = null;

function sharedContext(Context: typeof AudioContext): AudioContext {
  if (!audioContext) {
    audioContext = new Context();
  }
  return audioContext;
}
