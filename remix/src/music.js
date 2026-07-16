// Procedural music: layered synth stems over a look-ahead scheduler (the
// "Tale of Two Clocks" pattern — a setInterval wakes every 25ms and schedules
// every note that falls inside a 120ms horizon on the AudioContext clock, so
// tab throttling never causes drift).
//
// Intensity (0..6) = zone floor + Heat tier, set by the scene. Each stem has
// a persistent GainNode; crossing its threshold ramps it in over ~a bar.
// Intensity 0 is true silence: play scared and the world goes quiet.
//
// Shares the Sfx singleton's AudioContext and master gain, so the M-key mute
// covers both. No assets, ~6 persistent nodes, transient oscillators self-stop.

const BPM = 112;
const STEP_DUR = 60 / BPM / 2; // 8th notes
const STEPS = 16;

// A minor pentatonic
const A2 = 110;
const NOTE = {
  A2,
  C3: 130.81,
  D3: 146.83,
  E3: 164.81,
  G3: 196,
  A3: 220,
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  G4: 392,
  A4: 440,
  G2: 98,
  E2: 82.41,
};

// pattern: value per step (null = rest)
const STEMS = [
  {
    id: 'arp',
    min: 1,
    vol: 0.09,
    synth: 'pluck',
    pattern: [
      NOTE.A3, null, NOTE.C4, null, NOTE.E4, null, NOTE.A4, null,
      NOTE.G4, null, NOTE.E4, null, NOTE.C4, NOTE.D4, NOTE.E4, null,
    ],
  },
  {
    id: 'bass',
    min: 2,
    vol: 0.16,
    synth: 'bass',
    pattern: [
      NOTE.A2, null, null, null, NOTE.A2, null, NOTE.A2, null,
      NOTE.G2, null, null, null, NOTE.E2, null, NOTE.G2, null,
    ],
  },
  {
    id: 'hat',
    min: 3,
    vol: 0.05,
    synth: 'hat',
    pattern: [
      null, null, 1, null, null, null, 1, null,
      null, null, 1, null, null, 1, 1, null,
    ],
  },
  {
    id: 'pad',
    min: 4,
    vol: 0.05,
    synth: 'pad',
    pattern: (() => {
      const p = new Array(STEPS).fill(null);
      p[0] = [NOTE.A2, NOTE.E3, NOTE.A3];
      p[8] = [NOTE.G2, NOTE.D3, NOTE.G3];
      return p;
    })(),
  },
];

class Music {
  constructor() {
    this.sfx = null;
    this.bus = null;
    this.stemGains = new Map();
    this.intensity = 0;
    this.timer = null;
    this.step = 0;
    this.nextNoteTime = 0;
    this.scheduledNotes = 0; // test counter
  }

  // call once the Sfx context exists (after a user gesture); safe to repeat
  attach(sfx) {
    if (this.bus || !sfx.ctx) return;
    this.sfx = sfx;
    const ctx = sfx.ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.55;
    this.bus.connect(sfx.master);
    for (const stem of STEMS) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.bus);
      this.stemGains.set(stem.id, g);
    }
    this.nextNoteTime = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  setIntensity(n) {
    n = Math.max(0, Math.min(6, n));
    if (n === this.intensity || !this.bus) {
      this.intensity = n;
      return;
    }
    this.intensity = n;
    const t = this.sfx.ctx.currentTime;
    for (const stem of STEMS) {
      const g = this.stemGains.get(stem.id);
      const target = n >= stem.min ? 1 : 0;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(target, t + STEP_DUR * 8);
    }
  }

  // momentary duck under big impacts so weight always reads
  duck() {
    if (!this.bus) return;
    const t = this.sfx.ctx.currentTime;
    const g = this.bus.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.18, t);
    g.linearRampToValueAtTime(0.55, t + 0.35);
  }

  schedule() {
    const ctx = this.sfx.ctx;
    if (ctx.state !== 'running') return;
    while (this.nextNoteTime < ctx.currentTime + 0.12) {
      if (this.intensity > 0 && !this.sfx.muted) this.playStep(this.step, this.nextNoteTime);
      this.step = (this.step + 1) % STEPS;
      this.nextNoteTime += STEP_DUR;
    }
  }

  playStep(s, t) {
    for (const stem of STEMS) {
      if (this.intensity < stem.min) continue; // don't schedule silent notes
      const v = stem.pattern[s];
      if (v === null) continue;
      this.scheduledNotes++;
      switch (stem.synth) {
        case 'pluck':
          this.osc('square', v, t, STEP_DUR * 0.9, stem);
          break;
        case 'bass':
          this.osc('triangle', v, t, STEP_DUR * 1.8, stem);
          break;
        case 'hat':
          this.hat(t, stem);
          break;
        case 'pad':
          for (const f of v) this.osc('sine', f, t, STEP_DUR * 8, stem, 0.5);
          break;
      }
    }
  }

  osc(type, freq, t, dur, stem, volMul = 1) {
    const ctx = this.sfx.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(stem.vol * volMul, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.stemGains.get(stem.id));
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  hat(t, stem) {
    const ctx = this.sfx.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.sfx.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 6000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(stem.vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(f);
    f.connect(g);
    g.connect(this.stemGains.get(stem.id));
    src.start(t);
    src.stop(t + 0.08);
  }
}

export const music = new Music();
