// Procedural sound via the Web Audio API. No audio files needed.
// Everything is guarded so an unavailable / blocked AudioContext never throws
// into the game loop. The context is created lazily on the first user gesture
// (browsers require this).

type Ctx = AudioContext;

export class AudioEngine {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  muted = false;

  private musicTimer: number | null = null;
  private musicStep = 0;
  private musicTension = 0; // 0..1, raised during boss fight

  /** Create or resume the context. Safe to call repeatedly; call from a user gesture. */
  resume() {
    try {
      if (!this.ctx) {
        const AC: typeof AudioContext =
          window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.9;
        this.master.connect(this.ctx.destination);

        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0.0;
        this.musicGain.connect(this.master);

        // Pre-render a short white-noise buffer for percussive effects.
        const len = Math.floor(this.ctx.sampleRate * 0.5);
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        this.noiseBuffer = buf;
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
    } catch {
      /* ignore — game runs silently */
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      try {
        this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.02);
      } catch {
        /* ignore */
      }
    }
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  // --- low level helpers -------------------------------------------------

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    opts: { to?: number; delay?: number; attack?: number } = {}
  ) {
    const ctx = this.ctx,
      master = this.master;
    if (!ctx || !master) return;
    try {
      const t0 = ctx.currentTime + (opts.delay ?? 0);
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (opts.to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), t0 + dur);
      const a = opts.attack ?? 0.005;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch {
      /* ignore */
    }
  }

  private noise(dur: number, gain: number, filterFreq: number, delay = 0) {
    const ctx = this.ctx,
      master = this.master,
      buf = this.noiseBuffer;
    if (!ctx || !master || !buf) return;
    try {
      const t0 = ctx.currentTime + delay;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(filterFreq, t0);
      filter.frequency.exponentialRampToValueAtTime(Math.max(80, filterFreq * 0.25), t0 + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filter);
      filter.connect(g);
      g.connect(master);
      src.start(t0);
      src.stop(t0 + dur + 0.02);
    } catch {
      /* ignore */
    }
  }

  // --- SFX ---------------------------------------------------------------

  shoot() {
    this.tone(820, 0.09, "square", 0.12, { to: 540 });
    this.tone(1240, 0.05, "triangle", 0.05, { to: 900 });
  }

  enemyShoot() {
    this.tone(360, 0.12, "sawtooth", 0.07, { to: 200 });
  }

  hitEnemy() {
    this.noise(0.06, 0.10, 2600);
  }

  explosionSmall() {
    this.noise(0.28, 0.28, 1400);
    this.tone(180, 0.25, "sawtooth", 0.10, { to: 60 });
  }

  explosionBig() {
    this.noise(0.7, 0.5, 900);
    this.tone(120, 0.6, "sawtooth", 0.18, { to: 35 });
    this.noise(0.5, 0.25, 300, 0.05);
  }

  playerHit() {
    this.tone(420, 0.5, "sawtooth", 0.22, { to: 70 });
    this.noise(0.4, 0.3, 1200);
  }

  powerup() {
    this.tone(520, 0.1, "square", 0.12, { to: 540 });
    this.tone(660, 0.1, "square", 0.12, { delay: 0.08 });
    this.tone(880, 0.16, "square", 0.12, { delay: 0.16 });
  }

  bossAlarm() {
    this.tone(440, 0.2, "square", 0.14);
    this.tone(440, 0.2, "square", 0.14, { delay: 0.3 });
  }

  uiMove() {
    this.tone(700, 0.05, "square", 0.06);
  }

  uiSelect() {
    this.tone(560, 0.08, "square", 0.12, { to: 840 });
    this.tone(840, 0.12, "square", 0.10, { delay: 0.07 });
  }

  gameOver() {
    this.tone(330, 0.5, "sawtooth", 0.16, { to: 110 });
    this.tone(220, 0.7, "sawtooth", 0.14, { to: 70, delay: 0.12 });
  }

  victory() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => this.tone(f, 0.3, "square", 0.12, { delay: i * 0.12 }));
  }

  // --- Music -------------------------------------------------------------
  // A simple looping bass + arpeggio. Scheduled step-by-step from a JS timer
  // (good enough at this tempo; not sample-accurate but inaudible drift).

  private readonly bassLine = [55, 55, 82.41, 55, 73.42, 73.42, 98, 65.41]; // A minor-ish
  private readonly arp = [220, 261.63, 329.63, 261.63, 246.94, 293.66, 220, 196];

  startMusic() {
    if (!this.ctx || !this.musicGain) return;
    if (this.musicTimer !== null) return;
    try {
      this.musicGain.gain.setTargetAtTime(0.5, this.ctx.currentTime, 0.5);
    } catch {
      /* ignore */
    }
    const stepMs = 220;
    const tick = () => {
      this.musicTick();
      this.musicTimer = window.setTimeout(tick, stepMs);
    };
    tick();
  }

  setBossMusic(on: boolean) {
    this.musicTension = on ? 1 : 0;
  }

  /** Reset the music phase to the start (call when a new run begins, not on
   *  pause/resume, so resuming stays seamless). */
  resetMusicPhase() {
    this.musicStep = 0;
  }

  private musicTick() {
    const ctx = this.ctx,
      bus = this.musicGain;
    if (!ctx || !bus || this.muted) {
      this.musicStep++;
      return;
    }
    try {
      const t0 = ctx.currentTime;
      const i = this.musicStep % 8;
      // bass
      this.musicTone(this.bassLine[i], 0.2, "triangle", 0.5, t0, bus);
      // arp (faster during boss)
      const arpNote = this.arp[i] * (this.musicTension ? 1.5 : 1);
      this.musicTone(arpNote, 0.12, "square", 0.16, t0, bus);
      if (this.musicTension) {
        this.musicTone(this.arp[(i + 4) % 8] * 1.5, 0.1, "square", 0.12, t0 + 0.11, bus);
      }
      // light hat every step
      this.musicHat(t0, bus);
    } catch {
      /* ignore */
    }
    this.musicStep++;
  }

  private musicTone(freq: number, dur: number, type: OscillatorType, gain: number, t0: number, bus: GainNode) {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(bus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private musicHat(t0: number, bus: GainNode) {
    const ctx = this.ctx,
      buf = this.noiseBuffer;
    if (!ctx || !buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.06, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
    src.connect(hp);
    hp.connect(g);
    g.connect(bus);
    src.start(t0);
    src.stop(t0 + 0.06);
  }

  stopMusic() {
    if (this.musicTimer !== null) {
      clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
    if (this.ctx && this.musicGain) {
      try {
        this.musicGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
      } catch {
        /* ignore */
      }
    }
    this.musicTension = 0;
  }
}
