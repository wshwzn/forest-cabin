// audio.js — a fully procedural soundscape (wind, leaves, fire, birds, crickets, drone)
import { rng, clamp } from './util.js';

export class Ambience {
  constructor() {
    this.ctx = null;
    this.started = false;
    this.enabled = true;
    this.master = null;
    this.timers = [];
    this._rand = rng(4242);
  }

  _noiseBuffer(seconds = 3, brown = true) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        if (brown) {
          last = (last + 0.02 * white) / 1.02;
          data[i] = last * 3.2;
        } else {
          data[i] = white;
        }
      }
    }
    return buf;
  }

  async start() {
    if (this.started) { this.setEnabled(true); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    await ctx.resume().catch(() => {});

    const master = ctx.createGain();
    master.gain.value = 0.0;
    // gentle master compression so it never gets harsh
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -22;
    comp.knee.value = 24;
    comp.ratio.value = 3;
    comp.attack.value = 0.05;
    comp.release.value = 0.4;
    master.connect(comp).connect(ctx.destination);
    this.master = master;
    this._comp = comp;

    this._buildWind();
    this._buildLeaves();
    this._buildFire();
    this._buildDrone();
    this._scheduleBirds();
    this._scheduleCrickets();
    this._scheduleOwls();

    master.gain.setTargetAtTime(this.enabled ? 0.72 : 0, ctx.currentTime, 2.0);
    this.started = true;
  }

  _buildWind() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer(6, true);
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    lp.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    // slow gusts
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.045;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain).connect(lp.frequency);
    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.027;
    const lfo2Gain = ctx.createGain();
    lfo2Gain.gain.value = 0.18;
    lfo2.connect(lfo2Gain).connect(g.gain);
    const pan = ctx.createStereoPanner();
    pan.pan.value = -0.15;
    src.connect(lp).connect(g).connect(pan).connect(this.master);
    src.start();
    lfo.start(); lfo2.start();
    this._wind = { src, g, lp };
  }

  _buildLeaves() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer(4, false);
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2400;
    bp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.value = 0.02;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.014;
    lfo.connect(lfoGain).connect(g.gain);
    const pan = ctx.createStereoPanner();
    pan.pan.value = 0.25;
    src.connect(bp).connect(g).connect(pan).connect(this.master);
    src.start(); lfo.start();
    this._leaves = { src, g, bp };
  }

  _buildFire() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer(2, true);
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.value = 0.012;
    src.connect(hp).connect(g).connect(this.master);
    src.start();
    this._fire = { src, g };
  }

  _buildDrone() {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 0.035;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    lp.Q.value = 0.5;
    const freqs = [55, 82.41, 110, 164.81];
    const oscs = freqs.map((f, i) => {
      const o = ctx.createOscillator();
      o.type = i < 2 ? 'sine' : 'triangle';
      o.frequency.value = f * (1 + (i - 1.5) * 0.0009);
      const og = ctx.createGain();
      og.gain.value = i === 0 ? 0.5 : i === 1 ? 0.28 : 0.12;
      const l = ctx.createOscillator();
      l.frequency.value = 0.03 + i * 0.017;
      const lg = ctx.createGain();
      lg.gain.value = og.gain.value * 0.5;
      l.connect(lg).connect(og.gain);
      o.connect(og).connect(lp);
      o.start(); l.start();
      return o;
    });
    // very slow filter movement
    const fl = ctx.createOscillator();
    fl.frequency.value = 0.02;
    const fg = ctx.createGain();
    fg.gain.value = 150;
    fl.connect(fg).connect(lp.frequency);
    fl.start();
    lp.connect(g).connect(this.master);
    this._drone = { g, lp, oscs };
  }

  _birdChirp() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const pan = ctx.createStereoPanner();
    pan.pan.value = clamp(this._rand() * 1.6 - 0.8, -0.85, 0.85);
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(pan).connect(this.master);
    const notes = 2 + Math.floor(this._rand() * 4);
    const base = 2400 + this._rand() * 1800;
    for (let i = 0; i < notes; i++) {
      const t = t0 + i * (0.075 + this._rand() * 0.06);
      const o = ctx.createOscillator();
      o.type = 'sine';
      const f0 = base * (0.85 + this._rand() * 0.4);
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * (1.12 + this._rand() * 0.3), t + 0.06);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.92, t + 0.1);
      const eg = ctx.createGain();
      eg.gain.setValueAtTime(0, t);
      eg.gain.linearRampToValueAtTime(0.045 + this._rand() * 0.03, t + 0.012);
      eg.gain.exponentialRampToValueAtTime(0.0004, t + 0.13);
      o.connect(eg).connect(g);
      o.start(t);
      o.stop(t + 0.16);
    }
  }

  _cricket() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.05;
    const pan = ctx.createStereoPanner();
    pan.pan.value = this._rand() * 1.7 - 0.85;
    const base = 3600 + this._rand() * 900;
    const g = ctx.createGain();
    g.gain.value = 1;
    g.connect(pan).connect(this.master);
    const pulses = 3 + Math.floor(this._rand() * 3);
    for (let i = 0; i < pulses; i++) {
      const t = t0 + i * 0.075;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = base;
      const eg = ctx.createGain();
      eg.gain.setValueAtTime(0.0, t);
      eg.gain.linearRampToValueAtTime(0.010, t + 0.008);
      eg.gain.exponentialRampToValueAtTime(0.0003, t + 0.05);
      o.connect(eg).connect(g);
      o.start(t);
      o.stop(t + 0.07);
    }
  }

  _owl() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.1;
    const o = ctx.createOscillator();
    o.type = 'sine';
    const f = 300 + this._rand() * 60;
    o.frequency.setValueAtTime(f, t0);
    o.frequency.linearRampToValueAtTime(f * 0.92, t0 + 0.5);
    const eg = ctx.createGain();
    eg.gain.setValueAtTime(0, t0);
    eg.gain.linearRampToValueAtTime(0.035, t0 + 0.08);
    eg.gain.linearRampToValueAtTime(0.025, t0 + 0.35);
    eg.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.75);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const pan = ctx.createStereoPanner();
    pan.pan.value = this._rand() - 0.5;
    o.connect(lp).connect(eg).connect(pan).connect(this.master);
    o.start(t0);
    o.stop(t0 + 0.8);
  }

  _schedule(fn, min, max) {
    const run = () => {
      if (!this.started) return;
      if (this.enabled) fn.call(this);
      const delay = (min + Math.random() * (max - min)) * 1000;
      this.timers.push(setTimeout(run, delay));
    };
    this.timers.push(setTimeout(run, (min + Math.random() * (max - min)) * 1000));
  }

  _scheduleBirds() { this._schedule(this._birdChirp, 6, 18); }
  _scheduleCrickets() { this._schedule(this._cricket, 1.4, 4.2); }
  _scheduleOwls() { this._schedule(this._owl, 26, 60); }

  setEnabled(on) {
    this.enabled = on;
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(on ? 0.72 : 0.0, this.ctx.currentTime, 0.5);
  }

  toggle() {
    if (!this.started) { this.start(); return true; }
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  // one-shot UI click for shot changes — very soft
  whoosh() {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer(1.4, true);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(420, t);
    bp.frequency.exponentialRampToValueAtTime(1400, t + 1.1);
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 1.2);
    const pan = ctx.createStereoPanner();
    pan.pan.value = this._rand() - 0.5;
    src.connect(bp).connect(g).connect(pan).connect(this.master);
    src.start(t);
    src.stop(t + 1.3);
  }
}
