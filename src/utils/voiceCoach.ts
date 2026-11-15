let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new Ctx();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function playTone(frequency = 660, durationMs = 140, enabled = true, volume = 0.08) {
  if (!enabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
  } catch {
    // Web Audio opcional em ambientes restritos
  }
}

export function playCountdownTick(secondsLeft: number, soundEnabled: boolean) {
  if (!soundEnabled) return;
  if (secondsLeft === 0) {
    playTone(880, 240, true, 0.11);
  } else {
    playTone(540, 110, true, 0.07);
  }
}

export function speakCoachCue(text: string, voiceEnabled: boolean) {
  if (!voiceEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.rate = 1.03;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const ptVoice =
      voices.find((v) => v.lang.toLowerCase().startsWith('pt-br')) ||
      voices.find((v) => v.lang.toLowerCase().startsWith('pt'));
    if (ptVoice) {
      utterance.voice = ptVoice;
    }

    window.speechSynthesis.speak(utterance);
  } catch {
    // Síntese de voz opcional
  }
}

export function stopVoiceCoach() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignora
    }
  }
}
