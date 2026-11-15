/* Champ Spotter — WebAudio synth sound, lake ambience, a calm music loop, haptics. No audio files. */
(function () {
  'use strict';

  const Snd = {
    ctx: null, master: null, sfxGain: null, musicGain: null, ambGain: null,
    sfxOn: true, musicOn: true, started: false,
    _noise: null, _timer: null, _next: 0, _step: 0, _amb: null, mood: 0,

    load() {
      try {
        const s = JSON.parse(localStorage.getItem('champspotter.audio') || '{}');
        if (typeof s.sfx === 'boolean') this.sfxOn = s.sfx;
        if (typeof s.music === 'boolean') this.musicOn = s.music;
      } catch (e) { /* ignore */ }
    },
    save() {
      try { localStorage.setItem('champspotter.audio', JSON.stringify({ sfx: this.sfxOn, music: this.musicOn })); } catch (e) { /* ignore */ }
    },

    // Must run inside a user gesture (iOS).
    unlock() {
      try {
        if (!this.ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return;
          const c = this.ctx = new AC();
          this.master = c.createGain(); this.master.gain.value = 0.9;
          const comp = c.createDynamicsCompressor();
          this.master.connect(comp); comp.connect(c.destination);
          this.sfxGain = c.createGain(); this.sfxGain.gain.value = this.sfxOn ? 0.85 : 0;
          this.musicGain = c.createGain(); this.musicGain.gain.value = this.musicOn ? 0.5 : 0;
          this.ambGain = c.createGain(); this.ambGain.gain.value = this.sfxOn ? 0.5 : 0;
          this.sfxGain.connect(this.master); this.musicGain.connect(this.master); this.ambGain.connect(this.master);
          const len = c.sampleRate * 2;
          this._noise = c.createBuffer(1, len, c.sampleRate);
          const d = this._noise.getChannelData(0);
          let b = 0;
          for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = (b + 0.04 * w) / 1.04; d[i] = w * 0.55 + b * 6; }
        }
        // iOS 16.4+: play through the ringer/silent switch like a game, not like a notification
        try { if (navigator.audioSession && navigator.audioSession.type !== 'playback') navigator.audioSession.type = 'playback'; } catch (e) { /* older iOS */ }
        if (this.ctx.state !== 'running') this.ctx.resume();
        this.started = true;
        this.startAmbience();
        this.startMusic();
      } catch (e) { /* audio unavailable */ }
    },
    suspend() { try { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); } catch (e) { /* */ } },
    resume() { try { if (this.ctx && this.ctx.state !== 'running' && this.started) this.ctx.resume(); } catch (e) { /* */ } },
    setSfx(on) { this.sfxOn = on; if (this.sfxGain) this.sfxGain.gain.value = on ? 0.85 : 0; if (this.ambGain) this.ambGain.gain.value = on ? 0.5 : 0; this.save(); }, // lake ambience follows SOUND
    setMusic(on) { this.musicOn = on; if (this.musicGain) this.musicGain.gain.value = on ? 0.5 : 0; this.save(); },

    tone(freq, dur, type, vol, slideTo, delay, dest, vib) {
      if (!this.ctx) return;
      if (!dest && !this.sfxOn) return;
      const t0 = this.ctx.currentTime + (delay || 0);
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
      if (vib) {
        const l = this.ctx.createOscillator(), lg = this.ctx.createGain();
        l.frequency.value = vib[0]; lg.gain.value = vib[1]; l.connect(lg); lg.connect(o.frequency); l.start(t0); l.stop(t0 + dur + 0.05);
      }
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(dest || this.sfxGain);
      o.start(t0); o.stop(t0 + dur + 0.05);
    },
    noise(dur, vol, f0, type, delay, f1, q) {
      if (!this.ctx || !this.sfxOn) return;
      const t0 = this.ctx.currentTime + (delay || 0);
      const s = this.ctx.createBufferSource(); s.buffer = this._noise;
      const f = this.ctx.createBiquadFilter(); f.type = type || 'highpass';
      f.frequency.setValueAtTime(f0 || 2000, t0);
      if (f1) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
      if (q) f.Q.value = q;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + Math.min(0.02, dur * 0.3));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      s.connect(f); f.connect(g); g.connect(this.sfxGain);
      s.start(t0, Math.random() * 1.2); s.stop(t0 + dur + 0.05);
    },

    // ---- effects ----
    shutter() {
      this.noise(0.035, 0.32, 3500, 'highpass');
      this.tone(2200, 0.04, 'square', 0.07, 700);
      this.noise(0.05, 0.25, 1500, 'bandpass', 0.07, null, 2);
      this.tone(380, 0.07, 'triangle', 0.16, 120, 0.07);
    },
    develop() { this.noise(0.55, 0.05, 700, 'bandpass', 0.12, 2600, 3); },
    star(i, big, streak) {
      const ladder = [0, 4, 7, 12, 16];
      // the whole ladder climbs a step with each photo in the streak
      const f = 587.33 * Math.pow(2, (ladder[Math.min(4, i)] + 2 * Math.max(0, (streak || 0) - 1)) / 12);
      this.tone(f, 0.28, 'triangle', 0.2); this.tone(f * 2, 0.18, 'sine', 0.07);
      if (big) this.tone(f * 3, 0.3, 'sine', 0.05, null, 0.03);
    },
    perfect() { [0, 4, 7, 12, 16, 19].forEach((s, i) => this.tone(659.25 * Math.pow(2, s / 12), 0.35, 'triangle', 0.17, null, i * 0.07)); },
    ting() { this.tone(2637, 0.22, 'sine', 0.05); this.tone(3951, 0.16, 'sine', 0.03, null, 0.04); },
    // mastery cues: a bright two-note "style" chime, a medal fanfare, and an encore swell (all in phone-speaker range)
    style(n) { const f = 880 * Math.pow(2, Math.min(3, n || 0) * 2 / 12); this.tone(f, 0.22, 'triangle', 0.16); this.tone(f * 1.5, 0.3, 'sine', 0.1, null, 0.08); },
    medal() { [0, 4, 7, 12, 16].forEach((s, i) => this.tone(523.25 * Math.pow(2, s / 12), 0.4, 'triangle', 0.15, null, i * 0.075)); this.tone(2093, 0.5, 'sine', 0.05, null, 0.4); },
    encore() { this.tone(330, 0.5, 'sawtooth', 0.05, 660); [0, 5, 9].forEach((s, i) => this.tone(659.25 * Math.pow(2, s / 12), 0.28, 'triangle', 0.13, null, 0.15 + i * 0.09)); },
    stamp() { this.noise(0.07, 0.32, 1400, 'lowpass'); this.tone(260, 0.11, 'triangle', 0.22, 150); this.tone(520, 0.05, 'square', 0.04, 300); },
    tick(i) { this.tone(1200 + (i % 8) * 40, 0.03, 'triangle', 0.05); },
    meh() { this.tone(330, 0.2, 'sine', 0.12, 280); },
    splash(size) {
      size = size || 1;
      this.noise(0.28 + 0.25 * size, 0.12 + 0.12 * size, 3200, 'bandpass', 0, 700, 0.8);
      this.noise(0.5 + 0.3 * size, 0.1 * size, 600, 'lowpass', 0.02);
      if (size > 1.2) { this.tone(150, 0.35, 'triangle', 0.22, 85); this.tone(300, 0.2, 'sine', 0.08, 170); } // big splash, pitched for phone speakers
    },
    plop() { this.tone(620, 0.12, 'sine', 0.13, 190); this.noise(0.16, 0.07, 1800, 'bandpass', 0.02, 600, 1.2); }, // he ducks under after a good photo
    film() { this.tone(1320, 0.06, 'triangle', 0.08); this.tone(1760, 0.09, 'triangle', 0.07, null, 0.06); }, // a frame lands back in the camera
    ripple() { this.tone(210, 0.5, 'sine', 0.05, 330); this.tone(340, 0.35, 'sine', 0.03, 480, 0.12); },
    whoosh() { this.noise(0.5, 0.18, 400, 'bandpass', 0, 2400, 1.5); },
    decoy(kind) {
      if (kind === 'duck') { this.tone(1100, 0.09, 'square', 0.1, 1700); this.tone(1500, 0.1, 'square', 0.09, 900, 0.11); return; }
      this.tone(311, 0.22, 'sawtooth', 0.11, 260); this.tone(262, 0.34, 'sawtooth', 0.11, 190, 0.2);
    },
    loon() { this.tone(520, 0.9, 'sine', 0.07, 780, 0, null, [7, 14]); this.tone(790, 0.7, 'sine', 0.05, 620, 0.5, null, [8, 18]); },
    blip() { this.tone(900, 0.05, 'triangle', 0.1, 1200); },
    noFilm() { this.tone(200, 0.18, 'square', 0.08, 150); },
    cheese() { this.tone(880, 0.07, 'triangle', 0.1); this.tone(1175, 0.1, 'triangle', 0.1, null, 0.08); },
    click() { this.tone(660, 0.05, 'triangle', 0.1, 880); },
    clear() { [0, 4, 7, 12, 7, 12, 16].forEach((s, i) => this.tone(523.25 * Math.pow(2, s / 12), 0.3, 'triangle', 0.16, null, i * 0.11)); },
    fail() { [0, -2, -4, -7].forEach((s, i) => this.tone(392 * Math.pow(2, s / 12), 0.34, 'sawtooth', 0.08, null, i * 0.18)); },
    rare() { [0, 7, 12, 19].forEach((s, i) => this.tone(784 * Math.pow(2, s / 12), 0.4, 'sine', 0.14, null, i * 0.09)); this.tone(2093, 0.5, 'sine', 0.04, null, 0.35); },
    page() { this.noise(0.12, 0.07, 1200, 'bandpass', 0, 3000, 1); },

    // ---- ambience: slow lapping water ----
    startAmbience() {
      if (this._amb || !this.ctx) return;
      const c = this.ctx;
      const s = c.createBufferSource(); s.buffer = this._noise; s.loop = true;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 520;
      const g = c.createGain(); g.gain.value = 0.05;
      const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 0.13; lg.gain.value = 0.03;
      l.connect(lg); lg.connect(g.gain); l.start();
      s.connect(f); f.connect(g); g.connect(this.ambGain); s.start();
      // a second, brighter band of lapping water (phone speakers drop most of the low rumble)
      const s2 = c.createBufferSource(); s2.buffer = this._noise; s2.loop = true; s2.playbackRate.value = 0.9;
      const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1300; f2.Q.value = 0.8;
      const g2 = c.createGain(); g2.gain.value = 0.018;
      const l2 = c.createOscillator(), lg2 = c.createGain(); l2.frequency.value = 0.21; lg2.gain.value = 0.014;
      l2.connect(lg2); lg2.connect(g2.gain); l2.start();
      s2.connect(f2); f2.connect(g2); g2.connect(this.ambGain); s2.start(0, 0.7);
      this._amb = { s, g, s2 };
    },
    // ---- music: a small arranged song (16 bars: A then B), one key/mode/tempo per lighting.
    // Layers: soft pad on each chord, bass on the beat, plucked melody, quiet shaker, and a "something's coming" pulse
    // whose level the game sets in Snd.tension (0..1) while Champ surfaces.
    tension: 0, _moodKey: 'morning', _moodNext: 'morning',
    MOODS: {
      morning:  { root: 220.00, maj: true,  bpm: 84, shaker: 0.6 },
      noon:     { root: 246.94, maj: true,  bpm: 94, shaker: 1 },
      golden:   { root: 207.65, maj: true,  bpm: 78, shaker: 0.5 },
      overcast: { root: 196.00, maj: false, bpm: 80, shaker: 0.5 },
      dusk:     { root: 185.00, maj: false, bpm: 70, shaker: 0.3 },
      night:    { root: 174.61, maj: false, bpm: 64, shaker: 0 },
      sunset:   { root: 233.08, maj: true,  bpm: 74, shaker: 0.4 },
    },
    setLight(name) { if (this.MOODS[name]) this._moodNext = name; this.mood = this.MOODS[this._moodNext].maj ? 0 : 1; },
    startMusic() {
      if (this._timer || !this.ctx) return;
      this._next = this.ctx.currentTime + 0.2; this._step = 0; this._moodKey = this._moodNext;
      this._timer = setInterval(() => this._sched(), 90);
    },
    _sched() {
      const c = this.ctx; if (!c || c.state !== 'running') return;
      if (this._next < c.currentTime - 1) this._next = c.currentTime + 0.05; // after a suspend, don't machine-gun missed notes
      while (this._next < c.currentTime + 0.35) {
        if (this._step % 16 === 0 && this._moodKey !== this._moodNext) { this._moodKey = this._moodNext; this._step = 0; }
        const M = this.MOODS[this._moodKey], spb = 60 / M.bpm / 2; // eighth notes
        this._note(this._step, this._next, M, spb); this._next += spb; this._step++;
        if (this._step % 128 === 0) this._pass = (this._pass || 0) + 1; // every trip round the 16 bars plays a variation
      }
    },
    _note(step, t, M, spb) {
      const c = this.ctx, out = this.musicGain;
      const mk = (f, dur, vol, type, att) => {
        const o = c.createOscillator(), g = c.createGain();
        o.type = type; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + (att || 0.012)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
      };
      const hz = (semi, oct) => M.root * Math.pow(2, oct + semi / 12);
      // chords: two bars each; A = I vi IV V (major) / i VI III VII (minor); B = IV I ii V / iv i VI v
      const CH = M.maj
        ? [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14], [5, 9, 12], [0, 4, 7], [2, 5, 9], [7, 11, 14]]
        : [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17], [5, 8, 12], [0, 3, 7], [8, 12, 15], [7, 10, 14]];
      const bar = Math.floor(step / 8) % 16, beat8 = step % 8, chord = CH[Math.floor(bar / 2)];
      const secB = bar >= 8;
      // pad: slow swell at each chord change
      if (beat8 === 0 && bar % 2 === 0) chord.forEach((n, i) => { mk(hz(n, 0), spb * 16, 0.026 - i * 0.004, 'sine', 0.7); mk(hz(n, 0) * 1.003, spb * 16, 0.012, 'triangle', 0.9); }); // pad in phone range, lightly detuned
      // bass: root on beat 1, fifth or root on beat 3, a walk-up into the next chord on the last eighth of odd bars
      const bass = (semi, dur, vol) => { mk(hz(semi, -1), dur, vol, 'triangle'); mk(hz(semi, 0), dur * 0.6, vol * 0.28, 'sine'); }; // octave on top so phone speakers carry it
      if (beat8 === 0) bass(chord[0], spb * 3, 0.1);
      else if (beat8 === 4) bass(bar % 2 ? chord[2] - 12 : chord[0], spb * 2.5, 0.07);
      else if (beat8 === 7 && bar % 2 === 1) bass(CH[(Math.floor(bar / 2) + 1) % 8][0] - 1, spb * 0.9, 0.045);
      // melody: hand-written motifs in the key, built on each chord's degree (diatonic, so it never wanders out of key)
      const KEY = M.maj ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
      const DEG = M.maj ? [0, 5, 3, 4, 3, 0, 1, 4] : [0, 5, 2, 6, 3, 0, 5, 4];
      const R_ = -9, MOT = secB
        ? [[7, R_, R_, 4, R_, 5, 4, R_], [2, R_, 4, R_, R_, 2, 0, R_], [4, 5, 7, R_, 5, R_, 4, R_], [2, R_, 1, R_, 0, R_, R_, R_]]
        : [[0, R_, 2, R_, 4, R_, 2, R_], [4, R_, 5, 4, 2, R_, R_, R_], [0, 2, 4, R_, 7, R_, 4, R_], [4, R_, 2, R_, 1, R_, 0, R_]];
      const pass = this._pass || 0, mrow = MOT[(bar + (pass % 2) * 2) % 4]; // odd passes swap the motif pairs
      const mi = pass % 3 === 2 && beat8 % 2 === 1 ? R_ : mrow[beat8]; // every third pass thins to a calmer half-time line
      if (mi !== R_ && !(bar % 8 === 7 && beat8 > 3)) { // breathe at the end of each section
        const deg = DEG[Math.floor(bar / 2)] + mi, semi = KEY[((deg % 7) + 7) % 7] + 12 * Math.floor(deg / 7);
        const strong = beat8 % 4 === 0, f = hz(semi, 1);
        // section A: soft triangle; section B: a warmer filtered-saw pluck, so the halves feel different
        if (secB) this._pluck(t, f, spb * (strong ? 2.6 : 1.6), strong ? 0.07 : 0.05);
        else { mk(f, spb * (strong ? 3 : 1.8), strong ? 0.075 : 0.055, 'triangle'); mk(f * 2, spb * 1.2, 0.012, 'sine'); }
      }
      // a soft bell to mark the top of each section
      if (step % 64 === 0) { mk(hz(chord[2], 2), spb * 6, 0.025, 'sine', 0.02); mk(hz(chord[0], 2), spb * 6, 0.018, 'sine', 0.02); }
      // shaker on the off-beats (day moods), plus the surfacing pulse
      if (beat8 % 2 === 1 && M.shaker > 0 && this._noise) this._shake(t, 0.018 * M.shaker * (beat8 === 3 || beat8 === 7 ? 1.3 : 1));
      if (this.tension > 0.05 && beat8 % 2 === 0) {
        const v = 0.16 * this.tension;
        const o = c.createOscillator(), g = c.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(115, t + 0.18); // a heartbeat phones can play
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.3);
      }
    },
    _pluck(t, f, dur, vol) {
      const c = this.ctx, o = c.createOscillator(), fl = c.createBiquadFilter(), g = c.createGain();
      o.type = 'sawtooth'; o.frequency.value = f; fl.type = 'lowpass'; fl.Q.value = 2;
      fl.frequency.setValueAtTime(f * 6, t); fl.frequency.exponentialRampToValueAtTime(f * 1.2, t + dur * 0.8);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * 0.7, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(fl); fl.connect(g); g.connect(this.musicGain); o.start(t); o.stop(t + dur + 0.05);
    },
    _shake(t, vol) {
      const c = this.ctx, s = c.createBufferSource(); s.buffer = this._noise;
      const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6500;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      s.connect(f); f.connect(g); g.connect(this.musicGain); s.start(t, Math.random() * 1.5); s.stop(t + 0.08);
    },
  };

  window.Snd = Snd;
  window.buzz = function (ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* */ } };
})();
