/* Champ Spotter — all art is code-drawn right now (see IMAGE-PROMPTS.md for the painted-art plan).
   Drop-in PNGs: set ASSETS[key].src (a string); anything missing falls back to the code-drawn version. */
(function () {
  'use strict';
  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      r = Math.min(Array.isArray(r) ? r[0] : (r || 0), w / 2, h / 2);
      this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r); this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath();
    };
  }
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const sm = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const easeOut = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
  const easeIn = (x) => Math.pow(clamp(x, 0, 1), 3);

  function srand(seed) {
    let s = (seed * 2654435761) >>> 0 || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s % 100000) / 100000; };
  }

  // ---------- lighting palettes ----------
  const LIGHTS = {
    morning:  { skyTop: '#86c3e8', skyBot: '#fde2c4', sun: [0.74, 38, 26, '#fff4d2'], glow: 'rgba(255,236,190,', mtn: ['#aac0d8', '#86a3c4', '#678cae'], shore: '#3f6f6a', wTop: '#86c9d6', wBot: '#1f6f8f', shim: '255,255,240', cloud: '255,250,240', tint: null, lamps: false, stars: false },
    noon:     { skyTop: '#4fb0e8', skyBot: '#cdeefb', sun: [0.28, 120, 22, '#ffffff'], glow: 'rgba(255,255,255,', mtn: ['#9ab8d8', '#7aa0c6', '#5a86b0'], shore: '#3a6e5f', wTop: '#59b8d2', wBot: '#136487', shim: '255,255,255', cloud: '255,255,255', tint: null, lamps: false, stars: false },
    golden:   { skyTop: '#6ea5d6', skyBot: '#ffd29a', sun: [0.24, 26, 34, '#ffe6a2'], glow: 'rgba(255,210,130,', mtn: ['#bfa6c2', '#9484b0', '#6c6694'], shore: '#4a5a58', wTop: '#f1bb86', wBot: '#2e6a88', shim: '255,236,180', cloud: '255,225,190', tint: 'rgba(255,160,70,0.07)', lamps: false, stars: false },
    overcast: { skyTop: '#92a6b3', skyBot: '#d6dfe4', sun: null, glow: 'rgba(255,255,255,', mtn: ['#8a9cac', '#6f8497', '#566d80'], shore: '#41585a', wTop: '#789aa8', wBot: '#2a4a5d', shim: '235,245,250', cloud: '215,224,230', tint: 'rgba(70,95,115,0.10)', lamps: false, stars: false },
    dusk:     { skyTop: '#3a2f6e', skyBot: '#f28b6b', sun: [0.5, 2, 30, '#ffb470'], glow: 'rgba(255,150,100,', mtn: ['#5a4a85', '#42386d', '#2d2656'], shore: '#2a2a4a', wTop: '#7a62a0', wBot: '#18284e', shim: '255,190,150', cloud: '255,170,150', tint: 'rgba(40,20,90,0.12)', lamps: true, stars: true },
    night:    { skyTop: '#0a1032', skyBot: '#2a4478', sun: [0.7, 150, 22, '#f6f2d6'], glow: 'rgba(210,225,255,', mtn: ['#1c2850', '#141d40', '#0d1432'], shore: '#0a1228', wTop: '#223f6e', wBot: '#06122a', shim: '215,230,255', cloud: '70,90,140', tint: 'rgba(5,10,45,0.18)', lamps: true, stars: true },
    sunset:   { skyTop: '#5d4796', skyBot: '#ffb06a', sun: [0.5, 4, 40, '#ffe3a0'], glow: 'rgba(255,170,90,', mtn: ['#8a5c8a', '#664577', '#46316a'], shore: '#33284d', wTop: '#ff9d6c', wBot: '#2b3f7c', shim: '255,215,150', cloud: '255,190,140', tint: 'rgba(255,110,50,0.08)', lamps: true, stars: false },
  };

  // ---------- painted-art drop-in map ----------
  const ASSETS = {};
  ['bg_morning', 'bg_noon', 'bg_golden', 'bg_overcast', 'bg_dusk', 'bg_night', 'bg_sunset', 'boardwalk',
   'champ_head', 'champ_hump', 'duck', 'log', 'loon', 'swimmer', 'kayak', 'sailboat', 'wavecrest',
   'tourist_0', 'tourist_1', 'tourist_2', 'tourist_3', 'polaroid_frame'].forEach(k => { ASSETS[k] = { src: null, img: null, ok: false }; });
  function loadAssets() {
    Object.keys(ASSETS).forEach(k => {
      const a = ASSETS[k];
      if (!a.src || a.img) return;
      a.img = new Image(); a.img.onload = () => { a.ok = true; }; a.img.src = a.src;
    });
  }
  function asset(k) { const a = ASSETS[k]; return a && a.ok ? a.img : null; }

  // ---------- geometry of the current layout ----------
  const G = { W: 360, H: 780, HY: 234, BY: 668, k: 1, land: false };
  function setup(W, H, k, land) {
    G.W = W; G.H = H; G.k = k; G.land = land;
    G.HY = Math.round(H * 0.30);
    G.BY = H - (land ? 74 : 112);
    cache.clear(); boardCache = null; fogTex = null; reedCache = null;
  }
  const depthScale = (y) => lerp(0.46, 1.04, clamp((y - G.HY) / (G.BY - G.HY), 0, 1));

  // ---------- helpers ----------
  function mk(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  function ridge(ctx, W, y0, amp, seed, freq, fill, base) {
    const r = srand(seed), ph = [r() * 6, r() * 6, r() * 6, r() * 6];
    ctx.beginPath(); ctx.moveTo(0, base);
    for (let x = 0; x <= W + 4; x += 4) {
      const t = x / W;
      const h = Math.sin(t * freq * 3.1 + ph[0]) * 0.5 + Math.sin(t * freq * 7.3 + ph[1]) * 0.28 + Math.sin(t * freq * 15 + ph[2]) * 0.14 + Math.sin(t * freq * 31 + ph[3]) * 0.06;
      ctx.lineTo(x, y0 - amp * (0.55 + h));
    }
    ctx.lineTo(W + 4, base); ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  }

  // ---------- static scene (sky, mountains, shore, water base) ----------
  const cache = new Map();
  function buildScene(name) {
    const L = LIGHTS[name] || LIGHTS.morning;
    const { W, H, HY, k } = G;
    const bg = mk(W * k, H * k), c = bg.getContext('2d'); c.scale(k, k);
    // sky
    let g = c.createLinearGradient(0, 0, 0, HY + 4); g.addColorStop(0, L.skyTop); g.addColorStop(1, L.skyBot);
    c.fillStyle = g; c.fillRect(0, 0, W, HY + 4);
    if (L.stars) {
      const r = srand(7);
      for (let i = 0; i < 70; i++) { c.globalAlpha = 0.25 + r() * 0.6; c.fillStyle = '#fff'; c.beginPath(); c.arc(r() * W, r() * HY * 0.75, 0.5 + r() * 0.9, 0, TAU); c.fill(); }
      c.globalAlpha = 1;
    }
    // sun / moon with glow
    let sx = -999, sy = -999;
    if (L.sun) {
      sx = L.sun[0] * W; sy = HY - L.sun[1] - (name === 'night' ? 0 : 0); const sr = L.sun[2];
      g = c.createRadialGradient(sx, sy, 0, sx, sy, sr * 5); g.addColorStop(0, L.glow + '0.65)'); g.addColorStop(0.35, L.glow + '0.22)'); g.addColorStop(1, L.glow + '0)');
      c.fillStyle = g; c.fillRect(0, 0, W, HY + 4);
      c.fillStyle = L.sun[3]; c.beginPath(); c.arc(sx, sy, sr, 0, TAU); c.fill();
      if (name === 'night') { c.fillStyle = 'rgba(150,160,190,0.35)'; [[-6, -4, 5], [5, 5, 4], [3, -8, 3]].forEach(a => { c.beginPath(); c.arc(sx + a[0], sy + a[1], a[2], 0, TAU); c.fill(); }); }
    }
    // mountains: three layers, far to near
    const mh = [HY * 0.30, HY * 0.24, HY * 0.15], my = [HY - 4, HY - 2, HY];
    for (let i = 0; i < 3; i++) {
      ridge(c, W, my[i] - (i === 0 ? 18 : i === 1 ? 6 : 0), mh[i], 11 + i * 7, 1.4 + i * 0.5, L.mtn[i], HY + 2);
      if (i < 2) { // mist at the foot of each ridge
        g = c.createLinearGradient(0, HY - 40, 0, HY + 2); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,245,235,' + (0.22 - i * 0.06) + ')');
        c.fillStyle = g; c.fillRect(0, HY - 40, W, 42);
      }
    }
    // far shore: tree line + breakwater lighthouse
    const r = srand(33); c.fillStyle = L.shore;
    c.beginPath(); c.moveTo(0, HY + 1);
    for (let x = 0; x <= W; x += 3) c.lineTo(x, HY - 3 - r() * 4 - Math.sin(x * 0.05) * 1.5);
    c.lineTo(W, HY + 1); c.closePath(); c.fill();
    const lx = W * (G.land ? 0.84 : 0.8), ly = HY + 3;
    c.fillStyle = 'rgba(70,70,80,0.9)'; c.fillRect(lx - 34, ly - 1, 60, 3);
    c.fillStyle = '#f4efe6'; c.beginPath(); c.moveTo(lx - 3, ly - 1); c.lineTo(lx - 2, ly - 12); c.lineTo(lx + 2, ly - 12); c.lineTo(lx + 3, ly - 1); c.fill();
    c.fillStyle = '#c93b36'; c.fillRect(lx - 2.6, ly - 15, 5.2, 3.4); c.fillRect(lx - 0.6, ly - 17, 1.2, 2);
    // water
    g = c.createLinearGradient(0, HY, 0, H); g.addColorStop(0, L.wTop); g.addColorStop(1, L.wBot);
    c.fillStyle = g; c.fillRect(0, HY, W, H - HY);
    // mountain reflection
    const rf = mk(W * k, HY * k), rc = rf.getContext('2d');
    rc.translate(0, HY * k); rc.scale(1, -1); rc.drawImage(bg, 0, 0, W * k, HY * k, 0, 0, W * k, HY * k);
    rc.setTransform(1, 0, 0, 1, 0, 0); rc.globalCompositeOperation = 'destination-in';
    g = rc.createLinearGradient(0, 0, 0, HY * k * 0.6); g.addColorStop(0, 'rgba(0,0,0,0.42)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    rc.fillStyle = g; rc.fillRect(0, 0, W * k, HY * k);
    c.drawImage(rf, 0, 0, W * k, HY * k, 0, HY, W, HY);
    // glitter path under the sun
    if (L.sun && sx > -900) {
      g = c.createLinearGradient(0, HY, 0, H); g.addColorStop(0, L.glow + '0.45)'); g.addColorStop(1, L.glow + '0)');
      c.save(); c.beginPath(); c.moveTo(sx - 8, HY); c.lineTo(sx + 8, HY); c.lineTo(sx + 80, H); c.lineTo(sx - 80, H); c.closePath(); c.clip();
      c.fillStyle = g; c.fillRect(0, HY, W, H - HY); c.restore();
    }
    // horizon haze
    g = c.createLinearGradient(0, HY - 6, 0, HY + 34); g.addColorStop(0, 'rgba(255,255,255,0.28)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, HY - 6, W, 40);
    // cloud strip (wraps horizontally)
    const cw = W * 2, cl = mk(cw * k, HY * 0.8 * k), cc = cl.getContext('2d'); cc.scale(k, k);
    const cr = srand(91);
    for (let i = 0; i < 9; i++) {
      const cx = (i + cr() * 0.6) * (cw / 9), cy = 10 + cr() * HY * 0.45, cwid = 50 + cr() * 70;
      for (let j = 0; j < 7; j++) {
        const px = cx + (j - 3) * cwid * 0.16, py = cy + Math.sin(j * 1.7) * 3, rr = cwid * (0.16 + 0.1 * Math.sin(j * 1.3 + 1));
        const cg = cc.createRadialGradient(px, py, 0, px, py, rr); cg.addColorStop(0, 'rgba(' + L.cloud + ',0.85)'); cg.addColorStop(1, 'rgba(' + L.cloud + ',0)');
        cc.fillStyle = cg; cc.fillRect(px - rr, py - rr, rr * 2, rr * 2);
      }
    }
    const o = { bg, clouds: cl, cw, L, sx };
    return o;
  }
  function scene(name) {
    let o = cache.get(name);
    if (!o) { if (cache.size > 3) cache.clear(); o = buildScene(name); cache.set(name, o); }
    return o;
  }

  // ---------- fog texture ----------
  let fogTex = null;
  function fogTexture() {
    if (fogTex) return fogTex;
    const { W, H, HY, BY, k } = G;
    const fk = k * 0.5, f = mk(W * 2 * fk, (BY - HY + 60) * fk), c = f.getContext('2d'); c.scale(fk, fk);
    const r = srand(5);
    for (let i = 0; i < 26; i++) {
      const x = r() * W * 2, y = r() * (BY - HY + 60), rr = 50 + r() * 90;
      const g = c.createRadialGradient(x, y, 0, x, y, rr); g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(x - rr, y - rr, rr * 2, rr * 2);
      c.fillRect(x - rr - W * 2, y - rr, rr * 2, rr * 2); c.fillRect(x - rr + W * 2, y - rr, rr * 2, rr * 2); // wrap both ways: seamless tile
    }
    // feather the top and bottom so the moving blobs never show a straight edge
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'destination-in';
    const fh = f.height, fg = c.createLinearGradient(0, 0, 0, fh);
    fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(0.18, 'rgba(0,0,0,1)'); fg.addColorStop(0.85, 'rgba(0,0,0,1)'); fg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = fg; c.fillRect(0, 0, f.width, fh); c.globalCompositeOperation = 'source-over';
    fogTex = f; return f;
  }

  // ---------- boardwalk (static layer) ----------
  let boardCache = null;
  function board() {
    if (boardCache) return boardCache;
    const { W, H, BY, k } = G;
    const bh = H - BY + 30, cv = mk(W * k, bh * k), c = cv.getContext('2d'); c.scale(k, k);
    const top = 30; // canvas y of BY
    // deck
    let g = c.createLinearGradient(0, top + 14, 0, bh); g.addColorStop(0, '#8a6a47'); g.addColorStop(1, '#5a4129');
    c.fillStyle = g; c.fillRect(0, top + 12, W, bh);
    const r = srand(12);
    for (let y = top + 14, i = 0; y < bh; y += 11 + i * 1.6, i++) {
      c.fillStyle = 'rgba(0,0,0,0.28)'; c.fillRect(0, y, W, 1.4);
      c.fillStyle = 'rgba(255,225,170,0.07)'; c.fillRect(0, y + 1.6, W, 2.5);
      for (let x = r() * 60; x < W; x += 50 + r() * 90) { c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(x, y + 1.5, 1.4, 9 + i); }
    }
    for (let i = 0; i < 90; i++) { c.fillStyle = 'rgba(' + (r() > 0.5 ? '0,0,0' : '255,230,180') + ',0.05)'; c.fillRect(r() * W, top + 14 + r() * (bh - top), 18 + r() * 40, 1.2); }
    // railing
    c.fillStyle = 'rgba(0,0,0,0.22)'; c.fillRect(0, top + 12, W, 6);
    for (let x = 14; x < W; x += 54) {
      g = c.createLinearGradient(x - 5, 0, x + 5, 0); g.addColorStop(0, '#d9c19b'); g.addColorStop(0.5, '#f0dcb8'); g.addColorStop(1, '#a98a5e');
      c.fillStyle = g; c.fillRect(x - 5, top - 22, 10, 40);
      c.fillStyle = '#7d5f3a'; c.beginPath(); c.arc(x, top - 22, 6, Math.PI, 0); c.fill();
    }
    g = c.createLinearGradient(0, top - 16, 0, top - 4); g.addColorStop(0, '#f2e1c0'); g.addColorStop(1, '#b5966a');
    c.fillStyle = g; c.fillRect(0, top - 17, W, 11); c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(0, top - 17, W, 2);
    c.fillStyle = '#b5966a'; c.fillRect(0, top + 1, W, 5); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, top + 6, W, 2);
    boardCache = { cv, top };
    return boardCache;
  }

  // ---------- foreground reeds (near corners, in front of the water, behind the railing) ----------
  let reedCache = null;
  function reeds(light) {
    if (reedCache && reedCache.light === light) return reedCache;
    const { W, k } = G, L = LIGHTS[light] || LIGHTS.morning, h = 96, cv = mk(W * k, h * k), c = cv.getContext('2d'); c.scale(k, k);
    const dark = L.stars, base = dark ? ['#1d2a3a', '#26364a', '#31445a'] : ['#3f6b45', '#4f7f4f', '#6a9a5a'];
    const r = srand(77);
    const clump = (x0, w, n, flip) => {
      for (let i = 0; i < n; i++) {
        const x = x0 + r() * w, hh = 40 + r() * 52, lean = (r() - 0.5) * 16 + (flip ? -6 : 6), col = base[(r() * 3) | 0];
        c.strokeStyle = col; c.lineWidth = 2 + r() * 1.6; c.lineCap = 'round';
        c.beginPath(); c.moveTo(x, h); c.quadraticCurveTo(x + lean * 0.3, h - hh * 0.6, x + lean, h - hh); c.stroke();
        if (r() < 0.32) { // cattail head
          c.fillStyle = dark ? '#2a2230' : '#7a4e2c'; c.save(); c.translate(x + lean * 0.86, h - hh * 0.86); c.rotate(lean * 0.012);
          c.beginPath(); c.ellipse(0, 0, 3, 9, 0, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,230,190,0.18)'; c.beginPath(); c.ellipse(-1, -2, 1, 5, 0, 0, TAU); c.fill(); c.restore();
        }
      }
      // a broad leaf or two
      for (let i = 0; i < 3; i++) {
        const x = x0 + r() * w, hh = 30 + r() * 30, lean = (flip ? -1 : 1) * (10 + r() * 14);
        c.fillStyle = base[(r() * 3) | 0]; c.beginPath(); c.moveTo(x - 2, h); c.quadraticCurveTo(x + lean * 0.2, h - hh * 0.7, x + lean, h - hh); c.quadraticCurveTo(x + lean * 0.5, h - hh * 0.5, x + 3, h); c.fill();
      }
    };
    clump(-6, 34, 11, false); clump(W - 30, 36, 11, true);
    // lily pads drifting near the left clump
    c.fillStyle = dark ? 'rgba(40,70,70,0.8)' : 'rgba(70,130,80,0.85)';
    [[44, h - 6, 9], [62, h - 3, 6], [W - 52, h - 5, 8]].forEach(a => { c.beginPath(); c.ellipse(a[0], a[1], a[2], a[2] * 0.36, 0, 0.15, TAU - 0.15); c.lineTo(a[0], a[1]); c.fill(); });
    reedCache = { cv, h, light };
    return reedCache;
  }
  function drawReeds(ctx, light, t) {
    const R = reeds(light), { W, BY } = G, sway = Math.sin(t * 0.9) * 0.012;
    ctx.save(); ctx.translate(0, BY - R.h + 8); ctx.transform(1, 0, sway, 1, -sway * R.h, 0);
    ctx.drawImage(R.cv, 0, 0, W, R.h); ctx.restore();
  }

  // landmark positions shared with the game (postcard shots frame Champ with these)
  const ferryX = (t) => ((t * 5 + 90) % (G.W + 200)) - 100;
  const lightX = () => G.W * (G.land ? 0.84 : 0.8);

  // ---------- dynamic scene ----------
  function drawScene(ctx, name, o) {
    // o: {t, chop, fog, ferry}
    const { W, H, HY, BY } = G, S = scene(name), L = S.L, t = o.t;
    const img = asset('bg_' + name);
    if (img) ctx.drawImage(img, 0, 0, W, H); else ctx.drawImage(S.bg, 0, 0, W, H);
    // slow clouds
    ctx.save(); ctx.globalAlpha = 0.9;
    const off = (t * 3) % S.cw;
    ctx.drawImage(S.clouds, -off, 6, S.cw, HY * 0.8); ctx.drawImage(S.clouds, S.cw - off, 6, S.cw, HY * 0.8);
    ctx.restore();
    // ferry on the horizon
    const fp = ferryX(t), fy = HY + 2;
    ctx.fillStyle = L.stars ? 'rgba(20,24,50,0.9)' : 'rgba(245,247,250,0.92)';
    ctx.beginPath(); ctx.moveTo(fp - 18, fy); ctx.lineTo(fp + 16, fy); ctx.lineTo(fp + 12, fy - 5); ctx.lineTo(fp - 14, fy - 5); ctx.fill();
    ctx.fillRect(fp - 9, fy - 9, 15, 4); ctx.fillStyle = 'rgba(200,60,50,0.9)'; ctx.fillRect(fp + 1, fy - 12, 3, 3);
    if (L.lamps) { ctx.fillStyle = 'rgba(255,230,150,0.95)'; for (let i = -2; i < 3; i++) ctx.fillRect(fp - 2 + i * 4, fy - 7.4, 1.5, 1.5); }
    // wave rows (parallax: near rows are bigger, brighter, faster)
    const chopK = 1 + 2.4 * (o.chop || 0), rows = 16;
    ctx.lineCap = 'round';
    for (let i = 0; i < rows; i++) {
      const f = Math.pow((i + 0.5) / rows, 1.7), y = HY + 8 + (H - HY - 8) * f, sc = 0.4 + f * 1.1;
      const amp = (1.1 + 2.4 * f) * chopK * (0.7 + 0.3 * Math.sin(i * 2.1)), wl = 46 * sc + 30, sp = (6 + 34 * f) * (i % 2 ? 1 : -1) * (0.7 + (o.chop || 0) * 0.5);
      ctx.strokeStyle = 'rgba(' + L.shim + ',' + (0.07 + 0.17 * f).toFixed(3) + ')'; ctx.lineWidth = 0.8 + 1.8 * f;
      ctx.beginPath();
      const step = 8 + 6 * f;
      for (let x = -step; x <= W + step; x += step) {
        const yy = y + Math.sin((x + t * sp) / wl * TAU / 2.2) * amp + Math.sin((x * 1.7 - t * sp * 0.6) / wl * 2.3) * amp * 0.4;
        if (x < 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
      // darker trough under each crest line
      ctx.strokeStyle = 'rgba(5,40,70,' + (0.05 + 0.07 * f).toFixed(3) + ')'; ctx.lineWidth = 1 + 2.4 * f;
      ctx.save(); ctx.translate(0, 2.6 * sc + 1); ctx.stroke(); ctx.restore();
    }
    // shimmer sparkles, denser around the sun
    const sx = S.sx > -900 ? S.sx : W * 0.5, nsp = 70;
    for (let i = 0; i < nsp; i++) {
      const rr = srand(i + 3)(), r2 = srand(i * 7 + 11)(), f = Math.pow(r2, 1.4);
      const y = HY + 6 + f * (H - HY - 6);
      let x = rr * W; if (i % 3 === 0) x = sx + (rr - 0.5) * (30 + 220 * f);
      const tw = Math.sin(t * (1.5 + (i % 5) * 0.6) + i * 1.9), a = clamp(tw, 0, 1) * (0.4 + 0.5 * f);
      if (a < 0.05) continue;
      ctx.fillStyle = 'rgba(' + L.shim + ',' + a.toFixed(2) + ')';
      const w = (3 + 9 * f) * (0.6 + 0.4 * tw), h = 0.7 + 1.1 * f;
      ctx.fillRect(x - w / 2 + Math.sin(t * 0.6 + i) * 3, y, w, h);
    }
  }
  function drawFog(ctx, amount, t) {
    if (amount <= 0.01) return;
    const { W, HY, BY } = G, f = fogTexture();
    ctx.save();
    const g = ctx.createLinearGradient(0, HY - 70, 0, BY);
    g.addColorStop(0, 'rgba(235,242,246,0)'); // soft top: no hard line across the mountains
    g.addColorStop(0.16, 'rgba(235,242,246,' + (0.88 * amount).toFixed(3) + ')');
    g.addColorStop(0.62, 'rgba(235,242,246,' + (0.42 * amount).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(235,242,246,' + (0.14 * amount).toFixed(3) + ')');
    ctx.fillStyle = g; ctx.fillRect(0, HY - 70, W, G.H);
    ctx.globalAlpha = clamp(amount * 0.9, 0, 1);
    const off = (t * 5) % (W * 2), h = BY - HY + 60;
    ctx.drawImage(f, -off, HY - 20, W * 2, h); if (off > W) ctx.drawImage(f, W * 2 - off, HY - 20, W * 2, h);
    ctx.restore();
  }
  const fogAt = (amount, y) => amount * (0.14 + 0.74 * (1 - clamp((y - G.HY) / (G.BY - G.HY), 0, 1)));

  // ---------- Champ poses (local units, facing +x, waterline y=0, up is negative) ----------
  const bez = (a, b, c, d, t) => { const u = 1 - t; return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d; };
  function neckGeom(scale, bigHead, sway, e, tt, lk) {
    const els = [], s = scale;
    const P = [[0, 0], [-12 * s, -34 * s], [24 * s, -56 * s], [(12 + sway * 0.5) * s, -80 * s]];
    const n = 20;
    for (let i = 0; i <= n; i++) {
      const t = i / n, r = lerp(14, 8, t) * (bigHead ? 0.62 : 1) * (bigHead ? 1 : s);
      els.push({ x: bez(P[0][0], P[1][0], P[2][0], P[3][0], t), y: bez(P[0][1], P[1][1], P[2][1], P[3][1], t), rx: r, ry: r, part: 'neck' });
    }
    const hx = P[3][0], hy = P[3][1], hs = bigHead ? 1.0 : s * 1.0 + (1 - s) * 0.1;
    const hr = bigHead ? 1.05 : s;
    els.push({ x: hx + 7 * hr, y: hy - 3 * hr, rx: 15 * hr, ry: 11 * hr, part: 'head' });
    els.push({ x: hx + 21 * hr, y: hy + 1 * hr, rx: 10 * hr, ry: 7.4 * hr, part: 'head' });
    els.push({ x: -24 * s, y: 3 * s, rx: 30 * s, ry: 17 * s, part: 'body' });
    els.push({ x: -58 * s, y: 6 * s, rx: 20 * s, ry: 10 * s, part: 'body' });
    return { els, head: { x: hx + 7 * hr, y: hy - 3 * hr, k: hr }, hid: 100 * s + 18, lk };
  }
  function poseNeck(u, tt, baby) {
    let e;
    if (baby) {
      const fr = (u * 2) % 1, env = sm(u / 0.14) * sm((1 - u) / 0.14);
      e = clamp(env * (0.22 + 0.78 * Math.pow(Math.sin(Math.PI * fr), 0.7)), 0, 1);
    } else e = u < 0.3 ? easeOut(u / 0.3) : u < 0.7 ? 1 : 1 - easeIn((u - 0.7) / 0.3);
    const lk = baby ? e : (u > 0.34 && u < 0.66 ? Math.sin(Math.PI * (u - 0.34) / 0.32) : 0);
    const bob = e > 0.99 ? Math.sin(tt * 3) * 1.2 : 0;
    const g = neckGeom(baby ? 0.5 : 1, !!baby, Math.sin(tt * 1.7) * 5 * e, e, tt, lk);
    const dy = (1 - e) * g.hid + bob;
    g.els.forEach(q => { q.y += dy; }); g.head.y += dy;
    return { els: g.els, head: Object.assign(g.head, { look: lk, wink: lk > 0.86 && !baby, baby: !!baby }), pk: Math.pow(e, 3) * (baby ? 1 : 0.45 + 0.55 * lk), e, kind: baby ? 'baby' : 'neck' };
  }
  function poseHumps(u, tt, scl) {
    const s = scl || 1, els = [];
    const rx = [20, 22, 17], ry = [17, 21, 14], x0 = [40, 4, -30];
    let sum = 0, mx = 0;
    for (let i = 0; i < 3; i++) {
      const v = (u - i * 0.1) / 0.62, e = v < 0 || v > 1 ? 0 : clamp(Math.sin(Math.PI * v) * 1.7, 0, 1);
      sum += e; mx = Math.max(mx, e);
      els.push({ x: (x0[i] + (u - 0.5) * 26) * s, y: lerp(ry[i] * 1.12, -ry[i] * 0.16, e) * s, rx: rx[i] * s, ry: ry[i] * s, part: 'dome', e, i });
    }
    return { els, head: null, pk: Math.pow(sum / 3, 1.6), e: mx, kind: 'humps' };
  }
  function poseTail(u, tt) {
    const e = u < 0.25 ? easeOut(u / 0.25) : u < 0.7 ? 1 : 1 - easeIn((u - 0.7) / 0.3);
    let phi = 0, vel = 0.15;
    if (u > 0.26 && u < 0.64) {
      const ph = (u - 0.26) / 0.38 * 2.5 * TAU, damp = Math.sin(Math.PI * (u - 0.26) / 0.38) * 0.35 + 0.65;
      phi = Math.sin(ph) * 0.62 * damp; vel = Math.abs(Math.cos(ph));
    }
    const els = [], P = [[0, 4], [-9, -26], [8, -46], [2, -64]], n = 14, cs = Math.cos(phi), sn = Math.sin(phi);
    const dy = (1 - e) * 92;
    const rot = (x, y) => [x * cs - (y) * sn, x * sn + (y) * cs];
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = bez(P[0][0], P[1][0], P[2][0], P[3][0], t), y = bez(P[0][1], P[1][1], P[2][1], P[3][1], t), q = rot(x, y);
      els.push({ x: q[0] - 6, y: q[1] + dy, rx: lerp(11, 5, t), ry: lerp(11, 5, t), part: 'neck' });
    }
    const tp = rot(P[3][0], P[3][1] - 2), fa = phi * 0.9;
    els.push({ x: tp[0] - 6 + Math.sin(fa) * 4, y: tp[1] + dy - 6, rx: 17, ry: 6.2, rot: fa + 0.25, part: 'fin' });
    els.push({ x: tp[0] - 6 - Math.sin(fa) * 4, y: tp[1] + dy - 3, rx: 12, ry: 5, rot: fa - 0.35, part: 'fin' });
    els.push({ x: -26, y: 6 + dy * 0.55, rx: 26, ry: 14, part: 'body' });
    return { els, head: null, pk: Math.pow(e, 2) * (1 - 0.62 * vel), e, kind: 'tail' };
  }
  function poseBreach(u, tt) {
    const yc = 60 - (60 + 78) * 4 * u * (1 - u), xc = (u - 0.5) * 70;
    const vy = -(138) * 4 * (1 - 2 * u), vx = 70, th = Math.atan2(vy, vx);
    const cs = Math.cos(th), sn = Math.sin(th), els = [];
    const prof = [[-58, 3.5], [-48, 5.5], [-36, 11], [-22, 17], [-8, 19.5], [6, 17.5], [18, 14], [28, 10.5], [37, 8.5], [45, 8]];
    prof.forEach(p => els.push({ x: xc + p[0] * cs, y: yc + p[0] * sn, rx: p[1], ry: p[1], part: p[0] > 24 ? 'neck' : 'body' }));
    const hx = 54, hr = 1;
    els.push({ x: xc + hx * cs, y: yc + hx * sn, rx: 14, ry: 10.5, part: 'head' });
    els.push({ x: xc + (hx + 13) * cs, y: yc + (hx + 13) * sn + 1, rx: 9.6, ry: 7, part: 'head' });
    els.push({ x: xc + (-62) * cs - 2 * sn, y: yc + (-62) * sn + 2 * cs, rx: 14, ry: 5.2, rot: th + 0.5, part: 'fin' });
    els.push({ x: xc + (-4) * cs - 18 * sn, y: yc + (-4) * sn + 18 * cs, rx: 12, ry: 5, rot: th + 1.0, part: 'fin' });
    const lk = u > 0.4 && u < 0.6 ? 1 : 0;
    return { els, head: { x: xc + hx * cs, y: yc + hx * sn, k: 1, look: lk, wink: false, rot: th }, pk: Math.max(0, 1 - Math.pow((u - 0.5) / 0.2, 2)), e: clamp(-yc / 40, 0, 1), kind: 'breach' };
  }
  function pose(kind, u, tt) {
    u = clamp(u, 0, 1);
    switch (kind) {
      case 'neck': return poseNeck(u, tt, false);
      case 'baby': return poseNeck(u, tt, true);
      case 'humps': return poseHumps(u, tt, 1);
      case 'sail': return poseHumps(u, tt, 0.9);
      case 'tail': return poseTail(u, tt);
      case 'breach': return poseBreach(u, tt);
    }
    return poseNeck(u, tt, false);
  }

  // ---------- drawing Champ ----------
  const CC = { out: '#145a5a', mid: '#2f9d92', hi: '#74d3b5', dome: '#35a79a', spot: '#a6e6c6', under: 'rgba(14,78,100,0.34)', belly: '#cfe9c4', fin: '#2a9088', domeHi: '#53c1ac', scallop: '#1f7f78' };
  // a mossy log that rises like humps but makes no ripples (the mimic decoy)
  const FK = { out: '#2e2218', mid: '#6a5136', hi: '#a08560', dome: '#6f553a', spot: '#4c3a26', under: 'rgba(30,20,8,0.3)', belly: '#8a7254', fin: '#563f2a', domeHi: '#947a56', scallop: '#3d2d1d' };
  // the rare Golden Champ
  const CCG = { out: '#7a4806', mid: '#e6ae2c', hi: '#ffe48a', dome: '#efbb38', spot: '#fff4c4', under: 'rgba(130,85,10,0.32)', belly: '#fff0c4', fin: '#cf951c', domeHi: '#ffd65c', scallop: '#b07612' };
  function ell(ctx, x, y, rx, ry, rot) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, TAU); ctx.fill(); }
  function drawChamp(ctx, ch) {
    const P = ch.fake ? FK : ch.gold ? CCG : CC;
    // ch: {pose, x, y, s, dir, wl, tt, ghost}
    const p = ch.pose, s = ch.s, d = ch.dir, wl = ch.wl;
    const E = p.els.map(q => ({ x: ch.x + d * s * q.x, y: ch.y + s * q.y, rx: s * q.rx, ry: s * q.ry, rot: q.rot ? (d < 0 ? Math.PI - q.rot : q.rot) : 0, part: q.part, e: q.e }));
    const W = G.W, H = G.H, ol = 1.5 * s + 0.4;
    // underwater ghost
    ctx.save(); ctx.beginPath(); ctx.rect(-50, wl, W + 100, H); ctx.clip();
    ctx.fillStyle = P.under;
    E.forEach(q => ell(ctx, q.x, q.y, q.rx + 1, q.ry + 1, q.rot));
    // soft, rippling mirror image of whatever is above the surface
    if (!ch.noRefl) {
      const tt = ch.tt || 0;
      ctx.save(); ctx.beginPath(); ctx.rect(-50, wl, W + 100, 46 * s); ctx.clip(); // reflections fade close to the surface
      ctx.globalAlpha = 0.26; ctx.fillStyle = P.mid;
      E.forEach(q => { if (q.y - q.ry >= wl || wl - q.y > 52 * s) return; const ry = 2 * wl - q.y; ell(ctx, q.x + Math.sin(ry * 0.35 + tt * 5) * 1.6 * s, ry, q.rx * 1.04, q.ry, -q.rot); });
      ctx.globalAlpha = 0.16; ctx.fillStyle = P.hi;
      E.forEach(q => { if (q.y - q.ry >= wl || q.part === 'fin') return; const ry = 2 * wl - q.y; ell(ctx, q.x - q.rx * 0.18 + Math.sin(ry * 0.35 + tt * 5) * 1.6 * s, ry + q.ry * 0.3, q.rx * 0.5, q.ry * 0.35, 0); });
      // ripple bands break up the reflection
      ctx.globalAlpha = 1; ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;
      for (let k = 1; k < 5; k++) { const yy = wl + k * 6 * s + Math.sin(tt * 3 + k) * 1.2; ctx.beginPath(); ctx.moveTo(ch.x - 40 * s, yy); ctx.lineTo(ch.x + 40 * s, yy); ctx.stroke(); }
      ctx.restore();
    }
    ctx.restore();
    // above the water
    ctx.save(); ctx.beginPath(); ctx.rect(-50, -50, W + 100, wl + 50); ctx.clip();
    ctx.fillStyle = P.out; E.forEach(q => ell(ctx, q.x, q.y, q.rx + ol, q.ry + ol, q.rot));
    const imgH = asset('champ_hump');
    E.forEach(q => {
      ctx.fillStyle = q.part === 'dome' ? P.dome : q.part === 'fin' ? P.fin : P.mid;
      ell(ctx, q.x, q.y, q.rx, q.ry, q.rot);
    });
    // light from the upper left: lighter ridge on every tube piece, belly shade on the lower side
    E.forEach(q => {
      if (q.part === 'fin') return;
      ctx.fillStyle = q.part === 'dome' ? P.domeHi : P.hi;
      ell(ctx, q.x - q.rx * 0.18, q.y - q.ry * 0.34, q.rx * 0.62, q.ry * 0.44, 0);
    });
    E.forEach(q => {
      if (q.part === 'dome') {
        ctx.fillStyle = P.spot; ctx.globalAlpha = 0.85;
        ell(ctx, q.x - q.rx * 0.2, q.y - q.ry * 0.62, q.rx * 0.28, q.ry * 0.1, -0.2);
        ell(ctx, q.x + q.rx * 0.34, q.y - q.ry * 0.38, q.rx * 0.12, q.ry * 0.09, 0);
        ctx.globalAlpha = 1;
        // dorsal scallops
        ctx.fillStyle = P.scallop; for (let j = -1; j <= 1; j++) ell(ctx, q.x + j * q.rx * 0.36, q.y - q.ry * 0.93, q.rx * 0.11, q.ry * 0.07, 0);
      } else if (q.part === 'neck') {
        ctx.fillStyle = P.belly; ctx.globalAlpha = 0.5; ell(ctx, q.x + d * q.rx * 0.28, q.y + q.ry * 0.3, q.rx * 0.42, q.ry * 0.5, 0); ctx.globalAlpha = 1;
      }
    });
    if (p.head) drawHead(ctx, p.head, ch);
    ctx.restore();
    // foam collar where the body meets the surface
    const iv = [];
    E.forEach(q => {
      const dd = (wl - q.y) / q.ry; if (Math.abs(dd) >= 1) return;
      const c = q.rx * Math.sqrt(1 - dd * dd) + ol; iv.push([q.x - c, q.x + c]);
    });
    iv.sort((a, b) => a[0] - b[0]);
    const mg = []; iv.forEach(v => { const l = mg[mg.length - 1]; if (l && v[0] <= l[1] + 2) l[1] = Math.max(l[1], v[1]); else mg.push([v[0], v[1]]); });
    ctx.save();
    mg.forEach(v => {
      const cx = (v[0] + v[1]) / 2, w = (v[1] - v[0]) / 2 + 3.5 * s;
      ctx.strokeStyle = 'rgba(255,255,255,0.78)'; ctx.lineWidth = 2.2 * s + 0.6;
      ctx.beginPath(); ctx.ellipse(cx, wl + 0.6 * s, w, 3.2 * s + 0.8, 0, 0.12 * Math.PI, 0.88 * Math.PI); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(cx, wl + 2.6 * s, w + 5 * s, 5 * s + 1, 0, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
    });
    ctx.restore();
    return E;
  }
  function drawHead(ctx, h, ch) {
    const P = ch.fake ? FK : ch.gold ? CCG : CC;
    const s = ch.s, d = ch.dir;
    ctx.save();
    ctx.translate(ch.x + d * s * h.x - 0, ch.y + s * h.y);
    ctx.scale(d * s * (h.k || 1), s * (h.k || 1));
    if (h.rot) ctx.rotate(h.rot * (d < 0 ? -1 : 1) * (d < 0 ? -1 : 1) * 1);
    // ossicones (little horns)
    ctx.fillStyle = '#e9d9a6'; ctx.strokeStyle = P.out; ctx.lineWidth = 1.2;
    [[-3, -9, -0.3], [4, -10, 0.15]].forEach(a => { ctx.save(); ctx.translate(a[0], a[1]); ctx.rotate(a[2]); ctx.beginPath(); ctx.moveTo(-1.6, 1); ctx.lineTo(-1.2, -5); ctx.lineTo(1.2, -5); ctx.lineTo(1.6, 1); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(0, -6, 2.1, 0, TAU); ctx.fillStyle = '#f3b13f'; ctx.fill(); ctx.stroke(); ctx.fillStyle = '#e9d9a6'; ctx.restore(); });
    // eye
    const ex = 6.5, ey = -3.2;
    if (h.wink) {
      ctx.strokeStyle = '#0f3b3a'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(ex, ey + 1.5, 3.2, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke();
    } else {
      ctx.fillStyle = '#fff'; ell(ctx, ex, ey, h.baby ? 4.8 : 3.9, h.baby ? 5 : 4.1, 0);
      ctx.fillStyle = '#10302f'; ell(ctx, ex + (h.look > 0.4 ? 0.5 : 1.2), ey + 0.3, h.baby ? 3 : 2.3, h.baby ? 3.2 : 2.5, 0);
      ctx.fillStyle = '#fff'; ell(ctx, ex + (h.look > 0.4 ? 0.9 : 1.6), ey - 0.9, 0.95, 0.95, 0);
    }
    // brow, nostril, smile, blush
    ctx.strokeStyle = P.out; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(ex - 3.8, ey - 5.4 - (h.look > 0.5 ? 1 : 0)); ctx.quadraticCurveTo(ex, ey - 7.4, ex + 4, ey - 5.2); ctx.stroke();
    ctx.fillStyle = P.out; ell(ctx, 27.5, 1.6, 1.1, 1.5, 0);
    ctx.strokeStyle = '#0f3b3a'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(12, 5.4); ctx.quadraticCurveTo(19, 9.6 + (h.look > 0.5 ? 1.5 : 0), 27, 5.3); ctx.stroke();
    ctx.fillStyle = 'rgba(255,140,130,0.55)'; ell(ctx, 8.5, 3.4, 3, 2, 0);
    ctx.restore();
  }

  // ---------- decoys ----------
  const DECOY_BOX = {
    loon: [-22, -28, 28, 6], log: [-46, -16, 46, 5], swimmer: [-22, -17, 28, 6], kayak: [-44, -36, 46, 6], wave: [-34, -24, 34, 4], duck: [-15, -22, 18, 4], mimic: [-48, -26, 58, 4],
  };
  function decoyBox(dc) {
    const b = DECOY_BOX[dc.kind], s = dc.s, d = dc.dir;
    const x0 = dc.x + d * s * b[0], x1 = dc.x + d * s * b[2];
    return { x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0: dc.y + s * b[1], y1: dc.y + s * b[3] };
  }
  function wake(ctx, x, y, s, d, len, a) {
    ctx.strokeStyle = 'rgba(255,255,255,' + (a || 0.5) + ')'; ctx.lineWidth = 1.4 * s + 0.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - d * len * s, y - 3 * s); ctx.moveTo(x, y + 1); ctx.lineTo(x - d * len * 0.8 * s, y + 4 * s); ctx.stroke();
  }
  function drawDecoy(ctx, dc, tt) {
    const s = dc.s, d = dc.dir, wl = dc.y, e = dc.e === undefined ? 1 : dc.e;
    ctx.save();
    ctx.translate(dc.x, dc.y); ctx.scale(d * s, s);
    // waterline clip (local y<=0 above water); dive sinks the object
    const sink = (1 - e) * 36;
    ctx.save(); ctx.beginPath(); ctx.rect(-80, -120, 160, 120); ctx.clip();
    const bob = Math.sin(tt * 2 + dc.ph) * 1.1;
    ctx.translate(0, bob + sink);
    switch (dc.kind) {
      case 'loon': {
        ctx.fillStyle = '#20262c'; ell(ctx, 0, -3, 17, 7.5, 0);
        ctx.fillStyle = '#3a434c'; ell(ctx, -3, -6, 12, 3, -0.05);
        ctx.fillStyle = '#fff'; for (let i = 0; i < 9; i++) ell(ctx, -11 + i * 2.7, -5.5 + (i % 3) * 1.4, 0.9, 0.9, 0);
        ctx.strokeStyle = '#161b20'; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(11, -5); ctx.quadraticCurveTo(16, -10, 15, -17); ctx.stroke();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(12 + i * 0.6, -9 - i * 2.3); ctx.lineTo(17 + i * 0.6, -9.3 - i * 2.3); ctx.stroke(); }
        ctx.fillStyle = '#161b20'; ell(ctx, 17, -19, 6, 4.2, 0);
        ctx.fillStyle = '#7d868e'; ctx.beginPath(); ctx.moveTo(21, -20.5); ctx.lineTo(29, -18.6); ctx.lineTo(21, -17.2); ctx.fill();
        ctx.fillStyle = '#d6322e'; ell(ctx, 18.2, -20.2, 1.3, 1.3, 0);
        break;
      }
      case 'log': {
        ctx.rotate(dc.tilt || 0);
        let g = ctx.createLinearGradient(0, -8, 0, 5); g.addColorStop(0, '#9c7549'); g.addColorStop(0.45, '#6e4d2d'); g.addColorStop(1, '#43301d');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-42, -6); ctx.quadraticCurveTo(0, -10, 42, -6.5); ctx.lineTo(43, 3); ctx.quadraticCurveTo(0, 7, -43, 3); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(30,18,8,0.55)'; ctx.lineWidth = 0.9; for (let i = 0; i < 9; i++) { const x = -36 + i * 9; ctx.beginPath(); ctx.moveTo(x, -6 + (i % 3)); ctx.lineTo(x + 5, -4 + (i % 2)); ctx.stroke(); }
        ctx.fillStyle = '#c9a063'; ell(ctx, -42.5, -1.5, 3.4, 5.2, 0); ctx.strokeStyle = '#8b6535'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.ellipse(-42.5, -1.5, 1.7, 2.8, 0, 0, TAU); ctx.stroke();
        ctx.fillStyle = '#5b4026'; ctx.beginPath(); ctx.moveTo(15, -8); ctx.lineTo(18, -26); ctx.lineTo(23, -25); ctx.lineTo(24, -7); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#7d5a35'; ell(ctx, 20.5, -26, 3.2, 2, -0.2);
        ctx.fillStyle = 'rgba(95,140,70,0.9)'; ell(ctx, -8, -7.6, 8, 1.8, 0);
        break;
      }
      case 'swimmer': {
        ctx.fillStyle = '#e8463b'; ell(ctx, -10, -1.5, 11, 4, 0.05);
        const a = tt * 4.2 + dc.ph, hx = -2 + Math.cos(a) * 17, hy = -9 + Math.sin(a) * 11 - 3;
        ctx.strokeStyle = '#f0c29a'; ctx.lineWidth = 3.6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-3, -3); ctx.lineTo(hx, Math.min(hy, -1)); ctx.stroke();
        ctx.fillStyle = '#f0c29a'; ell(ctx, 4, -7, 5.4, 5.2, 0);
        ctx.fillStyle = '#ff5da2'; ctx.beginPath(); ctx.arc(4, -7, 5.8, Math.PI * 0.95, Math.PI * 2.05); ctx.fill();
        ctx.fillStyle = '#222'; ell(ctx, 7.4, -6.6, 2.3, 1.6, 0); ctx.fillStyle = 'rgba(180,230,255,0.9)'; ell(ctx, 7.2, -6.8, 1.2, 0.8, 0);
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.2; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(hx + (i - 1.5) * 2, -1 - (i % 2) * 2, 0.8, 0, TAU); ctx.stroke(); }
        break;
      }
      case 'kayak': {
        let g = ctx.createLinearGradient(0, -7, 0, 4); g.addColorStop(0, '#f2584c'); g.addColorStop(1, '#a8271f');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-44, -5); ctx.quadraticCurveTo(-8, 5, 46, -4); ctx.quadraticCurveTo(10, -9, -44, -5); ctx.fill();
        ctx.fillStyle = '#ffd23f'; ctx.fillRect(-20, -6.4, 38, 1.6);
        ctx.fillStyle = '#ffa41b'; ctx.beginPath(); ctx.roundRect(-5, -20, 11, 15, 4); ctx.fill();
        ctx.fillStyle = '#f0c29a'; ell(ctx, 0.5, -24, 4.4, 4.6, 0);
        ctx.fillStyle = '#2f5d8a'; ctx.beginPath(); ctx.moveTo(-5, -25); ctx.quadraticCurveTo(0, -33, 6, -25); ctx.lineTo(8.5, -25.5); ctx.lineTo(-6, -24); ctx.fill();
        const sw = Math.sin(tt * 2.6 + dc.ph) * 0.5;
        ctx.save(); ctx.translate(0, -14); ctx.rotate(sw);
        ctx.strokeStyle = '#3a3f46'; ctx.lineWidth = 1.7; ctx.beginPath(); ctx.moveTo(-30, 0); ctx.lineTo(30, 0); ctx.stroke();
        ctx.fillStyle = '#1f4d7a'; ell(ctx, -33, 0, 5.2, 2.4, 0); ell(ctx, 33, 0, 5.2, 2.4, 0);
        ctx.restore();
        ctx.strokeStyle = '#f0c29a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-1, -15); ctx.lineTo(-9, -14 + sw * 18); ctx.moveTo(1, -15); ctx.lineTo(9, -14 - sw * 18); ctx.stroke();
        break;
      }
      case 'wave': {
        const w = e;
        let g = ctx.createLinearGradient(0, -22 * w, 0, 4); g.addColorStop(0, 'rgba(238,250,255,0.95)'); g.addColorStop(0.35, 'rgba(150,205,225,0.9)'); g.addColorStop(1, 'rgba(60,130,165,0.85)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-34, 5); ctx.bezierCurveTo(-26, 5 - 20 * w, -8, 3 - 26 * w, 10, 4 - 22 * w); ctx.bezierCurveTo(24, 4 - 18 * w, 30, 5 - 6 * w, 36, 5); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-22, 0 - 16 * w); ctx.bezierCurveTo(-12, -3 - 22 * w, 0, -3 - 24 * w, 10, -2 - 18 * w); ctx.stroke();
        ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-14, -2 - 8 * w); ctx.quadraticCurveTo(0, -8 - 14 * w, 18, -3 - 8 * w); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.9)'; for (let i = 0; i < 6; i++) ell(ctx, -18 + i * 7 + Math.sin(tt * 4 + i) * 2, -22 * w + 4 - (i % 3) * 3, 1.3, 1.3, 0);
        break;
      }
      case 'duck': {
        let g = ctx.createRadialGradient(-3, -9, 1, 0, -5, 12); g.addColorStop(0, '#fff2a0'); g.addColorStop(1, '#f6b81f');
        ctx.fillStyle = g; ell(ctx, 0, -5, 11, 7, 0);
        ctx.beginPath(); ctx.moveTo(-9, -6); ctx.quadraticCurveTo(-15, -9, -13, -13); ctx.quadraticCurveTo(-8, -10, -5, -8); ctx.fill();
        ctx.fillStyle = '#f9c82e'; ell(ctx, 6, -13, 5.8, 5.6, 0);
        ctx.fillStyle = '#ff7a1a'; ell(ctx, 11.8, -12, 3.4, 1.9, 0.1);
        ctx.fillStyle = '#222'; ell(ctx, 7.8, -14.6, 1.1, 1.3, 0);
        ctx.strokeStyle = '#e29a14'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(-1, -5, 5.5, 0.2, 2.4); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; ell(ctx, 2, -10, 3, 1.2, -0.5);
        break;
      }
    }
    ctx.restore();
    // foam / wake at the waterline
    ctx.translate(0, 0);
    const wd = { loon: 20, log: 44, swimmer: 16, kayak: 44, wave: 34, duck: 12 }[dc.kind] || 14;
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.6 * Math.min(1, e + 0.3)).toFixed(2) + ')'; ctx.lineWidth = 1.7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.ellipse(0, 0.6, wd, 3, 0, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
    if (dc.moving) { ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.moveTo(-wd, 1); ctx.lineTo(-wd - 22, -2); ctx.moveTo(-wd + 4, 4); ctx.lineTo(-wd - 16, 6); ctx.stroke(); }
    ctx.restore();
  }

  // ---------- sailboat (the rare "Champ and the sailboat" shot) ----------
  function drawSailboat(ctx, x, y, s, d, tt) {
    ctx.save(); ctx.translate(x, y); ctx.scale(d * s, s);
    const heel = Math.sin(tt * 1.3) * 0.02; ctx.rotate(heel);
    ctx.save(); ctx.beginPath(); ctx.rect(-90, -160, 180, 160); ctx.clip();
    let g = ctx.createLinearGradient(0, -8, 0, 5); g.addColorStop(0, '#fbf6ea'); g.addColorStop(1, '#cdbfa3');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-34, -7); ctx.lineTo(38, -9); ctx.quadraticCurveTo(30, 6, 4, 7); ctx.lineTo(-26, 6); ctx.quadraticCurveTo(-34, 3, -34, -7); ctx.fill();
    ctx.fillStyle = '#d63b34'; ctx.beginPath(); ctx.moveTo(-34, -4); ctx.lineTo(37, -6); ctx.lineTo(36, -3); ctx.lineTo(-33, -1); ctx.fill();
    ctx.strokeStyle = '#6b5334'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(2, -8); ctx.lineTo(2, -92); ctx.stroke();
    g = ctx.createLinearGradient(-26, 0, 2, 0); g.addColorStop(0, '#fffdf5'); g.addColorStop(1, '#efe6d2');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, -88); ctx.quadraticCurveTo(-10, -48, -30, -14); ctx.lineTo(0, -14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f7ebd6'; ctx.beginPath(); ctx.moveTo(5, -82); ctx.quadraticCurveTo(14, -46, 32, -14); ctx.lineTo(5, -14); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-6, -70); ctx.lineTo(-14, -26); ctx.moveTo(10, -66); ctx.lineTo(16, -24); ctx.stroke();
    ctx.fillStyle = '#e8463b'; ctx.beginPath(); ctx.moveTo(2, -92); ctx.lineTo(-10, -89); ctx.lineTo(2, -86); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(0, 0.5, 36, 3.2, 0, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
    ctx.restore();
  }

  // ---------- tourists (they never notice) ----------
  function drawTourist(ctx, x, y, k, t, who, face) {
    // y = bottom of the visible bust; they are cut off by the screen edge
    ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
    const bob = Math.sin(t * 1.3 + who * 2) * 1.2;
    ctx.translate(0, bob);
    const skin = ['#f0c29a', '#c98d60', '#8d5a3a', '#f6d2b0'][who], coat = ['#e8463b', '#2f7fb8', '#f2b13a', '#6aa84f'][who];
    // body
    let g = ctx.createLinearGradient(0, -48, 0, 4); g.addColorStop(0, coat); g.addColorStop(1, shade(coat, -0.28));
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-22, 8); ctx.quadraticCurveTo(-26, -30, -10, -38); ctx.lineTo(10, -38); ctx.quadraticCurveTo(26, -30, 22, 8); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(-1, -37, 2, 44);
    // neck + head
    ctx.fillStyle = skin; ell(ctx, 0, -41, 4.5, 4, 0);
    ctx.fillStyle = skin; ell(ctx, 0, -56, 12, 13, 0);
    ctx.strokeStyle = 'rgba(80,40,20,0.35)'; ctx.lineWidth = 1; ctx.stroke();
    // face looks the wrong way on purpose
    const fx = face * 3;
    ctx.fillStyle = '#2a2020'; ell(ctx, -4 + fx, -57, 1.3, 1.6, 0); ell(ctx, 4 + fx, -57, 1.3, 1.6, 0);
    ctx.strokeStyle = '#7a3b2a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(fx, -52.5, 3.4, 0.2, Math.PI - 0.2); ctx.stroke();
    if (who === 0) { // beanie + coffee
      ctx.fillStyle = '#3a6fb0'; ctx.beginPath(); ctx.arc(0, -60, 12.6, Math.PI, 0); ctx.fill(); ctx.fillStyle = '#e8463b'; ctx.fillRect(-12.6, -61, 25.2, 4); ell(ctx, 0, -73.5, 3.2, 3.2, 0);
      ctx.fillStyle = '#f4f4f4'; ctx.fillRect(14, -26, 8, 11); ctx.fillStyle = '#7a5230'; ctx.fillRect(14, -26, 8, 3.5);
      ctx.strokeStyle = skin; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(12, -28); ctx.lineTo(17, -22); ctx.stroke();
    } else if (who === 1) { // sun hat + map held up
      ctx.fillStyle = '#e8d29a'; ell(ctx, 0, -63, 20, 4.6, 0); ctx.beginPath(); ctx.arc(0, -64, 10, Math.PI, 0); ctx.fill(); ctx.fillStyle = '#c24b3f'; ctx.fillRect(-10, -66, 20, 2.6);
      ctx.save(); ctx.translate(0, -28 + Math.sin(t * 0.9) * 1.5); ctx.rotate(Math.PI + 0.04); ctx.fillStyle = '#f4ecd0'; ctx.fillRect(-17, -13, 34, 24); ctx.strokeStyle = '#8a7a52'; ctx.lineWidth = 1; ctx.strokeRect(-17, -13, 34, 24);
      ctx.strokeStyle = '#4a89c4'; ctx.beginPath(); ctx.moveTo(-14, -6); ctx.quadraticCurveTo(0, 4, 14, -5); ctx.stroke(); ctx.strokeStyle = '#c24b3f'; ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.moveTo(-12, 6); ctx.lineTo(12, -8); ctx.stroke(); ctx.restore();
    } else if (who === 2) { // selfie stick, pointing away from the lake
      ctx.fillStyle = '#3a2e22'; ctx.beginPath(); ctx.arc(0, -60, 12.4, Math.PI * 1.02, Math.PI * 1.98); ctx.fill();
      ctx.strokeStyle = '#2b2b30'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(14, -30); ctx.lineTo(26, -70); ctx.stroke();
      ctx.fillStyle = '#16161a'; ctx.beginPath(); ctx.roundRect(21, -86, 12, 18, 2); ctx.fill(); ctx.fillStyle = '#9ad'; ctx.fillRect(22.5, -84, 9, 13);
      ctx.strokeStyle = skin; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(14, -32); ctx.lineTo(15, -28); ctx.stroke();
    } else { // ice cream cone
      ctx.fillStyle = '#7a4a2a'; ctx.beginPath(); ctx.arc(0, -59, 12.6, Math.PI * 1.0, Math.PI * 2.0); ctx.fill(); ell(ctx, -7, -66, 5, 5, 0); ell(ctx, 7, -66, 5, 5, 0);
      ctx.fillStyle = '#d9a35c'; ctx.beginPath(); ctx.moveTo(15, -18); ctx.lineTo(23, -18); ctx.lineTo(19, -2); ctx.fill();
      ctx.fillStyle = '#f7d9e4'; ell(ctx, 19, -22, 5.8, 5, 0); ell(ctx, 19, -28, 4.2, 3.8, 0);
      ctx.strokeStyle = skin; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(12, -26); ctx.lineTo(18, -16); ctx.stroke();
    }
    ctx.restore();
  }
  function shade(hex, a) {
    const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
    const f = (v) => clamp(Math.round(a < 0 ? v * (1 + a) : v + (255 - v) * a), 0, 255);
    return 'rgb(' + f(r) + ',' + f(gg) + ',' + f(b) + ')';
  }

  // ---------- small icons for the album / field guide ----------
  function thumb(kind, size, light, bare) {
    const c = mk(size * 2, size * 2), x = c.getContext('2d');
    x.scale(2, 2);
    const L = LIGHTS[light || 'noon'];
    if (!bare) { // bare = creature only, for "not found yet" silhouettes
      let g = x.createLinearGradient(0, 0, 0, size); g.addColorStop(0, L.skyBot); g.addColorStop(0.45, L.wTop); g.addColorStop(1, L.wBot);
      x.fillStyle = g; x.fillRect(0, 0, size, size);
    }
    const saveG = Object.assign({}, G);
    G.W = size; G.H = size; G.HY = size * 0.4; G.BY = size;
    const sc = size / 100, dcKinds = ['loon', 'log', 'swimmer', 'kayak', 'wave', 'duck'];
    x.save();
    if (dcKinds.indexOf(kind) >= 0) {
      const s = { loon: 1.55, log: 0.95, swimmer: 1.5, kayak: 0.9, wave: 1.1, duck: 2.2 }[kind] * sc;
      drawDecoy(x, { kind, x: size * 0.5, y: size * 0.68, s, dir: 1, ph: 1, e: 1, tilt: 0 }, 1);
    } else if (kind === 'sail') {
      drawSailboat(x, size * 0.7, size * 0.55, 0.42 * sc, 1, 1);
      const p = pose('humps', 0.38, 1);
      drawChamp(x, { pose: p, x: size * 0.36, y: size * 0.8, s: 0.62 * sc, dir: 1, wl: size * 0.8, tt: 1 });
    } else {
      const u = { neck: 0.5, baby: 0.25, humps: 0.4, tail: 0.44, breach: 0.5 }[kind] || 0.5;
      const p = pose(kind, u, 1);
      const sc2 = { neck: 0.7, baby: 1.3, humps: 0.62, tail: 0.85, breach: 0.52 }[kind] || 0.7;
      const yy = kind === 'breach' ? size * 0.82 : size * 0.8;
      drawChamp(x, { pose: p, x: size * (kind === 'neck' ? 0.45 : 0.46), y: yy, s: sc2 * sc, dir: 1, wl: size * 0.8, tt: 1 });
    }
    x.restore();
    Object.assign(G, saveG);
    return c;
  }

  window.Art = {
    LIGHTS, ASSETS, loadAssets, asset, G, setup, depthScale, srand, clamp, lerp, sm,
    scene, drawScene, ferryX, lightX, drawFog, drawReeds, fogAt, board, pose, drawChamp, drawDecoy, decoyBox, drawSailboat, drawTourist, thumb, mk, shade, wake,
  };
})();
