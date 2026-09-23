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
  if (typeof window === "undefined") {
    return;
  }
  const Context = window.AudioContext;
  if (!Context) {
    return;
  }
  const audio = sharedContext(Context);
  void audio.resume();
  const now = audio.currentTime;
  const tone = audio.createOscillator();
  const gain = audio.createGain();
  tone.type = "triangle";
  tone.frequency.setValueAtTime(540, now);
  tone.frequency.exponentialRampToValueAtTime(190, now + 0.07);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.07, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
  tone.connect(gain);
  gain.connect(audio.destination);
  tone.start(now);
  tone.stop(now + 0.1);
}

let audioContext: AudioContext | null = null;

function sharedContext(Context: typeof AudioContext): AudioContext {
  if (!audioContext) {
    audioContext = new Context();
  }
  return audioContext;
}
