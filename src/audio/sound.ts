export type SoundName = "start" | "eat" | "gold" | "gem" | "obstacle" | "death" | "pause" | "resume" | "count" | "go" | "slow" | "ghost" | "speedup" | "record";

export type SoundPlayer = {
  play: (name: SoundName, combo?: number) => void;
  toggleMuted: () => boolean;
  isMuted: () => boolean;
};

const MUTED_KEY = "retro-snake-muted";

type Note = { freq: number; at: number; length: number; type?: OscillatorType; volume?: number; slideTo?: number };

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTED_KEY) === "1";
  } catch {
    return false;
  }
}

export function createSoundPlayer(): SoundPlayer {
  let muted = readMuted();
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;

  function audio(): { ctx: AudioContext; master: GainNode } | null {
    if (typeof AudioContext === "undefined") return null;
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.18;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume();
    return master ? { ctx, master } : null;
  }

  function tones(notes: Note[]): void {
    const out = audio();
    if (!out) return;
    const now = out.ctx.currentTime;
    for (const note of notes) {
      const osc = out.ctx.createOscillator();
      const gain = out.ctx.createGain();
      const start = now + note.at;
      const end = start + note.length;
      osc.type = note.type ?? "square";
      osc.frequency.setValueAtTime(note.freq, start);
      if (note.slideTo) osc.frequency.exponentialRampToValueAtTime(note.slideTo, end);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(note.volume ?? 0.6, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain).connect(out.master);
      osc.start(start);
      osc.stop(end + 0.02);
    }
  }

  function noise(length: number, volume: number): void {
    const out = audio();
    if (!out) return;
    const buffer = out.ctx.createBuffer(1, Math.floor(out.ctx.sampleRate * length), out.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const source = out.ctx.createBufferSource();
    const gain = out.ctx.createGain();
    gain.gain.value = volume;
    source.buffer = buffer;
    source.connect(gain).connect(out.master);
    source.start();
  }

  function play(name: SoundName, combo = 1): void {
    if (muted) return;
    const lift = 1.12 ** Math.max(0, combo - 1);
    switch (name) {
      case "start":
        tones([{ freq: 330, at: 0, length: 0.08 }, { freq: 494, at: 0.08, length: 0.08 }, { freq: 659, at: 0.16, length: 0.14 }]);
        break;
      case "eat":
        tones([{ freq: 520 * lift, at: 0, length: 0.09, slideTo: 880 * lift }]);
        break;
      case "gold":
        tones([523, 659, 784, 1047].map((freq, i) => ({ freq: freq * lift, at: i * 0.05, length: 0.1, type: "triangle" as const, volume: 0.7 })));
        break;
      case "gem":
        tones([659, 831, 988, 1319, 1661].map((freq, i) => ({ freq: freq * lift, at: i * 0.045, length: 0.14, type: "sine" as const, volume: 0.8 })));
        break;
      case "obstacle":
        tones([{ freq: 140, at: 0, length: 0.22, type: "sawtooth", volume: 0.5, slideTo: 60 }]);
        break;
      case "death":
        tones([{ freq: 440, at: 0, length: 0.5, type: "sawtooth", volume: 0.6, slideTo: 55 }]);
        noise(0.35, 0.5);
        break;
      case "pause":
        tones([{ freq: 440, at: 0, length: 0.07, type: "triangle" }, { freq: 330, at: 0.07, length: 0.1, type: "triangle" }]);
        break;
      case "count":
        tones([{ freq: 440, at: 0, length: 0.12, type: "square", volume: 0.45 }]);
        break;
      case "go":
        tones([{ freq: 880, at: 0, length: 0.25, type: "square", volume: 0.5 }, { freq: 1320, at: 0.05, length: 0.2, type: "triangle", volume: 0.35 }]);
        break;
      case "slow":
        tones([{ freq: 900, at: 0, length: 0.5, type: "sine", volume: 0.6, slideTo: 220 }, { freq: 600, at: 0.05, length: 0.45, type: "triangle", volume: 0.3, slideTo: 150 }]);
        break;
      case "ghost":
        tones([0, 1, 2, 3, 4, 5].map((i) => ({ freq: 400 + (i % 2) * 180, at: i * 0.05, length: 0.12, type: "sine" as const, volume: 0.5 })));
        break;
      case "speedup":
        tones([392, 523, 659, 784].map((freq, i) => ({ freq, at: i * 0.04, length: 0.08, type: "square" as const, volume: 0.35 })));
        break;
      case "record":
        tones([523, 659, 784, 1047, 784, 1047].map((freq, i) => ({ freq, at: i * 0.09, length: 0.16, type: "triangle" as const, volume: 0.6 })));
        break;
      case "resume":
        tones([{ freq: 330, at: 0, length: 0.07, type: "triangle" }, { freq: 440, at: 0.07, length: 0.1, type: "triangle" }]);
        break;
    }
  }

  function toggleMuted(): boolean {
    muted = !muted;
    try {
      window.localStorage.setItem(MUTED_KEY, muted ? "1" : "0");
    } catch {
      // Preference persistence is optional.
    }
    return muted;
  }

  return { play, toggleMuted, isMuted: () => muted };
}
