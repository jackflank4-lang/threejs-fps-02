// Every sound is synthesized with WebAudio: no audio files, no network, nothing to
// load. One shared noise buffer, one master gain, and small helpers per sound.
export function createAudio() {
  let context = null;
  let master = null;
  let noiseBuffer = null;
  let muted = false;

  function ensure() {
    // The context is only ever created by unlock(), on a user gesture: creating it
    // earlier makes the browser warn about autoplay on every sound.
    if (!context) return null;
    if (context.state === 'suspended') context.resume();
    return context;
  }

  function noise(when, duration, filterFreq, gainValue, type = 'lowpass') {
    if (!context || muted) return;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(when);
    source.stop(when + duration + 0.02);
  }

  function tone(when, duration, freqFrom, freqTo, gainValue, type = 'sine') {
    if (!context || muted) return;
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freqFrom, when);
    if (freqTo !== freqFrom) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, freqTo), when + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(when);
    oscillator.stop(when + duration + 0.02);
  }

  function create() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(context.destination);
    noiseBuffer = context.createBuffer(1, context.sampleRate * 0.5, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return context;
  }

  return {
    unlock() { create(); if (context && context.state === 'suspended') context.resume(); },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    shot(kind) {
      if (!ensure()) return;
      const now = context.currentTime;
      // Crack first, body second: a short high noise burst plus a low thump.
      if (kind === 'sniper') {
        noise(now, 0.22, 900, 0.9);
        tone(now, 0.25, 160, 45, 0.8);
      } else if (kind === 'shotgun') {
        noise(now, 0.18, 1400, 0.8);
        tone(now, 0.16, 120, 50, 0.7);
      } else if (kind === 'smg') {
        noise(now, 0.07, 2600, 0.45);
        tone(now, 0.08, 210, 90, 0.35);
      } else if (kind === 'pistol') {
        noise(now, 0.09, 2200, 0.5);
        tone(now, 0.09, 190, 80, 0.4);
      } else {
        noise(now, 0.11, 1800, 0.6);
        tone(now, 0.12, 170, 60, 0.5);
      }
    },
    dryFire() {
      if (!ensure()) return;
      tone(context.currentTime, 0.04, 900, 700, 0.15, 'square');
    },
    reload() {
      if (!ensure()) return;
      const now = context.currentTime;
      tone(now, 0.05, 1200, 900, 0.2, 'square');
      tone(now + 0.28, 0.05, 900, 1300, 0.2, 'square');
    },
    step() {
      if (!ensure()) return;
      noise(context.currentTime, 0.06, 500, 0.08);
    },
    hit() {
      if (!ensure()) return;
      tone(context.currentTime, 0.05, 1800, 1800, 0.25, 'square');
    },
    kill() {
      if (!ensure()) return;
      const now = context.currentTime;
      tone(now, 0.08, 1320, 1320, 0.25, 'square');
      tone(now + 0.08, 0.12, 1760, 1760, 0.25, 'square');
    },
    hurt() {
      if (!ensure()) return;
      tone(context.currentTime, 0.12, 220, 110, 0.35);
    },
    beep(final) {
      if (!ensure()) return;
      tone(context.currentTime, 0.07, final ? 1900 : 1200, final ? 1900 : 1200, 0.3, 'square');
    },
    plantTick() {
      if (!ensure()) return;
      tone(context.currentTime, 0.05, 1500, 1500, 0.22, 'square');
    },
    explosion() {
      if (!ensure()) return;
      const now = context.currentTime;
      noise(now, 1.1, 300, 1.0);
      tone(now, 0.9, 90, 28, 0.9);
    },
    grenadeBounce() {
      if (!ensure()) return;
      tone(context.currentTime, 0.05, 320, 200, 0.15);
    },
    roundWin() {
      if (!ensure()) return;
      const now = context.currentTime;
      tone(now, 0.14, 523, 523, 0.3, 'triangle');
      tone(now + 0.14, 0.14, 659, 659, 0.3, 'triangle');
      tone(now + 0.28, 0.24, 784, 784, 0.3, 'triangle');
    },
    roundLose() {
      if (!ensure()) return;
      const now = context.currentTime;
      tone(now, 0.18, 392, 392, 0.3, 'triangle');
      tone(now + 0.18, 0.3, 311, 311, 0.3, 'triangle');
    },
  };
}
