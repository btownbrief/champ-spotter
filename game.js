/* Champ Spotter — a tap-to-snap photo safari. All logic lives here; art.js draws, audio.js sounds. */
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const $ = (s) => document.querySelector(s);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const sm = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  let _seed = (Date.now() & 0xffffff) + 1;
  function rand() { _seed = (Math.imul(_seed, 1664525) + 1013904223) >>> 0; return _seed / 4294967296; }
  const rr = (a) => a[0] + (a[1] - a[0]) * rand();
  const pick = (a) => a[(rand() * a.length) | 0];
  function wpick(map) {
    let tot = 0; for (const k in map) tot += map[k];
    let r = rand() * tot; for (const k in map) { r -= map[k]; if (r <= 0) return k; }
    return Object.keys(map)[0];
  }

  const stage = $('#stage'), cv = $('#cv'), ctx = cv.getContext('2d');
  const STEP = 1 / 60;

  // ---------- content ----------
  const CHAMP_KINDS = ['neck', 'humps', 'tail', 'breach', 'baby', 'sail'];
  const CHAMP_NAMES = { neck: 'Head & Neck', humps: 'Triple Humps', tail: 'Tail Flick', breach: 'Big Breach', baby: 'Baby Champ', sail: 'Champ & Sailboat' };
  const LIFE_NAMES = { loon: 'Loon', log: 'Log', swimmer: 'Swimmer', kayak: 'Kayaker', wave: 'Wave Crest', duck: 'Rubber Duck', mimic: 'Mossy Log' };
  const BASE_D = { neck: 2.7, humps: 3.0, tail: 1.8, breach: 2.0, baby: 3.3, sail: 3.6 };
  const RARE_MULT = { baby: 1.5, breach: 1.25, sail: 1.4 };
  const PEAK_U = { neck: 0.5, baby: 0.25, humps: 0.38, sail: 0.38, tail: 0.71, breach: 0.5 }; // tail: the held pose after the flick, not the blurry flick itself
  const GLINT_LEAD = 0.26;
  const DRIFT = { neck: 7, baby: 9, humps: 15, sail: 0, tail: 0, breach: 0 }; // px/s at depth 1: lead the shot on swimmers // the sparkle starts this long before the peak and is brightest at it

  const ROUNDS = [
    { name: 'Morning Calm', light: 'morning', film: 8, n: 5, gap: [2.0, 3.2], spd: 1.0, warn: 1.05, decoy: [6, 9], dk: { duck: 3, log: 2, loon: 2 }, kinds: { neck: 3, humps: 2, tail: 1 }, fog: 0, chop: 0.05, target: 220, fixed: ['neck', 'humps', 'neck', 'tail', 'humps'], blurb: 'Calm water. Easy light.' },
    { name: 'Fudge Break', light: 'noon', film: 8, n: 6, gap: [1.8, 3.0], spd: 1.1, warn: 1.0, decoy: [4.5, 7], dk: { duck: 2, log: 2, loon: 2, swimmer: 2 }, kinds: { neck: 3, humps: 3, tail: 2 }, lm: ['light'], fog: 0, chop: 0.1, target: 320, blurb: 'More swimmers. Fewer secrets.' },
    { name: 'Kayak Parade', light: 'noon', film: 9, n: 7, gap: [1.7, 2.8], spd: 1.18, warn: 0.95, decoy: [3.5, 6], dk: { duck: 1, log: 2, loon: 2, swimmer: 2, kayak: 3 }, kinds: { neck: 3, humps: 3, tail: 2 }, breach: 1, bomb: 1, fog: 0, chop: 0.35, target: 400, blurb: 'Paddlers everywhere. One big splash.' },
    { name: 'Pea Soup', light: 'overcast', film: 9, n: 7, gap: [1.7, 2.8], spd: 1.22, warn: 0.95, decoy: [3.5, 6], dk: { duck: 1, log: 3, loon: 3, swimmer: 1, kayak: 2 }, kinds: { neck: 3, humps: 3, tail: 2 }, baby: 1, fog: 0.62, chop: 0.15, target: 420, blurb: 'Fog rolls in. A tiny visitor, maybe.' },
    { name: 'Golden Hour', light: 'golden', film: 10, n: 8, gap: [1.5, 2.6], spd: 1.32, warn: 0.9, decoy: [3, 5.5], dk: { duck: 2, log: 2, loon: 2, swimmer: 2, kayak: 2, wave: 1 }, kinds: { neck: 3, humps: 3, tail: 2 }, breach: 1, sail: 1, lm: ['ferry'], fog: 0, chop: 0.25, shy: 0.2, target: 540, blurb: 'Warm light. A sailboat drifts by.' },
    { name: 'Nor’easter Chop', light: 'overcast', film: 10, n: 8, gap: [1.5, 2.6], spd: 1.42, warn: 0.85, decoy: [2.8, 5], dk: { duck: 1, log: 2, loon: 2, swimmer: 1, kayak: 1, wave: 5 }, kinds: { neck: 3, humps: 3, tail: 3 }, breach: 1, bomb: 2, fog: 0.1, chop: 1, shy: 0.25, mimic: [9, 14], target: 600, blurb: 'Whitecaps everywhere. Not all humps are Champ.' },
    { name: 'Foggy Dusk', light: 'dusk', film: 11, n: 9, gap: [1.4, 2.4], spd: 1.52, warn: 0.8, decoy: [2.8, 5], dk: { duck: 1, log: 3, loon: 3, swimmer: 1, kayak: 1, wave: 2 }, kinds: { neck: 3, humps: 3, tail: 3 }, breach: 1, baby: 1, sail: 1, lm: ['light'], fog: 0.5, chop: 0.3, shy: 0.3, mimic: [8, 12], target: 660, blurb: 'Pink sky, grey mist.' },
    { name: 'Moonlit Champ', light: 'night', film: 12, n: 10, gap: [1.3, 2.3], spd: 1.65, warn: 0.75, decoy: [2.5, 4.5], dk: { duck: 1, log: 3, loon: 3, swimmer: 1, kayak: 1, wave: 3 }, kinds: { neck: 3, humps: 3, tail: 3 }, breach: 2, baby: 1, sail: 1, bomb: 1, fog: 0.25, chop: 0.35, shy: 0.35, mimic: [7, 11], target: 740, blurb: 'The big night. Make it count.' },
  ];
  // Lake Gazette assignments: one photo job per round. Done = +60 points, a front page in the scrapbook.
  const ASSIGN = [
    { t: 'Catch Champ winking', head: 'CHAMP WINKS AT BOARDWALK', ok: (p, g) => g.champ && g.wink && p.stars >= 3 },
    { t: 'Two 5★ photos', head: 'TOURIST NAILS IT TWICE', count: 2, ok: (p) => p.champ && p.stars >= 5 },
    { t: 'Don’t get fooled: only Champ photos', head: 'SPOTTER NOT FOOLED BY KAYAKS', end: () => S.photos.length >= 4 && S.photos.every(p => p.champ) },
    { t: 'Photograph Baby Champ', head: 'BABY CHAMP SPOTTED IN FOG', ok: (p) => p.champ && p.kind === 'baby' && p.stars >= 3 },
    { t: 'Champ with the sailboat', head: 'SAILORS GET A SURPRISE', ok: (p) => p.champ && p.kind === 'sail' && p.stars >= 3 },
    { t: 'Three sharp 4★ shots', head: 'CRYSTAL CLEAR IN THE CHOP', count: 3, ok: (p, g) => g.champ && p.stars >= 4 && g.blur < 0.05 },
    { t: 'A streak of 4', head: 'LOCAL SPOTTER ON A ROLL', streak: 4 },
    { t: 'Big Breach at 4★+', head: 'CHAMP LEAPS FOR THE MOON', ok: (p) => p.champ && p.kind === 'breach' && p.stars >= 4 },
  ];

  // ---------- mastery: style shots, mastery goals, encores ----------
  // Style shots are compositions only a careful photographer gets. Each pays a small bonus once per sighting and fills the Shot Book.
  const STYLES = {
    wink: { n: 'Wink', pts: 5, hint: 'Catch Head & Neck mid-wink' },
    trio: { n: 'Full Trio', pts: 25, hint: 'All 3 humps in one frame, 4★+', stamp: 'TRIO!' },
    apex: { n: 'Peak Action', pts: 25, hint: 'Tail Flick or Big Breach at its very top, 4★+', stamp: 'APEX!' },
    bomb: { n: 'Photobomb', pts: 30, hint: 'Champ plus a duck, log or paddler in the frame, 3★+', stamp: 'PHOTOBOMB!' },
    postcard: { n: 'Postcard', pts: 40, hint: 'Champ with the lighthouse or the ferry in the frame, 3★+', stamp: 'POSTCARD!' },
    oneshot: { n: 'One Shot', pts: 0, hint: 'A 4★+ photo with your first and only frame on a sighting' },
    encore: { n: 'Encore', pts: 0, hint: 'Land a 4★ and Champ comes back. Photograph the encore, 3★+', stamp: 'ENCORE!' },
    master: { n: 'Masterpiece', pts: 40, hint: 'A 98+ photo: dead centre, right at the peak, clear water', stamp: 'MASTERPIECE!' },
  };
  const STYLE_ORDER = ['wink', 'oneshot', 'trio', 'apex', 'bomb', 'postcard', 'encore', 'master'];
  const MASTER_AT = 98, ENCORE_AT = 72, ENCORE_MULT = [1, 1.3, 1.5, 1.7];
  // encores are a reward for a great shot, not a second roll: each run only gets a few
  const encoreCap = () => S.mode === 'sunset' ? 1 + Math.floor(S.sightN / 5) : S.mode === 'daily' ? 1 : S.pro ? 2 : 1; // chains per run
  const chainMax = () => S.mode === 'sunset' || S.pro ? 3 : 2; // links per chain
  // three optional mastery goals per round (medals on the Rounds screen). Separate from the three round stars.
  const GOALS_N = [
    [{ t: 'Two PERFECT 5★ photos', stars: 5, n: 2 }, { t: 'Every sighting 3★ or better', end: 'sweep' }, { t: 'Finish with 3+ shots unused', end: 'thrift', n: 3 }],
    [{ t: 'Postcard: Champ with the lighthouse', tag: 'postcard' }, { t: 'All 3 humps in one frame', tag: 'trio' }, { t: 'Two one-shot 4★ sightings', tag: 'oneshot', n: 2 }],
    [{ t: 'Photobomb: Champ + a duck or log', tag: 'bomb' }, { t: 'Peak action: tail or breach at its top', tag: 'apex' }, { t: 'A streak of 5', streak: 5 }],
    [{ t: 'Every sighting 3★ or better', end: 'sweep' }, { t: 'Three one-shot 4★ sightings', tag: 'oneshot', n: 3 }, { t: 'Win an encore', tag: 'encore' }],
    [{ t: 'Postcard: Champ with the ferry', tag: 'postcard' }, { t: 'A MASTERPIECE (98+)', tag: 'master' }, { t: 'Finish with 2+ shots unused', end: 'thrift', n: 2 }],
    [{ t: 'Two photobombs', tag: 'bomb', n: 2 }, { t: 'Two peak-action shots', tag: 'apex', n: 2 }, { t: 'A streak of 6', streak: 6 }],
    [{ t: 'Postcard: Champ with the lighthouse', tag: 'postcard' }, { t: 'All 3 humps in one frame', tag: 'trio' }, { t: 'Win 2 encores', tag: 'encore', n: 2 }],
    [{ t: 'A MASTERPIECE (98+)', tag: 'master' }, { t: 'Three PERFECT 5★ in a row', run5: 3 }, { t: 'Perfect roll: every sighting 4★+', end: 'sweep4' }],
  ];
  function proGoals(i) {
    return [i >= 5 ? { t: 'Four PERFECT 5★ in a row', run5: 4 } : { t: (2 + (i >= 4 ? 1 : 0)) + ' PERFECT 5★ photos', stars: 5, n: 2 + (i >= 4 ? 1 : 0) }, { t: (3 + (i >= 3 ? 1 : 0)) + ' one-shot 4★ sightings', tag: 'oneshot', n: 3 + (i >= 3 ? 1 : 0) },
      i % 3 === 0 ? { t: 'A MASTERPIECE (98+)', tag: 'master' } : i % 3 === 1 ? { t: 'Win 2 encores', tag: 'encore', n: 2 } : { t: 'A postcard shot with a landmark', tag: 'postcard' }];
  }
  const GOALS_SUNSET = [{ t: 'Reach sighting 25', sight: 25 }, { t: 'An encore chain of 3', chain: 3 }, { t: 'Two MASTERPIECES (98+)', tag: 'master', n: 2 }];
  const SUNSET_RANKS = [[0, 'Day-tripper'], [500, 'Tourist'], [1000, 'Local'], [2000, 'Stringer'], [4000, 'Paparazzo'], [8000, 'Lake Legend']];
  const RANKS = [[0, 'Tourist'], [3, 'Snapper'], [8, 'Local'], [14, 'Stringer'], [22, 'Shutterbug'], [32, 'Staff Photographer'], [42, 'Lake Laureate'], [50, 'Champ Whisperer']];
  const MEDALS_TOTAL = GOALS_N.length * 3 * 2 + 3;
  // daily request: one style shot the whole lake asks for today (seeded). Extra bonus on top of the medal chase.
  const DAILY_REQ = [
    { tag: 'postcard', n: 1, t: 'Postcard: Champ with a landmark', need: 'lm' },
    { tag: 'bomb', n: 1, t: 'Photobomb: Champ + a duck or log', need: 'bomb' },
    { tag: 'trio', n: 1, t: 'All 3 humps in one frame', need: 'humps' },
    { tag: 'apex', n: 1, t: 'Peak action: tail or breach at its top', need: 'tail' },
    { tag: 'oneshot', n: 3, t: 'Three one-shot 4★ sightings' },
    { tag: 'wink', n: 2, t: 'Catch Champ winking twice', need: 'neck' },
    { tag: 'encore', n: 1, t: 'Win an encore' },
  ];
  function goalsFor(mode, round, pro) { return mode === 'sunset' ? GOALS_SUNSET : mode === 'daily' ? [] : pro ? proGoals(round) : (GOALS_N[round] || []); }
  function goalKey(mode, round, pro) { return mode === 'sunset' ? 's' : (pro ? 'p' : 'n') + round; }
  function medalCount() { let n = 0; Object.keys(save.goals || {}).forEach(k => { (save.goals[k] || []).forEach(v => { if (v) n++; }); }); return n; }
  function rankOf(n) { let r = RANKS[0][1]; RANKS.forEach(a => { if (n >= a[0]) r = a[1]; }); return r; }
  function sunsetRank(sc) { let r = SUNSET_RANKS[0][1]; SUNSET_RANKS.forEach(a => { if (sc >= a[0]) r = a[1]; }); return r; }
  function goalsReset(mode, round, pro) {
    S.goals = goalsFor(mode, round, pro); S.gkey = goalKey(mode, round, pro); S.gprog = S.goals.map(() => 0); S.gdone = S.goals.map(() => false); S.goalsNew = [];
    S.tagCount = {}; S.encoreNext = null; S.chainBest = 0; S.req = null; S.reqN = 0; S.reqDone = false; S.run5 = 0; S.encoresUsed = 0; S.shyTold = false; S.nextMimic = -1; S.newShots = [];
  }
  function goalHit(i) {
    if (S.gdone[i]) return; S.gdone[i] = true; S.goalsNew.push(i);
    save.goals = save.goals || {}; const a = (save.goals[S.gkey] || []).slice(0, 3); while (a.length < 3) a.push(false);
    const had = a[i]; a[i] = true; save.goals[S.gkey] = a; persist();
    toast('◆ MASTERY GOAL' + (had ? ' AGAIN' : '!'), S.goals[i].t); Snd.medal(); buzz([15, 30, 15, 30, 20]); S.hudDirty = true;
  }
  function goalsPhoto(photo, newTags, ev) {
    S.goals.forEach((G, i) => {
      if (S.gdone[i]) return;
      if (G.tag) { if (newTags.indexOf(G.tag) >= 0) S.gprog[i]++; }
      else if (G.stars) { if (photo.champ && photo.stars >= G.stars && ev && !ev['gs' + i]) { ev['gs' + i] = true; S.gprog[i]++; } }
      else if (G.streak) S.gprog[i] = Math.max(S.gprog[i], Math.min(S.streak, G.streak));
      else if (G.run5) S.gprog[i] = Math.max(S.gprog[i], Math.min(S.run5 || 0, G.run5));
      else return;
      if (S.gprog[i] >= (G.n || G.streak || G.run5 || 1)) goalHit(i);
    });
    if (S.req && !S.reqDone && newTags.indexOf(S.req.tag) >= 0) {
      S.reqN++; S.hudDirty = true;
      if (S.reqN >= S.req.n) { S.reqDone = true; S.score += 50; pop(W / 2, 132 + insetTopW, 'REQUEST DONE! +50', '#ffe36b', 22); toast('TODAY’S REQUEST DONE!', S.req.t); Snd.medal(); buzz([15, 30, 15]); }
    }
  }
  function goalsEnd(pass) {
    S.goals.forEach((G, i) => {
      if (S.gdone[i] || !G.end || !pass) return;
      if (G.end === 'sweep' && S.sights.length && S.sights.every(x => (x.best || 0) >= 52)) goalHit(i);
      if (G.end === 'sweep4' && S.sights.length && S.sights.every(x => (x.best || 0) >= 72)) goalHit(i);
      if (G.end === 'thrift' && S.film >= G.n) goalHit(i);
    });
  }
  // landmarks: the lighthouse is painted into the backdrop, the ferry crosses the horizon. A postcard frames Champ with one.
  function landmarkBox(lm) {
    if (lm === 'light') { const x = Art.lightX(); return { x0: x - 4, x1: x + 4, y0: HY - 15, y1: HY + 3 }; }
    const x = Art.ferryX(S.t); return { x0: x - 18, x1: x + 16, y0: HY - 13, y1: HY + 3 };
  }
  function landmarkIn(f) {
    for (const lm of ['light', 'ferry']) {
      const b = landmarkBox(lm), ix = Math.max(0, Math.min(b.x1, f.x1) - Math.max(b.x0, f.x0)), iy = Math.max(0, Math.min(b.y1, f.y1) - Math.max(b.y0, f.y0));
      if (ix * iy / ((b.x1 - b.x0) * (b.y1 - b.y0)) >= (lm === 'light' ? 0.85 : 0.6)) return lm;
    }
    return null;
  }
  function lmSpot(lm) {
    const y = HY + (land ? 26 : 36) + 4, s = Art.depthScale(y), m = 66 * s + 12, xMax = land ? W - m - PW * UI * 1.4 : W - m;
    let x = lm === 'ferry' ? Art.ferryX(S.t + 1.2) : Art.lightX() + (rand() - 0.5) * 30;
    if (lm === 'ferry' && (x < m + 20 || x > xMax - 20)) { lm = 'light'; x = Art.lightX() + (rand() - 0.5) * 30; }
    return { x: clamp(x, m, xMax), y, lm };
  }
  // a duck or log drifts in right beside the spot, so framing both takes a compromise on centring
  function addCritter(ev) {
    const kind = pick(['duck', 'log']), s = Art.depthScale(ev.y), side = ev.x > W * 0.62 ? -1 : ev.x < W * 0.38 ? 1 : (rand() < 0.5 ? -1 : 1);
    const d = { id: ++S.idc, kind, x: ev.x + side * 62 * s, y: ev.y + 3, s: s * (kind === 'duck' ? 1.08 : 1), dir: -side, vx: 0, t: 0, life: ev.warn + ev.D + 1.5, e: 1, ph: rand() * 6, moving: false, tilt: 0, called: false, bomb: true };
    S.decoys.push(d);
  }
  function encoreOK(ev) {
    return !S.noEncore && ev.best >= ENCORE_AT && (ev.encore || 0) < chainMax() && (ev.encore > 0 || S.encoresUsed < encoreCap()) && S.film >= 1 && !S.attract && !S.tut && !(S.mode === 'campaign' && S.round === 0 && !S.pro);
  }
  function spawnEncore() {
    const e = S.encoreNext; S.encoreNext = null;
    if (!e || S.film < 1 || S.phase !== 'play') return;
    const sp = pickSpot(e.kind), ev = newEv(e.kind, { x: sp.x, y: sp.y, encore: e.chain, warn: Math.max(0.5, 0.78 - 0.08 * e.chain) });
    if (e.chain === 1) S.encoresUsed++; S.chainBest = Math.max(S.chainBest || 0, e.chain); save.encoreBest = Math.max(save.encoreBest || 0, e.chain);
    pop(ev.x, ev.y - 56 * ev.s, 'ENCORE ×' + ENCORE_MULT[e.chain], '#8be8ff', 22); Snd.encore(); buzz([20, 30, 20]);
    S.goals.forEach((G, i) => { if (G.chain && !S.gdone[i]) { S.gprog[i] = Math.max(S.gprog[i], e.chain); if (e.chain >= G.chain) goalHit(i); } });
  }
  const ATTRACT = { name: 'Attract', light: 'morning', gap: [3.5, 5.5], spd: 1.0, warn: 1.0, decoy: [6, 9], dk: { duck: 2, log: 2, loon: 2, swimmer: 1 }, kinds: { neck: 3, humps: 3, tail: 2 }, fog: 0, chop: 0.1 };
  const SUNSET_WX = [[0, 0.3], [0.5, 0.2], [0, 0.9], [0.3, 0.5], [0.65, 0.1]];

  const CAP = {
    champ: [
      ['Blurry. Could be a log.', 'A very artistic splash.', 'Is that... a cloud?'],   // 0-1 star
      ['Proof! Technically.', 'My cousin will say it’s fake.', 'Champ was shy today.'], // 1
      ['Pretty sure that’s a monster.', 'Not bad for a tourist.', 'Squint and it’s Champ.'], // 2
      ['Local-paper worthy.', 'Champ has a good side.', 'Now we’re talking.'], // 3
      ['Frame this one!', 'Postcard quality.', 'Champ said cheese.'], // 4
      ['Front-page material.', 'Pulitzer? Maybe.', 'The whole lake saw that.'], // 5
    ],
    blurry: ['Blurry. Could be a log.', 'Shaky cam. Spooky lake.', 'Champ or a smudge?'],
    under: ['Mostly lake, honestly.', 'Where did he go?', 'Ripples. Great ripples.'],
    wink: ['Champ winked!', 'He knows the camera.'],
    loon: ['Lovely loon. Zero monsters.', 'Loon-y shot.'],
    log: ['Breaking: log spotted.', 'That’s a log. A good log.'],
    swimmer: ['A brave swimmer. Brrr.', 'He’s not Champ. He’s cold.'],
    kayak: ['A paddler. Not a cryptid.', 'Kayak, not kraken.'],
    wave: ['Just a wave. Waves are free!', 'Whitecap. Not a scoop.'],
    mimic: ['Humps with no ripples? A log.', 'Champ makes ripples. This didn’t.', 'Mossy log, fooled you. Fooled me too.'],
    duck: ['A rubber duck. Cute. Wasted.', 'Squeaky clean. Zero scoops.'],
    early: ['Too early! He’s still under.', 'Lovely ripples. No monster yet.', 'Patience, paparazzo.'],
    miss: ['Champ was just out of frame!', 'A lovely shot of next to Champ.', 'So close. Aim right at him.'],
    dove: ['He just dove. Classic Champ.', 'Missed him by a whisker.', 'Ripples… and regret.'],
    empty: ['Nice lake. Very wet.', 'A photo of water. Bold.', 'The mountains look great, though.'],
    sky: ['A lovely photo of sky.', 'Clouds: 10/10. Monsters: 0.'],
  };
  const TOUR_LINES = ['Nice day for a log.', 'Is that the ferry?', 'Mmm, fudge...', 'Did I leave the stove on?', 'Cute duck!', 'Pretty mountains!', 'Nothing ever happens here.', 'Selfie time!', 'Champ? Never heard of him.', 'Is it Tuesday?', 'Wow, a cloud!'];
  const TOUR_SNAP = ['Cheese!', 'Say fudge!', 'Looking good!'];

  // ---------- save ----------
  const SAVE_KEY = 'champspotter.save.v1';
  const blankSave = () => ({ maxRound: 0, rounds: {}, sunsetBest: 0, sunsetSights: 0, sights: {}, life: {}, album: [], tut: false, photosTaken: 0, idc: 0, daily: null, assign: {}, pro: {}, dailyMedals: { 1: 0, 2: 0, 3: 0 }, gold: 0, goals: {}, shots: {}, best: {}, master: 0, encoreBest: 0, reqs: 0, told: {} });
  let save = blankSave();
  function loadSave() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (s && typeof s === 'object') save = Object.assign(save, s);
    } catch (e) { /* ignore */ }
    const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
    save.maxRound = clamp(Math.floor(Number(save.maxRound)) || 0, 0, ROUNDS.length);
    if (!isObj(save.rounds)) save.rounds = {}; if (!isObj(save.sights)) save.sights = {}; if (!isObj(save.life)) save.life = {};
    if (!Array.isArray(save.album)) save.album = [];
    if (!isObj(save.assign)) save.assign = {};
    if (!isObj(save.pro)) save.pro = {};
    if (!isObj(save.dailyMedals)) save.dailyMedals = { 1: 0, 2: 0, 3: 0 };
    save.gold = Math.max(0, Math.floor(Number(save.gold) || 0));
    if (!isObj(save.goals)) save.goals = {}; if (!isObj(save.shots)) save.shots = {}; if (!isObj(save.best)) save.best = {};
    Object.keys(save.goals).forEach(k => { const a = save.goals[k]; save.goals[k] = Array.isArray(a) ? [0, 1, 2].map(i => a[i] === true) : [false, false, false]; });
    Object.keys(save.shots).forEach(k => { save.shots[k] = Math.max(0, Math.floor(Number(save.shots[k]) || 0)); });
    Object.keys(save.best).forEach(k => { const b = save.best[k]; save.best[k] = isObj(b) ? { score: Number(b.score) || 0, stars: Number(b.stars) || 0 } : { score: 0, stars: 0 }; });
    if (!isObj(save.told)) save.told = {};
    save.master = Math.max(0, Math.floor(Number(save.master) || 0)); save.encoreBest = clamp(Math.floor(Number(save.encoreBest) || 0), 0, 3); save.reqs = Math.max(0, Math.floor(Number(save.reqs) || 0));
    save.album = save.album.filter(a => a && typeof a === 'object' && typeof a.score === 'number').slice(0, 18);
    const isDay = (k) => typeof k === 'string' && /^\d{4}-\d\d-\d\d$/.test(k);
    if (!isObj(save.daily) || !isDay(save.daily.key)) save.daily = null;
    else {
      if (!isDay(save.daily.last)) save.daily.last = null;
      save.daily.best = Number(save.daily.best) || 0; save.daily.streak = Number(save.daily.streak) || 0; save.daily.plays = Number(save.daily.plays) || 0; }
    save.sunsetBest = Number(save.sunsetBest) || 0; save.idc = Number(save.idc) || 0; save.tut = save.tut === true;
  }
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* quota or private mode */ } }

  // ---------- layout ----------
  let W = 360, H = 780, HY = 234, BY = 668, cssScale = 1, dpr = 1, K = 1, land = false, UI = 1, F = 104;
  let insetTopW = 0, insetBotW = 0, lastLayout = { w: 0, h: 0 };
  function layout(force) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const isLand = vw / vh > 1.12;
    const prev = lastLayout;
    const stageH = parseFloat(stage.style.height) || 0, shrunk = stageH && vh < stageH - 2; // content would be cut off
    if (!force && !shrunk && prev.w === vw && prev.h && Math.abs(vh - prev.h) / prev.h < 0.2 && isLand === land) return;
    if (!force && !shrunk && prev.w && isLand === land && Math.abs(vw - prev.w) < 2 && Math.abs(vh - prev.h) / prev.h < 0.2) return;
    lastLayout = { w: vw, h: vh };
    const oW = W, oHY = HY, oBY = BY, oLand = land;
    land = isLand;
    let nW, nH;
    if (land) { nH = 460; nW = clamp(nH * vw / vh, 540, 1120); } else { nW = 360; nH = clamp(nW * vh / vw, 600, 820); }
    const cw = Math.min(vw, vh * nW / nH), ch = cw * nH / nW;
    stage.style.width = cw + 'px'; stage.style.height = ch + 'px';
    stage.style.left = Math.round((vw - cw) / 2) + 'px'; stage.style.top = Math.round((vh - ch) / 2) + 'px';
    cssScale = cw / nW;
    document.documentElement.style.setProperty('--u', cssScale + 'px');
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:0;top:0;width:1px;visibility:hidden;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)';
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe), it = parseFloat(cs.paddingTop) || 0, ib = parseFloat(cs.paddingBottom) || 0;
    document.body.removeChild(probe);
    const touchTop = Math.abs(vh - ch) < 2, topPx = touchTop ? it : 0, botPx = touchTop ? ib : 0;
    document.documentElement.style.setProperty('--inset-top', topPx + 'px');
    document.documentElement.style.setProperty('--inset-bot', botPx + 'px');
    insetTopW = topPx / cssScale; insetBotW = botPx / cssScale;
    W = nW; H = nH;
    UI = land ? 0.82 : 1; F = Math.round(104 * (land ? 0.92 : 1));
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    K = cv.width / W;
    Art.setup(W, H, K, land);
    HY = Art.G.HY; BY = Art.G.BY - Math.round(insetBotW * 0.4);
    Art.G.BY = BY;
    document.body.classList.toggle('compact', H < 560);
    document.body.classList.toggle('short', !land && H < 700);
    if (S && (oW !== W || oLand !== land)) remap(oW, oHY, oBY);
    if (!force && !shrunk && S && S.screen === 'play' && !S.paused) { pause(); $('#pauseSub').textContent = 'Phone turned: tap RESUME when you’re ready'; }
  }
  function remap(oW, oHY, oBY) {
    const fx = (x) => x * W / oW, fy = (y) => HY + (y - oHY) / Math.max(1, oBY - oHY) * (BY - HY);
    const fix = (o) => { if (!o) return; o.x = fx(o.x); o.y = fy(o.y); };
    fix(S.ev); S.decoys.forEach(fix); S.boats.forEach(fix); S.rings.forEach(fix); S.parts.forEach(fix); S.pops.forEach(fix);
    S.lastSpot = null;
  }

  // ---------- state ----------
  const S = {
    screen: 'title', mode: 'campaign', round: 0, R: ATTRACT, attract: true, paused: false, t: 0, phase: 'attract', introT: 0, endT: 0,
    film: 0, filmMax: 9, score: 0, shownScore: 0, streak: 0, bestStreak: 0, photos: [], sights: [], sightsDone: 0, sightN: 0,
    ev: null, queue: [], nextSight: 2, nextDecoy: 5, decoys: [], boats: [], rings: [], parts: [], pops: [], flashes: [], pols: [], snapQ: [],
    wx: { fog: 0, chop: 0.1 }, wxT: { fog: 0, chop: 0.1 }, light: 'morning', shake: 0, lastSpot: null, tourists: [], bubbles: [], hud: true,
    tut: false, tutHand: 0, rareFound: [], newSights: [], noPause: false, headless: false, idc: 0, hudDirty: true, sunsetWxT: 0, decoysOK: true, evCount: 0,
    runStart: 0, bestPhoto: null, birds: [], nextBirds: 6,
    goals: [], gprog: [], gdone: [], gkey: '', goalsNew: [], tagCount: {}, encoreNext: null, chainBest: 0, req: null, reqN: 0, reqDone: false,
  };

  // ---------- helpers: geometry ----------
  const wobble = (o) => (S.wx.chop > 0.02 ? S.wx.chop * 2.6 * Math.sin(S.t * 2.4 + o.x * 0.03) * (o.s || 1) : 0);
  function pickSpot(kind) {
    const yMin = HY + (land ? 26 : 36), yMax = BY - Math.round(104 * UI);
    let best = null;
    for (let i = 0; i < 16; i++) {
      const y = yMin + (yMax - yMin) * Math.pow(rand(), 0.9), s = Art.depthScale(y) * (kind === 'baby' ? 1.15 : 1);
      const m = 66 * s + 12, xr = land ? W - 2 * m - PW * UI * 1.4 : W - 2 * m, x = m + rand() * xr; // landscape: keep clear of the polaroid corner
      let ok = true;
      if (S.lastSpot && Math.hypot(S.lastSpot.x - x, (S.lastSpot.y - y) * 1.6) < 95) ok = false;
      S.decoys.forEach(d => { if (Math.abs(d.y - y) < 40 && Math.abs(d.x - x) < 90) ok = false; });
      best = { x, y, s };
      if (ok) break;
    }
    return best;
  }

  // ---------- champ events ----------
  function newEv(kind, opts) {
    opts = opts || {};
    const sp = opts.x !== undefined ? { x: opts.x, y: opts.y, s: Art.depthScale(opts.y) * (kind === 'baby' ? 1.15 : 1) } : pickSpot(kind);
    const dir = opts.dir || (sp.x < W * 0.35 ? 1 : sp.x > W * 0.65 ? -1 : (rand() < 0.5 ? 1 : -1));
    const R = S.R, tutorial = S.tut && S.sightN === 0;
    // fast flicks (tail, breach) only speed up with the square root of the round speed, so their sweet spot stays
    // wider than a human reaction spread even in late rounds
    let D = BASE_D[kind] / (kind === 'tail' || kind === 'breach' ? Math.sqrt(R.spd || 1) : (R.spd || 1));
    if (tutorial) D = 3.7;
    if (opts.encore) D *= 1 - 0.07 * opts.encore; // each encore link is a little quicker
    const gold = !tutorial && !S.attract && !S.headless && !opts.encore && rand() < (S.mode === 'sunset' || S.pro ? 0.06 : 0.03);
    const ev = { gold, id: ++S.idc, kind, x: sp.x, y: sp.y, s: sp.s * 1.12 * (kind === 'humps' || kind === 'sail' ? 0.94 : 1), dir, state: 'warn', t: 0, warn: tutorial ? 1.4 : (opts.warn || R.warn || 1), D: opts.D || D, u: 0, ringT: 0, best: 0, shots: 0, refW: 1, s1: false, s2: false, tut: tutorial, idx: opts.encore ? -1 : S.sightN, encore: opts.encore || 0, shy: opts.shy !== undefined ? !!opts.shy : !tutorial && !opts.encore && !S.attract && rand() < (R.shy || 0) * (S.mode === 'sunset' ? Math.min(2.5, 1 + S.sightN / 10) : 1), lm: opts.lm || null, bomb: !!opts.bomb, tagged: {} };
    ev.refW = refWeight(ev);
    ev.vx = S.attract ? 0 : ev.dir * (DRIFT[kind] || 0) * ev.s * Math.sqrt(R.spd || 1);
    S.ev = ev; S.lastSpot = { x: ev.x, y: ev.y };
    if (kind === 'sail') {
      const v = 17 * ev.s, tPeak = ev.warn + 0.42 * ev.D;
      const b = { x: ev.x - dir * 54 * ev.s + (-dir) * v * 0 , y: ev.y - 18 * ev.s, s: ev.s * 1.0, dir, v, t: 0, bx0: 0 };
      b.x = ev.x - dir * 50 * ev.s - dir * v * tPeak;
      S.boats.push(b);
    }
    Snd.ripple(); if (!opts.encore) S.sightN++;
    S.evCount++;
    if (!S.attract && !S.headless && S.screen === 'play' && (kind === 'tail' || kind === 'breach') && !(save.told || (save.told = {}))[kind]) { save.told[kind] = 1; persist(); toast(kind === 'tail' ? 'TAIL FLICK' : 'BIG BREACH', kind === 'tail' ? 'It blurs while it flicks. Snap when it holds still.' : 'Snap at the very top of the leap, not on the way up.'); }
    if (ev.shy && !S.shyTold && !S.headless) { S.shyTold = true; toast('SHY CHAMP', 'Blue ripples: snap too early and he bolts'); }
    if (opts.bomb) { addCritter(ev); pop(ev.x, ev.y - 56 * ev.s, 'PHOTOBOMB CHANCE!', '#fff0b0', 17); }
    if (opts.lm && !S.attract) pop(ev.x, ev.y - 56 * ev.s, 'POSTCARD SPOT!', '#fff0b0', 17);
    return ev;
  }
  // the sparkle is training wheels: Rounds 1–4 and the first sightings of Sunset. Later rounds, PRO and the Daily make you read the pose.
  function sparkleOn() { return S.mode === 'campaign' ? (S.round < 4 && !S.pro) : S.mode === 'sunset' ? S.sightN <= 8 : false; }
  // where a player sees "the middle": the weighted centre of everything above the surface
  function massCenter(ev, p, bob) {
    let sx = 0, sy = 0, sw = 0;
    sampleWorld(ev, p, bob).forEach(q => { if (q.above) { sx += q.x * q.w; sy += q.y * q.w; sw += q.w; } });
    return sw > 0 ? { x: sx / sw, y: sy / sw } : null;
  }
  function refWeight(ev) {
    let mx = 1;
    for (let i = 0; i <= 28; i++) {
      const p = Art.pose(ev.kind, i / 28, 1), w = sampleWorld(ev, p, 0);
      let a = 0; w.forEach(q => { if (q.above) a += q.w; }); mx = Math.max(mx, a);
    }
    return mx;
  }
  function worldEls(ev, p, bob) {
    return p.els.map(q => ({ x: ev.x + ev.dir * ev.s * q.x, y: ev.y + bob + ev.s * q.y, rx: ev.s * q.rx, ry: ev.s * q.ry, part: q.part, e: q.e }));
  }
  const SPT = [[0, 0], [0.55, 0], [-0.55, 0], [0, 0.55], [0, -0.55]];
  function sampleWorld(ev, p, bob) {
    const out = [], wl = ev.y + bob;
    worldEls(ev, p, bob).forEach(q => {
      const w = q.rx * q.ry / SPT.length;
      SPT.forEach(o => { const x = q.x + o[0] * q.rx, y = q.y + o[1] * q.ry; out.push({ x, y, w, above: y < wl }); });
    });
    return out;
  }
  function splash(ev, big) {
    const bob = wobble(ev), n = big ? 16 : 8, s = ev.s;
    const spots = ev.kind === 'humps' || ev.kind === 'sail' ? [-30, 0, 30] : [0];
    spots.forEach(dx => {
      const x = ev.x + ev.dir * dx * s;
      S.rings.push({ x, y: ev.y + bob, r: 4, vr: 40 * s * (big ? 1.4 : 1), a: 0.9, life: 1.1, t: 0, flat: 0.3, w: 2.2 * s + 0.6 });
      S.rings.push({ x, y: ev.y + bob, r: 2, vr: 26 * s * (big ? 1.4 : 1), a: 0.7, life: 1.4, t: 0.12, flat: 0.3, w: 1.6 * s + 0.5 });
      for (let i = 0; i < n / spots.length + 2; i++) S.parts.push({ x: x + (rand() - 0.5) * 30 * s, y: ev.y + bob - 2, vx: (rand() - 0.5) * 70 * (big ? 1.6 : 1), vy: -(60 + rand() * 120) * (big ? 1.5 : 1) * Math.sqrt(s), t: 0, life: 0.7 + rand() * 0.5, r: 1.2 + rand() * 1.8 * s });
    });
    Snd.splash(big ? 1.4 : 0.8);
    if (big) { S.shake = Math.max(S.shake, ev.kind === 'breach' ? 5 : 2); }
  }
  function updateEv(dt) {
    const ev = S.ev; if (!ev) return;
    ev.t += dt;
    if (ev.state === 'warn') {
      ev.ringT -= dt;
      if (ev.ringT <= 0) {
        // pulses quicken and grow as he gets close to the surface
        const k = clamp(ev.t / ev.warn, 0, 1);
        ev.ringT = (0.34 - 0.16 * k) * (ev.shy ? 1.3 : 1);
        S.rings.push({ gold: ev.gold, enc: !!ev.encore, shy: ev.shy, x: ev.x, y: ev.y, r: 4 + 6 * k * ev.s, vr: (30 + 16 * k) * ev.s + 6, a: 0.9, life: 1.3, t: 0, flat: 0.3, w: (2.1 + 0.8 * k) * ev.s + 0.7 });
        if (rand() < 0.7) S.parts.push({ x: ev.x + (rand() - 0.5) * 26 * ev.s, y: ev.y, vx: 0, vy: -26, t: 0, life: 0.9, r: 1.4 * ev.s + 0.6, bubble: true });
      }
      if (ev.t >= ev.warn) { ev.state = 'up'; ev.t = 0; if (ev.kind === 'breach') Snd.whoosh(); }
    } else if (ev.state === 'up') {
      ev.u = ev.t / ev.D;
      if (ev.vx) { const m = 66 * ev.s + 12; ev.x += ev.vx * dt; if (ev.x < m || ev.x > W - m) { ev.x = clamp(ev.x, m, W - m); ev.vx = 0; } }
      // peak glint: fires as the pose climbs toward its best moment, so a human tap lands on the peak
      if (!ev.glint && ev.t >= (PEAK_U[ev.kind] || 0.5) * ev.D - GLINT_LEAD) { ev.glint = S.t; ev.showGlint = sparkleOn(); if (ev.showGlint && !S.headless && !S.attract && S.screen === 'play') Snd.ting(); }
      if (!ev.s1 && ev.u > (ev.kind === 'breach' ? 0.0 : 0.05)) { ev.s1 = true; splash(ev, ev.kind === 'breach' ? 2 : 0); }
      if (!ev.s2 && ev.u > (ev.kind === 'breach' ? 0.96 : 0.92)) { ev.s2 = true; splash(ev, ev.kind === 'breach' ? 2 : 0); }
      if (ev.t >= ev.D + 0.15) finishEv();
    }
  }
  function finishEv() {
    const ev = S.ev; S.ev = null;
    if (S.screen === 'play') {
      const st = ev.idx >= 0 ? S.sights[ev.idx] : null;
      if (st) st.best = ev.best;
      if (st && st.status === 'pending') {
        st.status = ev.best >= 14 ? 'got' : 'missed';
        if (st.status === 'missed') pop(ev.x, ev.y - 40 * ev.s, ev.shots ? 'Not a keeper' : 'Got away!', '#ffd0c8', 20);
      }
      if (ev.idx >= 0) S.sightsDone++;
      S.hudDirty = true;
      // a 4★+ photo earns an encore: he comes back for another look (needs film to spare)
      if (S.phase === 'play' && encoreOK(ev)) S.encoreNext = { kind: ev.kind === 'sail' ? 'humps' : ev.kind, chain: (ev.encore || 0) + 1, t: 0.85 };
    }
    S.nextSight = (S.encoreNext ? 0.85 : rr(S.R.gap)) * (S.mode === 'sunset' ? Math.max(0.55, 1 - S.sightN * 0.012) : 1);
  }

  // ---------- decoys ----------
  function spawnDecoy(kind) {
    if (!kind) { kind = wpick(S.R.dk); if (kind !== 'wave' && S.decoys.some(d => d.kind === kind)) kind = wpick(S.R.dk); if (kind !== 'wave' && S.decoys.some(d => d.kind === kind)) return null; }
    const yMin = HY + 20, yMax = BY - Math.round(96 * UI);
    let y = yMin + (yMax - yMin) * Math.pow(rand(), 0.85);
    const s = Art.depthScale(y) * (kind === 'duck' ? 1.08 : 1);
    const mover = kind === 'kayak' || kind === 'loon' || kind === 'swimmer' || kind === 'log' || kind === 'duck';
    let dir = rand() < 0.5 ? 1 : -1, x, life, vx = 0, e = 1;
    const spd = { loon: 22, log: 8, swimmer: 9, kayak: 22, duck: 6 }[kind] || 0;
    if (kind === 'wave') {
      const m = 40 * s + 10; x = m + rand() * (W - 2 * m); life = 1.9;
      if (S.ev && Math.abs(S.ev.x - x) < 70 && Math.abs(S.ev.y - y) < 40) return null;
    } else {
      x = dir > 0 ? -50 * s : W + 50 * s; life = (W + 100 * s) / (spd * s) + 1;
      if (kind === 'loon') { x = W * (0.15 + rand() * 0.7); life = 8; }
      if (kind === 'duck') { x = W * (0.12 + rand() * 0.76); life = 12; }
      if (kind === 'log' && rand() < 0.5) { x = W * (0.12 + rand() * 0.76); life = 14; }
      vx = dir * spd * s;
    }
    const d = { id: ++S.idc, kind, x, y, s, dir, vx, t: 0, life, e, ph: rand() * 6, moving: kind === 'kayak' || kind === 'swimmer' || kind === 'loon', tilt: (rand() - 0.5) * 0.08, called: false };
    S.decoys.push(d);
    if (kind === 'loon' && !S.headless && rand() < 0.5) setTimeout(() => { if (S.decoys.indexOf(d) >= 0) Snd.loon(); }, 300);
    return d;
  }
  // the mimic: a mossy log that rises like three humps, but with no ripples and no shadow first. Champ always gives himself away.
  function spawnMimic() {
    for (let t = 0; t < 8; t++) {
      const sp = pickSpot('humps'); if (S.ev && Math.hypot(S.ev.x - sp.x, (S.ev.y - sp.y) * 1.6) < 120) continue;
      S.decoys.push({ id: ++S.idc, kind: 'mimic', x: sp.x, y: sp.y, s: sp.s * 1.12 * 0.94, dir: rand() < 0.5 ? 1 : -1, vx: 0, t: 0, life: 3.4, e: 1, ph: rand() * 6, moving: false, tilt: 0, called: false });
      if (!S.headless && !(save.told || (save.told = {})).mimic) { save.told.mimic = 1; persist(); toast('MOSSY LOG', 'Humps with no ripples first? Not Champ. Skip it.'); }
      return;
    }
  }
  function updateDecoys(dt) {
    for (let i = S.decoys.length - 1; i >= 0; i--) {
      const d = S.decoys[i];
      d.t += dt; d.x += d.vx * dt;
      if (d.kind === 'wave') d.e = Math.pow(Math.sin(Math.PI * clamp(d.t / d.life, 0, 1)), 0.7);
      if (d.kind === 'loon' && d.t > d.life - 1.1) {
        const f = (d.t - (d.life - 1.1)) / 1.0; d.e = clamp(1 - f, 0, 1);
        if (!d.dived && f > 0.1) { d.dived = true; S.rings.push({ x: d.x, y: d.y, r: 3, vr: 22 * d.s, a: 0.8, life: 1.2, t: 0, flat: 0.3, w: 1.6 * d.s + 0.5 }); Snd.splash(0.35); }
      }
      if (d.t > d.life || d.x < -140 || d.x > W + 140) S.decoys.splice(i, 1);
    }
    for (let i = S.boats.length - 1; i >= 0; i--) {
      const b = S.boats[i]; b.t += dt; b.x += b.dir * b.v * dt;
      if (b.x < -150 || b.x > W + 150 || b.t > 40) S.boats.splice(i, 1);
    }
  }

  // ---------- spawner ----------
  function makeQueue(R) {
    if (R.fixed) return R.fixed.slice();
    const q = [];
    for (let i = 0; i < R.n; i++) q.push(wpick(R.kinds));
    const rares = [];
    if (R.baby) rares.push('baby'); if (R.sail) rares.push('sail'); for (let i = 0; i < (R.breach || 0); i++) rares.push('breach');
    (R.lm || []).forEach(lm => rares.push({ kind: wpick(R.kinds), lm }));
    for (let i = 0; i < (R.bomb || 0); i++) rares.push({ kind: wpick(R.kinds), bomb: true });
    const slots = []; for (let i = 1; i < R.n; i++) slots.push(i);
    rares.forEach(r => { if (!slots.length) return; const j = (rand() * slots.length) | 0; q[slots.splice(j, 1)[0]] = r; });
    return q;
  }
  function updateSpawner(dt) {
    const R = S.R;
    if (!S.ev && S.encoreNext && S.phase === 'play') { S.encoreNext.t -= dt; if (S.encoreNext.t <= 0) spawnEncore(); }
    else if (!S.ev && (S.attract || S.queue.length) && S.phase !== 'ending') {
      S.nextSight -= dt;
      if (S.nextSight <= 0) {
        const item = S.attract ? wpick(R.kinds) : S.queue.shift();
        if (S.mode === 'sunset' && S.queue.length === 0) S.queue.push(nextSunsetKind());
        if (item && typeof item === 'object') {
          if (item.lm) newEv(item.kind, lmSpot(item.lm)); else newEv(item.kind, Object.assign(item.fx !== undefined ? spotFromFrac(item) : pickSpot(item.kind), item.bomb ? { bomb: true } : {}));
        } else newEv(item);
      }
    }
    if (R.mimic && S.phase === 'play' && !S.attract && S.decoysOK && (S.mode !== 'sunset' || S.sightN > 5)) {
      if (S.nextMimic < 0) S.nextMimic = 5 + rr(R.mimic);
      S.nextMimic -= dt; if (S.nextMimic <= 0) { spawnMimic(); S.nextMimic = rr(R.mimic); }
    }
    if (S.decoysOK) {
      S.nextDecoy -= dt;
      if (S.nextDecoy <= 0) {
        const lim = S.mode === 'sunset' ? 4 : 3;
        if (S.decoys.filter(d => d.kind !== 'wave').length < lim) spawnDecoy();
        S.nextDecoy = rr(R.decoy) * (S.mode === 'sunset' ? Math.max(0.5, 1 - S.sightN * 0.015) : 1);
      }
    }
  }
  // daily lineups store spots as fractions of the lake so they fit any screen
  function spotFromFrac(it) {
    const yMin = HY + (land ? 26 : 36), yMax = BY - Math.round(104 * UI);
    const y = yMin + (yMax - yMin) * it.fy, s = Art.depthScale(y) * (it.kind === 'baby' ? 1.15 : 1), m = 66 * s + 12;
    return { x: m + it.fx * (land ? W - 2 * m - PW * UI * 1.4 : W - 2 * m), y };
  }
  function nextSunsetKind() {
    const n = S.sightN;
    const r = rand();
    if (n > 4 && n % 6 === 0) return { kind: wpick({ neck: 3, humps: 3, tail: 3 }), lm: rand() < 0.5 ? 'light' : 'ferry' };
    if (n > 6 && n % 6 === 3) return { kind: wpick({ neck: 3, humps: 3, tail: 3 }), bomb: true };
    if (n > 3 && r < 0.07) return 'baby';
    if (n > 5 && r < 0.14) return 'sail';
    if (n > 2 && r < 0.26) return 'breach';
    return wpick({ neck: 3, humps: 3, tail: 3 });
  }

  // ---------- effects ----------
  function pop(x, y, txt, col, size) { S.pops.push({ x, y, txt, col: col || '#fff', t: 0, life: 1.3, size: size || 22 }); }
  function updateFx(dt) {
    for (let i = S.rings.length - 1; i >= 0; i--) { const r = S.rings[i]; r.t += dt; if (r.t > 0) { r.r += r.vr * dt; } if (r.t > r.life) S.rings.splice(i, 1); }
    for (let i = S.parts.length - 1; i >= 0; i--) {
      const p = S.parts[i]; p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (!p.bubble) p.vy += 430 * dt;
      if (p.t > p.life) S.parts.splice(i, 1);
    }
    for (let i = S.pops.length - 1; i >= 0; i--) { const p = S.pops[i]; p.t += dt; p.y -= 30 * dt * (1 - p.t / p.life); if (p.t > p.life) S.pops.splice(i, 1); }
    for (let i = S.flashes.length - 1; i >= 0; i--) { const f = S.flashes[i]; f.t += dt; if (f.t > 0.55) S.flashes.splice(i, 1); }
    for (let i = S.bubbles.length - 1; i >= 0; i--) { const b = S.bubbles[i]; b.t += dt; if (b.t > b.life) S.bubbles.splice(i, 1); }
    S.shake = Math.max(0, S.shake - dt * 22);
    S.wx.fog += (S.wxT.fog - S.wx.fog) * Math.min(1, dt * 0.6);
    S.wx.chop += (S.wxT.chop - S.wx.chop) * Math.min(1, dt * 0.6);
  }

  // ---------- grading ----------
  function poseNow(ev) { return Art.pose(ev.kind, clamp(ev.u, 0, 1), S.t); }
  function decoyInFrame(d, f) {
    if (d.kind === 'wave' && d.e < 0.35) return false;
    const b = Art.decoyBox(d), ix = Math.max(0, Math.min(b.x1, f.x1) - Math.max(b.x0, f.x0)), iy = Math.max(0, Math.min(b.y1, f.y1) - Math.max(b.y0, f.y0));
    const area = (b.x1 - b.x0) * (b.y1 - b.y0);
    return ix * iy / Math.max(1, area) > 0.4;
  }
  function gradeSnap(sn) {
    const f = { x0: sn.x - F / 2, y0: sn.y - F / 2, x1: sn.x + F / 2, y1: sn.y + F / 2 };
    const res = { champ: false, kind: 'empty', comps: null, score: 0, stars: 0, blur: 0, bv: [0, 0], decoys: [], boatIn: false, wink: false, ev: null, under: 0 };
    const ev = S.ev;
    if (ev && ev.state === 'up') {
      const p = poseNow(ev), bob = wobble(ev);
      const pts = sampleWorld(ev, p, bob);
      let aw = 0, iw = 0, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, fx0 = 1e9, fy0 = 1e9, fx1 = -1e9, fy1 = -1e9;
      pts.forEach(q => {
        if (!q.above) return;
        aw += q.w; x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y);
        if (q.x >= f.x0 && q.x <= f.x1 && q.y >= f.y0 && q.y <= f.y1) { iw += q.w; fx0 = Math.min(fx0, q.x); fx1 = Math.max(fx1, q.x); fy0 = Math.min(fy0, q.y); fy1 = Math.max(fy1, q.y); }
      });
      res.under = aw / ev.refW;
      if (iw / ev.refW >= 0.07) {
        const mc = massCenter(ev, p, bob) || { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, cx = mc.x, cy = mc.y, d = Math.hypot(cx - sn.x, cy - sn.y);
        let cen = clamp(1 - Math.pow(d / (0.5 * F), 1.6), 0, 1); // centring matters: 5★ needs a tap near his middle
        const fill = Math.max(fx1 - fx0, fy1 - fy0) / F, size = clamp((fill - 0.12) / 0.44, 0, 1);
        const fogA = Art.fogAt(S.wx.fog, ev.y);
        const vis = clamp(iw / ev.refW, 0, 1) * (1 - 0.45 * fogA);
        const timing = (ev.kind === 'humps' || ev.kind === 'sail') ? Math.pow(clamp(p.pk, 0, 1), 1.7) : clamp(p.pk, 0, 1); // humps have a wide plateau, so make the peak itself count
        // motion: compare with the pose 1/30s earlier
        const dtp = 1 / 30, p0 = Art.pose(ev.kind, clamp((ev.t - dtp) / ev.D, 0, 1), S.t - dtp), w0 = sampleWorld(Object.assign({}, ev, { x: ev.x - (ev.vx || 0) * dtp }), p0, bob);
        let vx = 0, vy = 0, vw = 0;
        pts.forEach((q, i) => { if (!q.above || !(q.x >= f.x0 && q.x <= f.x1 && q.y >= f.y0 && q.y <= f.y1)) return; const o = w0[i]; vx += (q.x - o.x) * q.w; vy += (q.y - o.y) * q.w; vw += q.w; });
        vx = vx / Math.max(vw, 1e-6) / dtp; vy = vy / Math.max(vw, 1e-6) / dtp;
        const speed = Math.hypot(vx, vy) / Math.max(0.5, ev.s) * 0.9;
        const blur = clamp((speed - 38) / 120, 0, 1);
        const wink = !!(p.head && p.head.wink);
        // size is decided by where he surfaces, not by the player, so it no longer counts
        let base = 100 * (0.30 * cen + 0.38 * timing + 0.32 * vis);
        base = 100 * Math.pow(base / 100, 1.22);
        if (wink) base = Math.min(100, base + 7);
        const score = Math.round(clamp(base * (1 - 0.55 * blur), 0, 100));
        Object.assign(res, { champ: true, ev, kind: ev.kind, comps: { cen, size, timing, vis, blur }, score, blur, bv: [vx, vy], wink, u: ev.u, cut: iw / Math.max(1e-6, aw) });
        // all three humps wholly inside the frame (the Full Trio style shot)
        { const domes = worldEls(ev, p, bob).filter(q => q.part === 'dome' && q.e > 0.35); res.fit3 = domes.length >= 3 && domes.every(q => q.x - q.rx >= f.x0 && q.x + q.rx <= f.x1 && q.y - q.ry >= f.y0); }
        // sailboat in the frame?
        if (ev.kind === 'sail') S.boats.forEach(b => { const bb = { x0: b.x - 40 * b.s, x1: b.x + 40 * b.s, y0: b.y - 95 * b.s, y1: b.y + 6 }; const ix = Math.max(0, Math.min(bb.x1, f.x1) - Math.max(bb.x0, f.x0)), iy = Math.max(0, Math.min(bb.y1, f.y1) - Math.max(bb.y0, f.y0)); if (ix * iy / ((bb.x1 - bb.x0) * (bb.y1 - bb.y0)) > 0.28) res.boatIn = true; });
      }
    }
    S.decoys.forEach(d => { if (decoyInFrame(d, f)) res.decoys.push(d.kind); });
    if (!res.champ) {
      res.kind = res.decoys.length ? res.decoys[0] : (sn.y < HY - 6 ? 'sky' : 'empty');
      // aimed right at him but he wasn't up (yet / any more): say so, so it never feels like the game ignored the tap
      if (ev && !res.decoys.length && Math.abs(sn.x - ev.x) < F * 0.65 && Math.abs(sn.y - (ev.y - 14 * ev.s)) < F * 0.6) {
        res.kind = ev.state === 'warn' ? 'early' : res.under > 0.4 ? 'miss' : ev.u < (PEAK_U[ev.kind] || 0.5) ? 'early' : 'dove';
      }
    }
    res.stars = !res.champ ? 0 : res.score >= 94 ? 5 : res.score >= 72 ? 4 : res.score >= 52 ? 3 : res.score >= 34 ? 2 : res.score >= 14 ? 1 : 0;
    return res;
  }
  function hintFor(g) {
    const c = g.comps; if (!c) return '';
    if (g.stars >= 5) return 'PERFECT FRAME!';
    const early = g.u < (PEAK_U[g.kind] || 0.5);
    const EARLY = { neck: 'Too early — wait for the wink!', baby: sparkleOn() ? 'Too early — wait for the sparkle!' : 'Too early — let baby pop all the way up!', humps: 'Too early — wait for all 3 humps!', sail: 'Too early — wait for all 3 humps!', tail: sparkleOn() ? 'Too early — wait for the sparkle!' : 'Too early — wait till the tail holds still!', breach: 'Too early — snap at the top of the leap!' };
    const LATE = { neck: 'Too late — he’s sinking.', baby: 'Too late — baby’s diving.', humps: 'Too late — the humps are sinking.', sail: 'Too late — the humps are sinking.', tail: 'Too late — the tail’s going down.', breach: 'Too late — splashdown!' };
    const pen = [
      ['timing', (1 - c.timing) * 0.27 * 100, early ? (EARLY[g.kind] || EARLY.neck) : (LATE[g.kind] || LATE.neck)],
      ['vis', (1 - c.vis) * 0.3 * 100, g.under < 0.6 ? 'Mostly underwater.' : 'Cut off by the frame.'],
      ['cen', (1 - c.cen) * 0.23 * 100, 'Off-center — tap his middle.'],
      ['blur', c.blur * 0.55 * 60, 'Motion blur — snap at the pause.'],
    ].sort((a, b) => b[1] - a[1]);
    return pen[0][1] < 2 ? 'Nice one!' : pen[0][2];
  }
  function captionFor(g) {
    if (g.champ) {
      if (g.wink && g.stars >= 3) return pick(CAP.wink);
      if (g.blur > 0.5 && g.stars <= 2) return pick(CAP.blurry);
      if (g.stars <= 1 && g.under < 0.4) return pick(CAP.under);
      return pick(CAP.champ[g.stars]);
    }
    return pick(CAP[g.kind] || CAP.empty);
  }

  // ---------- snapping ----------
  function snap(x, y) {
    if (S.screen !== 'play' || S.paused || S.phase === 'intro') return false;
    if (S.phase === 'ending' && S.film <= 0) return false;
    if (S.film <= 0) { Snd.noFilm(); return false; }
    const nowMs = performance.now();
    if (S.lastSnap && nowMs - S.lastSnap.t < 350) return false; // the film has to wind on: mashing can't burn the roll
    S.lastSnap = { t: nowMs, x, y };
    S.film--; S.hudDirty = true;
    y = clamp(y, HY * 0.25, BY - 2);
    x = clamp(x, F / 2, W - F / 2); y = clamp(y, F / 2, H - F / 2);
    S.snapQ.push({ x, y });
    S.flashes.push({ x, y, t: 0 });
    Snd.shutter(); buzz(14);
    save.photosTaken = (save.photosTaken || 0) + 1;
    return true;
  }
  function processSnaps() {
    while (S.snapQ.length) { const sn = S.snapQ.shift(); developPhoto(sn); }
  }
  function developPhoto(sn) {
    const g = gradeSnap(sn);
    const cx = clamp(sn.x, F / 2, W - F / 2), cy = clamp(sn.y, F / 2, H - F / 2);
    const P = Math.round(F * K);
    const pc = document.createElement('canvas'); pc.width = pc.height = Math.max(8, P);
    if (!S.headless) {
      const pg = pc.getContext('2d');
      const sx = (cx - F / 2) * K, sy = (cy - F / 2) * K;
      if (g.blur > 0.12) {
        const n = 6, len = Math.min(26, g.blur * 22) * K * 0.5, vl = Math.hypot(g.bv[0], g.bv[1]) || 1, ux = g.bv[0] / vl, uy = g.bv[1] / vl;
        for (let i = 0; i < n; i++) {
          const o = (i / (n - 1) - 0.5) * len; pg.globalAlpha = 1 / (i + 1);
          pg.drawImage(cv, sx, sy, F * K, F * K, ux * o, uy * o, P, P);
        }
        pg.globalAlpha = 1;
      } else pg.drawImage(cv, sx, sy, F * K, F * K, 0, 0, P, P);
      const vg = pg.createRadialGradient(P / 2, P / 2, P * 0.35, P / 2, P / 2, P * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(20,10,0,0.28)');
      pg.fillStyle = vg; pg.fillRect(0, 0, P, P);
    }
    let kind = g.kind, mult = 1, rare = false;
    if (g.champ) {
      if (kind === 'sail' && !g.boatIn) { kind = 'humps'; g.sailMissed = true; }
      mult = (RARE_MULT[kind] || 1) * (g.ev && g.ev.gold ? 2 : 1) * (g.ev && g.ev.encore ? ENCORE_MULT[g.ev.encore] : 1); rare = !!RARE_MULT[kind] || !!(g.ev && g.ev.gold);
    }
    const ev = g.ev;
    let pts = 0, bonus = 0, newTags = [];
    if (g.champ) {
      ev.shots++;
      if (ev.shy && !ev.spooked && ev.u < (PEAK_U[ev.kind] || 0.5) - 0.1) { ev.spooked = true; ev.t = Math.max(ev.t, ev.D * 0.8); pop(ev.x, ev.y - 60 * ev.s, 'SPOOKED!', '#ffd0c8', 20); Snd.meh(); }
      const streakMult = 1 + 0.1 * Math.min(S.streak, 5);
      const gain = Math.max(0, g.score - ev.best) * mult * (g.stars > 0 ? streakMult : 1);
      pts = Math.round(gain);
      if (g.score > ev.best) ev.best = g.score;
      // the streak counts sightings, not photos, so rapid-fire taps on one pose can't pump it
      if (g.stars >= 3) { if (!ev.streaked) { ev.streaked = true; S.streak++; S.bestStreak = Math.max(S.bestStreak, S.streak); } }
      else if (!ev.streaked) S.streak = 0;
      if (g.stars >= 1 && S.sights[ev.idx] && S.sights[ev.idx].status !== 'got') S.sights[ev.idx].status = 'got';
      // style shots: compositions that pay a little extra (once per sighting) and fill the Shot Book
      const st = g.stars, k = ev.kind, tg = [];
      if (g.wink && st >= 3) tg.push('wink');
      if ((k === 'humps' || k === 'sail') && g.fit3 && st >= 4) tg.push('trio');
      if ((k === 'tail' || k === 'breach') && g.comps.timing >= 0.88 && st >= 4) tg.push('apex');
      if (g.decoys.some(d => d !== 'wave') && st >= 3) tg.push('bomb');
      if (st >= 3 && landmarkIn({ x0: sn.x - F / 2, y0: sn.y - F / 2, x1: sn.x + F / 2, y1: sn.y + F / 2 })) tg.push('postcard');
      if (ev.shots === 1 && st >= 4) tg.push('oneshot');
      if (ev.encore && st >= 3) tg.push('encore');
      if (g.score >= MASTER_AT) tg.push('master');
      newTags = tg.filter(t => !ev.tagged[t]);
      newTags.forEach((t, ti) => {
        ev.tagged[t] = 1; bonus += STYLES[t].pts; S.tagCount[t] = (S.tagCount[t] || 0) + 1;
        if (!save.shots[t]) S.newShots.push(t);
        save.shots[t] = (save.shots[t] || 0) + 1; if (t === 'master') save.master = (save.master || 0) + 1;
        if ((t === 'oneshot' || t === 'wink') && tg.length > 1) return;
        pop(sn.x, sn.y - 54 - ti * 20, STYLES[t].n.toUpperCase() + (STYLES[t].pts ? ' +' + STYLES[t].pts : ''), t === 'master' ? '#ffe36b' : '#bff3ff', t === 'master' ? 21 : 17);
      });
      if (newTags.length) { const nn = newTags.filter(t => t !== 'wink' && t !== 'oneshot').length; if (nn) { Snd.style(S.streak); buzz([14, 26, 14]); } else Snd.style(0); persist(); }
      if (g.stars >= 1) { const bk = save.best[kind] || (save.best[kind] = { score: 0, stars: 0 }); if (g.score > bk.score) { bk.score = g.score; bk.stars = g.stars; } }
      // film pops go under the frame so they never sit on top of the points pop
      const fy = Math.min(BY - 12, sn.y + F / 2 + 16);
      // bonus film once per sighting
      if (g.stars >= 5 && !ev.filmBack && (S.mode !== 'sunset' || S.film <= 5)) { ev.filmBack = true; S.film = Math.min(S.filmMax + 2, S.film + 1); pop(sn.x, fy, '+1 film!', '#8be8ff', 18); }
      else if (S.mode === 'sunset' && g.stars >= 4 && S.film <= 4 && !ev.filmBack) { ev.filmBack = true; S.film = Math.min(S.filmMax + 2, S.film + 1); pop(sn.x, fy, '+1 film', '#8be8ff', 16); }
      // shutter hit-pause: the world holds its breath on a good shot
      if (!(S.hitStop > 0)) S.hitStop = g.stars >= 5 ? 0.2 : g.stars >= 3 ? 0.11 : 0.06;
      if (g.stars >= 5) S.shake = Math.max(S.shake, 4);
      // field guide
      if (ev.gold && g.stars >= 1 && !ev.goldLogged) { ev.goldLogged = true; save.gold = (save.gold || 0) + 1; S.newGold = true; Snd.rare(); Snd.perfect(); buzz([20, 40, 20, 40, 30]); toast('GOLDEN CHAMP!', 'Spotted ' + save.gold + (save.gold === 1 ? ' time. Legendary.' : ' times')); }
      if (g.stars >= 1 && g.comps.vis > 0.3 && !save.sights[kind]) { save.sights[kind] = true; S.newSights.push(kind); Snd.rare(); toast('NEW SIGHTING!', CHAMP_NAMES[kind]); }
    } else if (!(g.kind === 'early' || g.kind === 'dove' || g.kind === 'miss')) {
      S.streak = 0; // decoys and empty water break the streak; a near miss at Champ only costs the film
      if (LIFE_NAMES[g.kind]) { /* decoy photo */ }
    }
    g.decoys.forEach(dk => { if (!save.life[dk]) { save.life[dk] = true; if (!g.champ) toast('LAKE LIFE LOGGED', LIFE_NAMES[dk]); } });
    S.run5 = g.champ && g.stars >= 5 ? (S.run5 || 0) + 1 : (g.champ && ev && ev.best >= 94 && g.stars < 5 ? S.run5 : 0); // an extra snap of an already-perfect sighting neither adds nor breaks the run
    S.score += pts + bonus; S.hudDirty = true;
    const id = ++save.idc;
    const photo = { gold: !!(g.champ && ev && ev.gold), id, streak: S.streak, kind, stars: g.stars, score: g.champ ? g.score : 0, pts, caption: captionFor(g), hint: g.champ ? (ev && ev.spooked ? 'He’s shy! Snapped too early, he bolted.' : g.sailMissed && g.stars >= 3 ? 'Get the sailboat in the shot too!' : hintFor(g)) : '', comps: g.comps, canvas: pc, champ: g.champ, rare, blur: g.blur, round: S.round, mode: S.mode, ts: Date.now(), decoyKind: g.champ ? null : g.kind, evId: ev ? ev.id : 0, improved: g.champ ? pts > 0 : false, tags: newTags, bonus };
    { const ord = ['postcard', 'bomb', 'trio', 'apex', 'encore'].find(x => newTags.indexOf(x) >= 0); photo.top = g.stars < 1 ? null : photo.gold ? { t: 'GOLDEN!', c: 'gold' } : newTags.indexOf('master') >= 0 ? { t: 'MASTERPIECE!', c: 'master' } : ord ? { t: STYLES[ord].stamp, c: 'tag' } : rare ? { t: 'RARE!', c: 'rare' } : null; }
    if (g.champ && g.stars >= 1) {
      if (!S.headless) try { const tc = document.createElement('canvas'); tc.width = tc.height = 240; tc.getContext('2d').drawImage(pc, 0, 0, 240, 240); photo.thumb = tc.toDataURL('image/jpeg', 0.8); } catch (e) { /* ignore */ }
      if (!S.bestPhoto || photo.score > S.bestPhoto.score) S.bestPhoto = photo;
      if (!S.attract && !S.headless) addToAlbum(photo); // headless test sims draw no pixels, so keep them out of the scrapbook
    }
    S.photos.push(photo);
    // feedback sounds / pops
    if (g.champ) {
      if (pts > 0) pop(sn.x, sn.y - 30, '+' + pts, g.stars >= 4 ? '#ffe36b' : '#ffffff', g.stars >= 4 ? 26 : 22);
      if (g.stars === 5) { burstStars(sn.x, sn.y); buzz([20, 40, 30]); }
    } else {
      const near = g.kind === 'early' || g.kind === 'dove' || g.kind === 'miss';
      if (near) Snd.meh(); else Snd.decoy(g.kind);
      pop(sn.x, sn.y - 24, g.decoys.length ? 'Not Champ!' : g.kind === 'early' ? 'Too early!' : g.kind === 'dove' ? 'Just missed!' : g.kind === 'miss' ? 'Missed him!' : 'Just water', '#ffd0c8', 20);
    }
    addPola(photo, sn);
    checkAssign(photo, g);
    if (g.champ) goalsPhoto(photo, newTags, ev);
    if (save.tut === false && g.champ) { save.tut = true; S.tut = false; }
    S.tutHand = 0; if (ev) ev.tut = false;
    return photo;
  }
  function checkAssign(photo, g) {
    const A = S.assign; if (!A || S.assignDone || S.mode !== 'campaign' || A.end) return;
    let done = false;
    if (A.streak) done = S.streak >= A.streak;
    else if (A.ok(photo, g)) { S.assignN++; done = S.assignN >= (A.count || 1); }
    else if (A.count && S.assignN) S.hudDirty = true;
    if (done) assignDone(photo);
    S.hudDirty = true;
  }
  function assignDone(photo) {
    S.assignDone = true; S.score += 60; S.hudDirty = true; save.assign = save.assign || {};
    const first = !save.assign[S.round];
    const best = photo && photo.thumb ? photo : S.bestPhoto;
    save.assign[S.round] = { img: (best && best.thumb) || (save.assign[S.round] && save.assign[S.round].img) || null, ts: Date.now() };
    persist();
    pop(W / 2, 132 + insetTopW, 'SCOOP! +60', '#ffe36b', 22);
    toast(first ? 'FRONT PAGE!' : 'SCOOP AGAIN!', S.assign.head);
    Snd.rare(); buzz([15, 30, 15]);
  }
  function burstStars(x, y) {
    for (let i = 0; i < 14; i++) { const a = rand() * TAU, v = 70 + rand() * 120; S.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 50, t: 0, life: 0.9 + rand() * 0.4, r: 3 + rand() * 3, star: true }); }
  }

  // ---------- album ----------
  function addToAlbum(p) {
    const e = { id: p.id, kind: p.kind, stars: p.stars, score: p.score, cap: p.caption, img: p.thumb, rare: p.rare, ts: p.ts, round: p.round, comps: p.comps };
    if (e.comps) { e.comps = { cen: +e.comps.cen.toFixed(2), size: +e.comps.size.toFixed(2), timing: +e.comps.timing.toFixed(2), vis: +e.comps.vis.toFixed(2), blur: +e.comps.blur.toFixed(2) }; }
    if (p.score < 40 && !p.rare) return;
    save.album.push(e);
    // keep the best of each kind, then fill by score (max 18)
    const bestKind = {};
    save.album.forEach(a => { if (!bestKind[a.kind] || a.score > bestKind[a.kind].score) bestKind[a.kind] = a; });
    const keep = new Set(Object.values(bestKind).map(a => a.id));
    const perKind = {};
    const rest = save.album.filter(a => !keep.has(a.id)).sort((a, b) => b.score - a.score).filter(a => (perKind[a.kind] = (perKind[a.kind] || 1) + 1) <= 3);
    const room = Math.max(0, 18 - keep.size);
    const final = save.album.filter(a => keep.has(a.id)).concat(rest.slice(0, room));
    final.sort((a, b) => b.score - a.score);
    save.album = final;
    persist();
  }

  // ---------- polaroids ----------
  const PW = 136, PHT = 208, PAD = 8;
  function addPola(photo, sn) {
    S.pols.forEach(p => { p.pushed = true; });
    S.pols.unshift({ photo, born: S.t, rot: (rand() - 0.5) * 0.12, shown: 0, snd: 0, pushedAt: 0 });
    if (S.pols.length > 3) S.pols.length = 3;
  }
  function updatePolas(dt) {
    for (let i = S.pols.length - 1; i >= 0; i--) {
      const p = S.pols[i], age = S.t - p.born;
      if (p.pushed && !p.pushedAt) p.pushedAt = S.t;
      const hold = p.photo.stars >= 4 ? 4.4 : 3.3;
      const dead = p.pushed ? S.t - p.pushedAt > 1.6 : age > hold + 0.6;
      if (dead && age > 0.4) { S.pols.splice(i, 1); continue; }
      // sound cues for development
      if (!p.devSnd && age > 0.15) { p.devSnd = true; if (p.photo.champ) Snd.develop(); }
      const nStars = p.photo.stars;
      const startRev = p.pushed ? 0 : 1.05;
      if (p.pushed && p.snd < nStars) p.snd = nStars; // already developed: show the stars, skip the leftover dings
      if (p.photo.champ && p.snd < nStars && age > startRev + p.snd * 0.16) { Snd.star(p.snd, nStars >= 5, Math.min(p.photo.streak || 0, 6)); p.snd++; if (p.snd === 5) Snd.perfect(); }
      // the stamp lands just after the last star
      const stampAt = startRev + nStars * 0.16 + 0.12;
      if (!p.stamped && p.photo.champ && (nStars >= 5 || p.photo.top) && (p.pushed || age > stampAt)) { p.stamped = S.t; if (!p.pushed) { Snd.stamp(); buzz(18); } }
      if (p.photo.champ && nStars === 0 && !p.zero && age > 1.0) { p.zero = true; Snd.meh(); }
    }
  }
  function star5(c, x, y, r) {
    c.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.42 : r; c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); }
    c.closePath();
  }
  function wrapText(c, text, maxW) {
    const words = text.split(' '), lines = []; let cur = '';
    words.forEach(w => { const t = cur ? cur + ' ' + w : w; if (c.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
    if (cur) lines.push(cur);
    return lines;
  }
  function drawPola(p, i) {
    const ph = p.photo, age = S.t - p.born, sc0 = UI * (i === 0 ? 1 : 0.8);
    const slideIn = sm(age / 0.38), over = age < 0.38 ? 1 + Math.sin(slideIn * Math.PI) * 0.06 : 1;
    let out = 0;
    if (p.pushed) out = sm((S.t - p.pushedAt - 1.1) / 0.5);
    else { const hold = ph.stars >= 4 ? 4.4 : 3.3; out = sm((age - hold) / 0.5); }
    const baseY = H - 10 - insetBotW;
    const fan = [[0, 0, 0], [-78, 12, -0.14], [78, 14, 0.14]][Math.min(i, 2)];
    const ci = Math.min(i, 2);
    const tx = (land ? W - PW * UI * 0.62 - 14 : W / 2) + fan[0] * UI * (land ? 0.55 : 1), ty = baseY + fan[1] * UI;
    const y = ty + (1 - slideIn) * (PHT * UI + 40) + out * 70 * UI, a = 1 - out;
    // shake it like a polaroid while it develops
    const wig = p.pushed ? 0 : Math.sin(clamp((age - 0.22) / 0.8, 0, 1) * Math.PI);
    ctx.save(); ctx.globalAlpha = clamp(a, 0, 1);
    ctx.translate(tx + Math.sin(age * 29) * 4 * wig * UI, y); ctx.rotate(p.rot + fan[2] + Math.sin(age * 34) * 0.07 * wig); ctx.scale(sc0 * over, sc0 * over);
    const x0 = -PW / 2, y0 = -PHT;
    // card
    ctx.shadowColor = 'rgba(0,10,20,0.55)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 5;
    ctx.fillStyle = '#fffdf6'; ctx.beginPath(); ctx.roundRect(x0, y0, PW, PHT, 4); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = 'rgba(120,100,70,0.25)'; ctx.lineWidth = 1; ctx.stroke();
    // photo
    const pw = PW - PAD * 2, px = x0 + PAD, py = y0 + PAD;
    const dev = p.pushed ? 1 : clamp((age - 0.25) / 0.9, 0, 1);
    ctx.save(); ctx.beginPath(); ctx.rect(px, py, pw, pw); ctx.clip();
    ctx.fillStyle = '#c9b690'; ctx.fillRect(px, py, pw, pw);
    ctx.drawImage(ph.canvas, px, py, pw, pw);
    if (dev < 1) { ctx.fillStyle = 'rgba(214,196,160,' + (1 - dev * dev).toFixed(3) + ')'; ctx.fillRect(px, py, pw, pw); }
    if (ph.stars === 5 && dev >= 1) { const sh = (age * 0.8) % 1.6; ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.save(); ctx.translate(px + sh * pw * 1.4 - pw * 0.3, py); ctx.rotate(0.35); ctx.fillRect(0, -20, 10, pw + 40); ctx.restore(); }
    if (ph.blur > 0.5 && dev >= 1) { ctx.save(); ctx.translate(px + pw - 6, py + 16); ctx.rotate(0.2); ctx.font = '700 13px Fredoka, sans-serif'; ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(232,70,59,0.95)'; ctx.fillText('BLURRY', 0, 0); ctx.restore(); }
    ctx.restore();
    ctx.strokeStyle = 'rgba(60,40,10,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(px, py, pw, pw);
    // ink stamps: a top one (GOLDEN / MASTERPIECE / a style shot / RARE) and PERFECT! on a 5-star
    if (p.stamped) {
      const st = clamp((S.t - p.stamped) / 0.16, 0, 1), ssc = 1 + 1.3 * (1 - st) * (1 - st);
      const inkStamp = (label, cx, cy, rot, size, col) => {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(ssc, ssc);
        ctx.globalAlpha *= 0.35 + 0.6 * st; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '400 ' + size + 'px "Bowlby One", "Arial Black", sans-serif';
        const fit = Math.min(1, (pw - 18) / (ctx.measureText(label).width + 12)); size = Math.round(size * fit * 10) / 10; ctx.font = '400 ' + size + 'px "Bowlby One", "Arial Black", sans-serif';
        const tw = ctx.measureText(label).width + 12, th = size + 9;
        ctx.fillStyle = 'rgba(255,253,246,0.55)'; ctx.fillRect(-tw / 2, -th / 2, tw, th);
        ctx.strokeStyle = col; ctx.lineWidth = 2.4; ctx.strokeRect(-tw / 2, -th / 2, tw, th);
        ctx.lineWidth = 1; ctx.strokeRect(-tw / 2 + 3, -th / 2 + 3, tw - 6, th - 6);
        ctx.fillStyle = col; ctx.fillText(label, 0, 1); ctx.restore();
      };
      const COL = { gold: 'rgba(196,128,0,0.95)', master: 'rgba(150,40,170,0.95)', tag: 'rgba(16,118,128,0.95)', rare: 'rgba(120,52,168,0.92)' };
      if (ph.top) inkStamp(ph.top.t, px + pw * (ph.top.c === 'rare' ? 0.3 : 0.5), py + 14, ph.top.c === 'rare' ? 0.16 : -0.08, 15, COL[ph.top.c]);
      if (ph.stars >= 5 && !ph.gold) inkStamp('PERFECT!', px + pw * 0.66, py + pw - 17, -0.22, 17, 'rgba(214,40,40,0.92)');
    }
    // stars
    const sy = py + pw + 15, shown = ph.champ ? p.snd : 0;
    if (ph.champ) {
      for (let s = 0; s < 5; s++) {
        const sx = x0 + PW / 2 + (s - 2) * 21, on = s < shown, since = on ? clamp((S.t - (p.born + (p.pushed ? 0 : 1.05) + s * 0.16)) / 0.3, 0, 1) : 0;
        const rs = 9 + (on ? Math.sin(since * Math.PI) * 5 : 0);
        star5(ctx, sx, sy, rs);
        if (on) { ctx.fillStyle = '#f9b81a'; ctx.fill(); ctx.strokeStyle = '#a86a00'; ctx.lineWidth = 1.2; ctx.stroke(); }
        else { ctx.fillStyle = 'rgba(190,180,160,0.35)'; ctx.fill(); ctx.strokeStyle = 'rgba(150,140,120,0.7)'; ctx.lineWidth = 1; ctx.stroke(); }
      }
    } else {
      ctx.font = '700 12px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#b3402f';
      const k = ph.decoyKind;
      ctx.fillText(k === 'early' ? 'TOO EARLY — WAIT FOR HIM' : k === 'dove' ? 'TOO LATE — HE DOVE' : k === 'miss' ? 'MISSED — AIM AT HIM' : LIFE_NAMES[k] ? 'NOT CHAMP — A ' + LIFE_NAMES[k].toUpperCase() : 'NO CHAMP — FILM USED', x0 + PW / 2, sy + 4, PW - 10);
    }
    // caption
    const capShow = p.pushed || age > 0.95;
    if (capShow) {
      ctx.font = '700 17px Caveat, "Bradley Hand", cursive'; ctx.textAlign = 'center'; ctx.fillStyle = '#2b2118';
      const lines = wrapText(ctx, ph.caption, PW - 14);
      lines.slice(0, 2).forEach((l, j) => ctx.fillText(l, x0 + PW / 2, sy + 25 + j * 14));
      if (ph.champ && !ph.improved && ph.stars > 0) { ctx.font = '600 9px Fredoka, sans-serif'; ctx.fillStyle = '#7a8a8a'; ctx.fillText('(already have a better one)', x0 + PW / 2, y0 + PHT - 7, PW - 10); }
      else if (ph.hint && ph.champ) {
        ctx.font = '600 9.5px Fredoka, sans-serif'; ctx.fillStyle = ph.stars >= 4 ? '#1d7d3d' : '#a8452f';
        ctx.fillText(ph.hint, x0 + PW / 2, y0 + PHT - 7, PW - 10);
      }
    }
    ctx.restore();
  }

  // ---------- whitecaps: foam flecks that come and go when the lake is choppy ----------
  const fr = (n) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };
  function drawWhitecaps() {
    const c = S.wx.chop; if (c < 0.3) return;
    const n = Math.round(26 * c);
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const f = Math.pow(fr(i + 1.3), 1.3), y = HY + 14 + f * (BY - HY - 40), sc = 0.45 + f * 0.9;
      const ph = (S.t * 0.35 + fr(i + 7.1)) % 1, a = Math.sin(ph * Math.PI) * Math.min(1, (c - 0.25) * 2);
      if (a < 0.05) continue;
      const x = (fr(i + 3.7) * (W + 60) + S.t * (8 + 10 * f) * (i % 2 ? 1 : -1) + Math.floor(S.t * 0.35 + fr(i + 7.1)) * 97) % (W + 60) - 30;
      const xx = x < -30 ? x + W + 60 : x, w = (7 + 9 * f) * (0.6 + 0.4 * a);
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.75 * a).toFixed(3) + ')'; ctx.lineWidth = 1.1 + 1.5 * sc;
      ctx.beginPath(); ctx.moveTo(xx - w, y); ctx.quadraticCurveTo(xx, y - 3.5 * sc, xx + w, y + 0.5); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,' + (0.35 * a).toFixed(3) + ')'; ctx.fillRect(xx - w * 0.6, y + 1.5 * sc, w * 1.1, 1.2 * sc);
    }
  }

  // ---------- gulls drifting across the sky (pure scenery) ----------
  function updateBirds(dt) {
    S.nextBirds -= dt;
    if (S.nextBirds <= 0 && S.light !== 'night') {
      S.nextBirds = 14 + rand() * 14;
      const dir = rand() < 0.5 ? 1 : -1, n = 1 + ((rand() * 3) | 0), y = HY * (0.18 + rand() * 0.45), sp = 16 + rand() * 10;
      for (let i = 0; i < n; i++) S.birds.push({ x: dir > 0 ? -20 - i * 16 : W + 20 + i * 16, y: y + (i % 2) * 7 + i * 2, v: sp * dir, ph: rand() * 6, s: 0.7 + rand() * 0.4 });
    }
    for (let i = S.birds.length - 1; i >= 0; i--) { const b = S.birds[i]; b.x += b.v * dt; b.y += Math.sin(S.t * 0.8 + b.ph) * 2 * dt; if (b.x < -60 || b.x > W + 60) S.birds.splice(i, 1); }
  }
  function drawBirds() {
    if (!S.birds.length) return;
    const dark = S.light === 'dusk' || S.light === 'sunset';
    ctx.strokeStyle = dark ? 'rgba(40,25,60,0.7)' : 'rgba(60,70,85,0.62)'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    S.birds.forEach(b => {
      const f = Math.sin(S.t * 7 + b.ph), w = 6 * b.s, h = 2.6 * b.s * f;
      ctx.lineWidth = 1.3 * b.s;
      ctx.beginPath(); ctx.moveTo(b.x - w, b.y - h); ctx.quadraticCurveTo(b.x - w * 0.4, b.y - h * 0.2 - 1.5 * b.s, b.x, b.y); ctx.quadraticCurveTo(b.x + w * 0.4, b.y - h * 0.2 - 1.5 * b.s, b.x + w, b.y - h); ctx.stroke();
    });
  }

  // ---------- tourists ----------
  function initTourists() {
    const whos = [0, 1, 2, 3]; for (let i = whos.length - 1; i > 0; i--) { const j = (rand() * (i + 1)) | 0; [whos[i], whos[j]] = [whos[j], whos[i]]; }
    S.tourists = [0.15, 0.5, 0.85].map((fx, i) => ({ fx, who: whos[i], face: i === 1 ? -1 : (i === 0 ? 1 : -1), pose: 0, next: 4 + rand() * 6 + i * 2 }));
  }
  function bubble(tourist, txt) {
    S.bubbles = S.bubbles.filter(b => b.tour !== tourist);
    S.bubbles.push({ tour: tourist, txt, t: 0, life: 2.6 });
  }
  function updateTourists(dt) {
    S.tourists.forEach(t => {
      t.next -= dt;
      if (t.pose > 0) t.pose -= dt;
      if (t.next <= 0) { t.next = 7 + rand() * 9; if (rand() < 0.5 && !S.bubbles.length && !S.pols.length) bubble(t, pick(TOUR_LINES)); }
    });
    // they react to Champ... by not reacting
    if (S.ev && S.ev.state === 'up' && !S.ev.said && S.ev.u > 0.3 && S.tourists.length) { S.ev.said = true; if (rand() < 0.65) bubble(pick(S.tourists), pick(TOUR_LINES)); }
  }
  function drawTourists() {
    const k = 1.18 * UI;
    S.tourists.forEach(t => {
      const x = W * t.fx, y = H + 6;
      Art.drawTourist(ctx, x, y, k, S.t, t.who, t.pose > 0 ? 0 : t.face);
    });
    if (S.pols.length) return; // the card covers the boardwalk; don't half-show a speech bubble
    S.bubbles.forEach(b => {
      const t = b.tour, x0 = W * t.fx, y = H - 100 * UI - (1.18 * UI * 12);
      const a = Math.min(1, b.t / 0.2, (b.life - b.t) / 0.3);
      ctx.save(); ctx.globalAlpha = clamp(a, 0, 1); ctx.font = '600 12px Fredoka, sans-serif';
      const w = ctx.measureText(b.txt).width + 16, x = clamp(x0, w / 2 + 6, W - w / 2 - 6), bx = x - w / 2, by = y - 26;
      ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(20,50,60,0.5)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.roundRect(bx, by, w, 22, 9); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 5, by + 22); ctx.lineTo(x, by + 29); ctx.lineTo(x + 5, by + 22); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.fillStyle = '#17323a'; ctx.textAlign = 'center'; ctx.fillText(b.txt, x, by + 15); ctx.restore();
    });
  }

  // ---------- HUD / UI ----------
  const el = { film: $('#filmN'), filmChip: $('#filmChip'), score: $('#scoreN'), tgt: $('#tgtTxt'), fill: $('#barFill'), barT: $('#barT'), pips: $('#pips'), streak: $('#streak'), hud: $('#hud'), toast: $('#toast'), assign: $('#assign') };
  let toastTimer = 0;
  const toastQ = []; let toastBusy = 0;
  function toast(a, b) {
    const now = performance.now();
    if (now < toastBusy) { if (toastQ.length < 3) toastQ.push([a, b]); return; }
    showToast(a, b);
  }
  function clearToasts() { toastQ.length = 0; toastBusy = 0; }
  function showToast(a, b) {
    toastBusy = performance.now() + 1500;
    setTimeout(() => { if (toastQ.length && (S.screen === 'play' || S.screen === 'pause')) { const n = toastQ.shift(); showToast(n[0], n[1]); } else toastQ.length = 0; }, 1500);
    const t = el.toast; t.classList.remove('go'); void t.offsetWidth;
    t.firstElementChild.innerHTML = '<span></span>' + (b ? '<small></small>' : '');
    t.firstElementChild.firstChild.textContent = a; if (b) t.firstElementChild.lastChild.textContent = b;
    t.classList.add('go');
  }
  function targetOf() { return S.mode === 'sunset' ? 0 : S.R.target; }
  function renderHud() {
    if (!S.hudDirty) return; S.hudDirty = false;
    el.film.textContent = S.film; el.filmChip.classList.toggle('low', S.film <= 2 && S.screen === 'play');
    const tg = targetOf();
    if (S.mode === 'sunset') {
      const goal = save.sunsetBest || [500, 1000, 2000, 4000, 8000].find(v => v > S.score) || 16000;
      el.tgt.textContent = save.sunsetBest ? ' · best ' + save.sunsetBest : ' · next ' + goal;
      el.barT.style.display = 'none'; el.fill.classList.toggle('pass', save.sunsetBest > 0 && S.score > save.sunsetBest); el.fill.style.width = clamp(S.score / goal * 100, 0, 100) + '%';
      el.pips.innerHTML = '<span style="font-size:calc(var(--u)*13);font-weight:600;opacity:.9">Sighting ' + Math.max(1, S.sightN) + '</span>';
    } else {
      if (S.mode === 'daily') {
        const par = dailyPar(S.R), md = dailyMedal(S.score, par), next = [par * 0.6, par, par * 1.3][Math.min(2, md)];
        el.tgt.textContent = md >= 3 ? ' · ' + MEDALS[3] : ' · ' + ['bronze', 'silver', 'gold'][md] + ' ' + Math.round(next);
        el.barT.style.display = ''; const full = par * 1.4;
        el.fill.style.width = clamp(S.score / full * 100, 0, 100) + '%'; el.barT.style.left = (par / full * 100) + '%';
        el.fill.classList.toggle('pass', S.score >= par);
      } else {
        el.tgt.textContent = '/ ' + tg; el.barT.style.display = '';
        const full = tg * 1.7; el.fill.style.width = clamp(S.score / full * 100, 0, 100) + '%'; el.barT.style.left = (tg / full * 100) + '%';
        el.fill.classList.toggle('pass', S.score >= tg);
      }
      let h = ''; S.sights.forEach((s, i) => { h += '<i class="pip ' + (s.status === 'got' ? 'got' : s.status === 'missed' ? 'missed' : (S.ev && S.ev.idx === i ? 'live' : '')) + '"></i>'; });
      el.pips.innerHTML = h;
    }
    const inPlay = S.screen === 'play' || S.screen === 'pause';
    let txt = '', done = false;
    if (inPlay) {
      const A = S.assign, gi = S.gdone.indexOf(false);
      if (S.mode === 'daily' && S.req) { done = S.reqDone; txt = done ? '📷 REQUEST DONE! +50' : '📷 Request: ' + S.req.t + (S.req.n > 1 ? ' (' + S.reqN + '/' + S.req.n + ')' : ''); }
      else if (A && !S.assignDone) txt = '📰 ' + A.t + (A.count ? ' (' + S.assignN + '/' + A.count + ')' : A.streak ? ' (' + Math.min(S.streak, A.streak) + '/' + A.streak + ')' : '');
      else if (S.goals.length && gi >= 0 && S.mode !== 'daily') { const G = S.goals[gi], need = G.n || G.sight || G.streak || G.run5 || 0; txt = '📷 ' + G.t + (need > 1 ? ' (' + Math.min(S.gprog[gi], need) + '/' + need + ')' : ''); }
      else if (S.goals.length && S.mode !== 'daily') { done = true; txt = '📷 ALL GOALS DONE!'; }
      else if (A && S.assignDone) { done = true; txt = '📰 SCOOP! ' + A.head; }
    }
    el.assign.style.display = txt ? '' : 'none';
    if (txt) { el.assign.classList.toggle('done', done); el.assign.textContent = txt; }
    const sm1 = 1 + 0.1 * Math.min(S.streak, 5);
    if (S.streak >= 2) el.streak.innerHTML = 'STREAK ' + S.streak + '<b>×' + sm1.toFixed(1) + '</b>';
    el.streak.classList.toggle('on', S.streak >= 2);
    if (S.streak >= 2 && S.streak > (S.streakShown || 0)) { el.streak.classList.remove('bump'); void el.streak.offsetWidth; el.streak.classList.add('bump'); }
    S.streakShown = S.streak;
  }
  function tickScore(dt) {
    if (S.shownScore !== S.score) {
      const d = S.score - S.shownScore; S.shownScore += Math.sign(d) * Math.max(1, Math.abs(d) * Math.min(1, dt * 10)); if (Math.abs(S.score - S.shownScore) < 1) S.shownScore = S.score;
      el.score.textContent = Math.round(S.shownScore);
    }
  }

  // ---------- screens ----------
  const SCREENS = ['title', 'rounds', 'result', 'album', 'pause'];
  function go(name) {
    S.screen = name;
    SCREENS.forEach(s => $('#' + s).classList.toggle('show', s === name));
    el.hud.classList.toggle('show', name === 'play' || name === 'pause');
    if (name === 'title') refreshTitle();
    S.hudDirty = true;
  }
  function refreshTitle() {
    const done = save.maxRound >= ROUNDS.length;
    $('#btnPlay').textContent = done ? 'PLAY SUNSET' : (save.maxRound === 0 && !save.tut ? 'PLAY' : 'PLAY · ROUND ' + (save.maxRound + 1));
    const btn = $('#btnSunset'); btn.disabled = !done && !ROUNDS.some((R, i) => proUnlocked(i)); btn.textContent = done || !btn.disabled ? 'PRO ROUNDS' : '🔒 SUNSET';
    const du = dailyUnlocked(), db = $('#btnDaily'); db.disabled = !du; db.textContent = du ? 'DAILY LAKE' : '🔒 DAILY';
    const td = dailyToday(), stk = dailyStreakNow(), parT = dailyPar();
    $('#dailyNote').textContent = !du ? 'Clear Round 2 to open the Daily Lake' : td ? (td.medal ? MEDALS[td.medal].split(' ')[0] + ' ' : '') + 'Today’s best ' + td.best + ((td.medal || 0) < 3 ? ' · gold at ' + Math.round(parT * 1.3) : '') + (stk >= 2 ? ' · ' + stk + '-day streak' : '') : (stk >= 2 ? 'New lake today! Keep your ' + stk + '-day streak' : 'A new lake every day · par ' + parT);
    refreshSndButtons();
  }
  function refreshSndButtons() {
    $('#btnSfx').textContent = Snd.sfxOn ? 'SOUND ON' : 'SOUND OFF'; $('#btnMus').textContent = Snd.musicOn ? 'MUSIC ON' : 'MUSIC OFF';
    $('#pSfx').textContent = $('#btnSfx').textContent; $('#pMus').textContent = $('#btnMus').textContent;
    $('#btnSound').classList.toggle('off', !Snd.sfxOn && !Snd.musicOn);
    $('#sndWaves').style.display = (!Snd.sfxOn && !Snd.musicOn) ? 'none' : '';
  }
  function toggleAllSound() { const on = !(Snd.sfxOn || Snd.musicOn); Snd.setSfx(on); Snd.setMusic(on); refreshSndButtons(); }

  function setLight(name) { S.light = name; Snd.setLight(name); }
  function resetWorld() {
    S.ev = null; S.decoys = []; S.boats = []; S.rings = []; S.parts = []; S.pops = []; S.flashes = []; S.pols = []; S.snapQ = []; S.bubbles = []; S.lastSpot = null; S.shake = 0;
  }
  function enterAttract() {
    resetWorld(); S.paused = false; S.R = ATTRACT; S.attract = true; S.mode = 'campaign'; S.phase = 'attract';
    const lt = save.maxRound >= ROUNDS.length ? 'sunset' : ROUNDS[Math.min(save.maxRound, ROUNDS.length - 1)].light;
    setLight(lt === 'night' ? 'dusk' : lt); S.wxT = { fog: 0, chop: 0.1 }; S.wx = { fog: 0, chop: 0.1 };
    S.nextSight = 2.2; S.nextDecoy = 4; S.decoysOK = true; S.queue = []; S.film = 0; S.hudDirty = true;
  }
  function proUnlocked(i) { return !!(save.rounds[i] && save.rounds[i].stars >= 3); }
  function proRound(i) {
    const B = ROUNDS[i];
    return Object.assign({}, B, { name: B.name + ' PRO', spd: B.spd * 1.15, warn: B.warn * 0.85, decoy: [B.decoy[0] * 0.8, B.decoy[1] * 0.8], mimic: B.mimic || (i >= 2 ? [10, 15] : null), film: Math.max(7, B.film - 1), target: Math.max(Math.round(B.target * 1.3 / 10) * 10, i === 0 ? 480 : 0), shy: Math.min(0.45, (B.shy || 0.12) + 0.12), fixed: null, lm: ['light', 'ferry'].slice(0, 1 + (i >= 3 ? 1 : 0)), bomb: Math.max(1, B.bomb || 0) });
  }
  function startRound(i, pro) {
    i = clamp(i | 0, 0, ROUNDS.length - 1);
    pro = !!pro && proUnlocked(i);
    const R = pro ? proRound(i) : ROUNDS[i];
    S.pro = pro;
    resetWorld(); initTourists();
    S.mode = 'campaign'; S.round = i; S.R = R; S.attract = false; S.paused = false;
    S.film = R.film; S.filmMax = R.film; S.score = 0; S.shownScore = 0; S.streak = 0; S.bestStreak = 0; S.photos = []; S.newSights = [];
    S.queue = makeQueue(R); S.sights = S.queue.map(() => ({ status: 'pending' })); S.sightsDone = 0; S.sightN = 0; S.bestPhoto = null;
    S.assign = ASSIGN[i] || null; S.assignDone = false; S.assignN = 0; goalsReset('campaign', i, pro);
    setLight(R.light); S.wxT = { fog: R.fog, chop: R.chop }; S.wx = { fog: R.fog, chop: R.chop };
    S.tut = !save.tut && i === 0;
    S.decoysOK = i > 0 || save.tut === true; S.nextSight = S.tut ? 0.8 : 1.2; S.nextDecoy = rr(R.decoy);
    S.phase = 'intro'; S.introT = 1.1; S.endT = 0;
    el.score.textContent = '0';
    go('play'); clearToasts();
    toast((pro ? 'PRO ' : 'ROUND ') + (i + 1) + ' · ' + R.name.replace(' PRO', ''), R.n + ' sightings · ' + R.film + ' shots' + (S.assign ? ' · 📰 ' + S.assign.t : ''));
    if (!sparkleOn() && (pro || i === 4)) toast(pro ? 'PRO: NO SPARKLE' : 'NO MORE SPARKLE', 'Read the pose: the wink, all 3 humps up, the tail held high');
    Snd.unlock(); Snd.blip();
  }
  function startSunset() {
    const R = { name: 'Sunset Session', light: 'sunset', shy: 0.15, mimic: [10, 16], gap: [1.9, 3.1], spd: 1.2, warn: 0.9, decoy: [3.6, 6], dk: { duck: 2, log: 2, loon: 2, swimmer: 2, kayak: 2, wave: 2 }, kinds: { neck: 3, humps: 3, tail: 3 }, fog: 0, chop: 0.25, target: 0 };
    resetWorld(); initTourists();
    S.mode = 'sunset'; S.round = 99; S.R = R; S.attract = false; S.paused = false; S.assign = null; S.assignDone = false; S.pro = false; goalsReset('sunset', 99, false);
    S.film = 10; S.filmMax = 10; S.score = 0; S.shownScore = 0; S.streak = 0; S.bestStreak = 0; S.photos = []; S.newSights = [];
    S.queue = [wpick({ neck: 3, humps: 3, tail: 2 })]; S.sights = []; S.sightsDone = 0; S.sightN = 0; S.bestPhoto = null;
    setLight('sunset'); S.wxT = { fog: 0, chop: 0.25 }; S.wx = { fog: 0, chop: 0.25 };
    S.tut = false; S.decoysOK = true; S.nextSight = 1.6; S.nextDecoy = 4;
    S.phase = 'intro'; S.introT = 1.4; S.sunsetWxT = 20;
    el.score.textContent = '0';
    go('play'); clearToasts();
    toast('SUNSET SESSION', 'Keep shooting. 5★ earns film; 4★ too when you’re low.');
    Snd.unlock(); Snd.blip();
  }
  // ---------- daily lake: same light, weather and lineup for everyone on a given date ----------
  function todayKey(d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function dayNum(key) { const a = key.split('-').map(Number); return Math.round(Date.UTC(a[0], a[1] - 1, a[2]) / 864e5); }
  function prettyDate(key) { const a = key.split('-').map(Number); return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][a[1] - 1] + ' ' + a[2]; }
  const DAILY_LIGHTS = { morning: 'Morning light', noon: 'Bright noon', golden: 'Golden hour', overcast: 'Grey skies', dusk: 'Pink dusk', night: 'Moonlight', sunset: 'Sunset' };
  function dailyConfig(key) {
    let h = 2166136261; const str = 'champ-' + key;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    h = (h >>> 0) || 1;
    const r = () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 4294967296; };
    const lights = Object.keys(DAILY_LIGHTS), light = lights[(r() * lights.length) | 0];
    let wx = [[0, 0.15], [0, 0.4], [0.45, 0.15], [0, 0.7], [0.25, 0.3]][(r() * 5) | 0];
    if (light === 'night' || light === 'dusk') wx = [0, Math.min(wx[1], 0.35)]; // dark days skip the fog
    const n = 8, kinds = ['neck', 'humps', 'tail'], lineup = [];
    for (let i = 0; i < n; i++) lineup.push(kinds[(r() * 3) | 0]);
    const rareAt = 2 + ((r() * (n - 3)) | 0);
    lineup[rareAt] = ['baby', 'sail', 'breach'][(r() * 3) | 0];
    // today's request: one style shot to chase, and the lineup is made so it can happen
    const req = DAILY_REQ[(r() * DAILY_REQ.length) | 0], free = []; for (let i = 0; i < n; i++) if (i !== rareAt) free.push(i);
    const takeFree = () => free.splice((r() * free.length) | 0, 1)[0];
    const force = { humps: 'humps', tail: 'tail', neck: 'neck' }[req.need];
    const flag = {};
    if (force) for (let c = 0; c < 3; c++) lineup[takeFree()] = force;
    else if (req.need === 'lm') flag[takeFree()] = { lm: r() < 0.55 ? 'light' : 'ferry' };
    else if (req.need === 'bomb') flag[takeFree()] = { bomb: true };
    let last = null;
    const q = lineup.map((kind, i) => {
      let fx, fy, tries = 0;
      do { fx = r(); fy = Math.pow(r(), 0.9); tries++; } while (last && Math.hypot(fx - last.fx, (fy - last.fy) * 1.4) < 0.3 && tries < 12);
      last = { fx, fy }; return Object.assign({ kind, fx, fy }, flag[i] || {});
    });
    const dk = [{ duck: 2, log: 2, loon: 2, swimmer: 2 }, { log: 2, loon: 2, kayak: 3, swimmer: 1 }, { duck: 1, log: 2, loon: 2, wave: 3 }][(r() * 3) | 0];
    return { key, name: 'Daily Lake', light, fog: wx[0], chop: wx[1], film: 11, n, q, req, shy: 0.2, mimic: [12, 18], gap: [1.6, 2.7], spd: 1.2, warn: 0.95, decoy: [3.2, 5.5], dk, kinds: { neck: 3, humps: 3, tail: 3 }, target: 0, blurb: DAILY_LIGHTS[light] };
  }
  // daily medals against a par: bronze 60% of par, silver at par, gold at 118%
  const MEDALS = ['', '🥉 BRONZE', '🥈 SILVER', '🥇 GOLD'];
  function dailyPar(R) { R = R || dailyConfig(todayKey()); const W = { neck: 135, humps: 135, tail: 105 }; return Math.round(R.q.reduce((a, it) => a + (W[it.kind] || 120), 0) / 10) * 10; } // tails are the hard ones, so a tail-heavy lake has a lower bar
  function dailyMedal(score, par) { return score >= par * 1.3 ? 3 : score >= par ? 2 : score >= par * 0.6 ? 1 : 0; }
  function dailyUnlocked() { return save.maxRound >= 2; }
  function dailyToday() { const k = todayKey(); return save.daily && save.daily.key === k ? save.daily : null; }
  function dailyStreakNow() { // a streak only counts if you played today or yesterday
    const d = save.daily; if (!d || !d.last) return 0;
    return dayNum(todayKey()) - dayNum(d.last) <= 1 ? d.streak : 0;
  }
  function startDaily(key) {
    key = key || todayKey();
    const R = dailyConfig(key);
    resetWorld(); initTourists();
    S.mode = 'daily'; S.round = 98; S.R = R; S.attract = false; S.paused = false; S.dailyKey = key; S.assign = null; S.assignDone = false; S.pro = false; goalsReset('daily', 98, false); S.req = R.req;
    S.film = R.film; S.filmMax = R.film; S.score = 0; S.shownScore = 0; S.streak = 0; S.bestStreak = 0; S.photos = []; S.newSights = [];
    S.queue = R.q.slice(); S.sights = S.queue.map(() => ({ status: 'pending' })); S.sightsDone = 0; S.sightN = 0; S.bestPhoto = null;
    setLight(R.light); S.wxT = { fog: R.fog, chop: R.chop }; S.wx = { fog: R.fog, chop: R.chop };
    S.tut = false; S.decoysOK = true; S.nextSight = 1.6; S.nextDecoy = rr(R.decoy);
    S.phase = 'intro'; S.introT = 1.5; S.endT = 0;
    el.score.textContent = '0';
    go('play'); clearToasts();
    toast('DAILY LAKE · ' + prettyDate(key), R.blurb + ' · ' + R.n + ' sightings · ' + R.film + ' shots');
    Snd.unlock(); Snd.blip();
  }
  function sunsetDifficulty() {
    const n = S.sightN, R = S.R;
    S.goals.forEach((G, i) => { if (G.sight && !S.gdone[i]) { S.gprog[i] = n; if (n >= G.sight) goalHit(i); } });
    R.spd = Math.min(2.3, 1.2 + n * 0.05); R.warn = Math.max(0.55, 0.9 - n * 0.015);
    R.gap = [Math.max(1.0, 1.9 - n * 0.02), Math.max(1.8, 3.1 - n * 0.03)];
    if (n >= 4 && n % 5 === 0 && S.sunsetWxT !== n) { S.sunsetWxT = n; const w = pick(SUNSET_WX); S.wxT = { fog: w[0], chop: w[1] }; if (n === 20 && S.light !== 'dusk') setLight('dusk'); }
  }

  function checkRoundEnd(dt) {
    if (S.phase === 'intro') { S.introT -= dt; if (S.introT <= 0) S.phase = 'play'; return; }
    if (S.phase === 'play') {
      if (S.mode === 'sunset') sunsetDifficulty();
      const noMore = S.mode !== 'sunset' && S.queue.length === 0 && !S.ev && !S.encoreNext;
      const noFilm = S.film <= 0 && !S.snapQ.length;
      if (noMore || noFilm) { const lp = S.photos[S.photos.length - 1]; S.phase = 'ending'; S.endT = (lp && lp.champ && S.t - 0 > 0 && S.pols.length) ? 2.8 : 1.4; }
    } else if (S.phase === 'ending') {
      S.endT -= dt;
      if (S.endT <= 0) { S.phase = 'done'; finishRound(); }
    }
  }
  // round stars: ★ pass, ★ big score (2× target), ★ the Lake Gazette front page
  const BIG = [2.3, 2.4, 2.5, 2.2, 2.05, 1.85, 1.85, 1.8], PRO_BIG = [2.2, 2.1, 1.9, 1.9, 1.8, 1.4, 1.4, 1.3]; // measured against the bot sweep: the big star is for a patient expert, not a perfect machine // early rounds are generous to pass, so the big-score star asks more of them
  function bigMult() { return S.pro ? (PRO_BIG[S.round] || 1.5) : (BIG[S.round] || 1.6); }
  const bigAt = (i, pro) => Math.ceil((pro ? proRound(i).target : ROUNDS[i].target) * (pro ? PRO_BIG[i] : BIG[i]));
  function roundStars(score, tg, scoop) { return score < tg ? 0 : 1 + (score >= tg * bigMult() ? 1 : 0) + (scoop ? 1 : 0); }
  function finishRound() {
    S.snapQ.length = 0; S.lastRound = S.round; S.lastPro = !!S.pro;
    if (S.mode === 'campaign' && S.assign && S.assign.end && !S.assignDone && S.assign.end()) assignDone(S.bestPhoto);
    const camp = S.mode === 'campaign', daily = S.mode === 'daily', tg = targetOf();
    if ((camp || daily) && S.film > 0 && S.photos.some(p => p.champ)) { const fb = S.film * 8; S.score += fb; S.filmBonus = fb; } else S.filmBonus = 0;
    const pass = camp ? S.score >= tg : true;
    goalsEnd(camp ? pass : true);
    const st = camp ? roundStars(S.score, tg, S.assignDone) : 0;
    const badges = [];
    if (camp && S.pro) {
      save.pro = save.pro || {};
      const rec = save.pro[S.round] || { best: 0, stars: 0 };
      if (S.score > rec.best) { rec.best = S.score; if (S.score > 0) badges.push('PRO BEST'); }
      if (st > rec.stars) { rec.stars = st; badges.push('PRO ' + '★'.repeat(st)); }
      save.pro[S.round] = rec;
    } else if (camp) {
      const rec = save.rounds[S.round] || { best: 0, stars: 0 };
      if (S.score > rec.best) { rec.best = S.score; if (S.score >= tg * 0.5) badges.push('NEW BEST'); }
      if (st > rec.stars) { rec.stars = st; if (st >= 3) badges.push('PRO ' + (S.round + 1) + ' UNLOCKED'); }
      save.rounds[S.round] = rec;
      if (pass) save.maxRound = Math.max(save.maxRound, S.round + 1);
    } else if (daily) {
      let d = save.daily && save.daily.key === S.dailyKey ? save.daily : { key: S.dailyKey, best: 0, plays: 0, streak: save.daily ? save.daily.streak : 0, last: save.daily ? save.daily.last : null };
      if (d.last !== S.dailyKey) { d.streak = d.last && dayNum(S.dailyKey) - dayNum(d.last) === 1 ? d.streak + 1 : 1; d.last = S.dailyKey; }
      d.plays++;
      if (S.reqDone && !d.reqDone) { d.reqDone = true; save.reqs = (save.reqs || 0) + 1; badges.unshift('📷 REQUEST DONE'); }
      if (S.score > d.best) { if (d.best > 0) badges.push('TODAY’S BEST'); d.best = S.score; }
      const md = dailyMedal(S.score, dailyPar(S.R));
      if (md > (d.medal || 0)) { d.medal = md; badges.unshift(MEDALS[md]); }
      save.dailyMedals = save.dailyMedals || { 1: 0, 2: 0, 3: 0 };
      if (md && !d['got' + md]) { d['got' + md] = true; save.dailyMedals[md] = (save.dailyMedals[md] || 0) + 1; }
      save.daily = d;
      if (d.streak >= 2) badges.push('DAY STREAK ' + d.streak);
    } else {
      const rk0 = sunsetRank(save.sunsetBest);
      if (S.score > save.sunsetBest) { save.sunsetBest = S.score; badges.push('NEW HIGH SCORE'); }
      if (sunsetRank(S.score) !== rk0 && S.score > 0) badges.unshift('RANK: ' + sunsetRank(S.score).toUpperCase());
      save.sunsetSights = Math.max(save.sunsetSights || 0, S.sightN);
    }
    if (S.bestPhoto && save.album.length && save.album[0].id === S.bestPhoto.id) badges.push('BEST SHOT EVER');
    if (camp && S.assignDone) badges.unshift('📰 SCOOP!');
    if (S.newGold) { badges.unshift('✨ GOLDEN CHAMP'); S.newGold = false; }
    S.newSights.forEach(k => badges.push('NEW: ' + CHAMP_NAMES[k]));
    S.newShots.forEach(t => badges.push('NEW SHOT: ' + STYLES[t].n.toUpperCase()));
    if (S.bestStreak >= 4) badges.push('STREAK ×' + S.bestStreak);
    if (S.chainBest >= 2) badges.push('ENCORE CHAIN ×' + S.chainBest);
    if (S.goalsNew.length) badges.unshift('◆ ' + S.goalsNew.length + ' MASTERY GOAL' + (S.goalsNew.length > 1 ? 'S' : ''));
    persist();
    // fill the result screen
    $('#rsTitle').textContent = camp ? (pass ? (S.round === 7 ? 'LEGENDARY!' : 'ROLL DEVELOPED!') : 'NOT QUITE…') : daily ? (MEDALS[dailyMedal(S.score, dailyPar(S.R))] || 'DAILY LAKE') : 'SESSION OVER';
    $('#rsSub').textContent = camp ? (S.pro ? 'PRO ' : 'Round ') + (S.round + 1) + ' · ' + S.R.name.replace(' PRO', '') : daily ? prettyDate(S.dailyKey) + ' · ' + S.R.blurb + ' · new lake tomorrow' : 'Sighting ' + S.sightN + ' reached · ' + sunsetRank(S.score);
    $('#rsStars').innerHTML = camp ? [0, 1, 2].map(i => '<span class="' + (i < st ? 'on' : '') + '" style="animation-delay:' + (0.3 + i * 0.22) + 's">★</span>').join('') : '';
    $('#rsStars').style.display = camp ? '' : 'none';
    $('#rsWhy').innerHTML = camp ? [[S.score >= tg, 'Cleared'], [S.score >= tg * bigMult(), 'Big score ' + Math.ceil(tg * bigMult())], [S.assignDone, '📰 ' + (S.assign ? S.assign.t : 'Front page')]].map(a => '<span class="' + (a[0] ? 'y' : 'n') + '">' + (a[0] ? '★ ' : '☆ ') + escapeHtml(a[1]) + '</span>').join(' ') : '';
    { const a = save.goals[S.gkey] || [false, false, false], total = S.goals.length;
      $('#rsGoals').innerHTML = total ? S.goals.map((G, i) => { const now = S.gdone[i], was = a[i] && !now; const cls = now ? 'new' : was ? 'old' : 'no'; const pr = !now && !was && (G.n > 1 || G.sight || G.run5) ? ' (' + Math.min(S.gprog[i], G.n || G.sight || G.run5) + '/' + (G.n || G.sight || G.run5) + ')' : ''; return '<span class="' + cls + '">' + (now ? '◆ ' : was ? '◆ ' : '◇ ') + escapeHtml(G.t) + pr + '</span>'; }).join('') : (daily && S.R.req ? '<span class="' + (S.reqDone ? 'new' : 'no') + '">' + (S.reqDone ? '◆ ' : '◇ ') + 'Request: ' + escapeHtml(S.R.req.t) + '</span>' : '');
      $('#rsGoalsH').style.display = $('#rsGoals').innerHTML ? '' : 'none'; $('#rsGoalsH').textContent = daily ? 'TODAY’S REQUEST' : 'MASTERY GOALS · ' + rankOf(medalCount()) + ' ◆' + medalCount() + '/' + MEDALS_TOTAL; }
    $('#rsTgt').textContent = camp ? '/ ' + tg + ' needed' : daily ? '· par ' + dailyPar(S.R) + ' · today’s best ' + save.daily.best : '(best ' + save.sunsetBest + ')';
    let note = S.filmBonus ? 'Includes +' + S.filmBonus + ' for ' + (S.filmBonus / 8) + ' unused shot' + (S.filmBonus === 8 ? '' : 's') : '';
    if (camp && !pass) note = (tg - S.score <= tg * 0.25 ? 'So close! Only ' + (tg - S.score) + ' points short.' : 'Need ' + (tg - S.score) + ' more. ' + (sparkleOn() ? 'Wait for the sparkle, tap his middle.' : 'Snap at the top of the pose, tap his middle.')) + (note ? ' ' + note + '.' : '');
    if (daily) { const par = dailyPar(S.R), md = dailyMedal(S.score, par); if (md < 3) { const nx = [par * 0.6, par, par * 1.3][md]; note = (note ? note + '. ' : '') + Math.ceil(nx - S.score) + ' more for ' + ['bronze', 'silver', 'gold'][md] + '.'; } }
    $('#rsBonus').textContent = note;
    countUp($('#rsScore'), S.score);
    const top = S.photos.filter(p => p.champ && p.stars > 0 && p.thumb).sort((a, b) => b.score - a.score).slice(0, H < 720 ? 3 : 4);
    $('#sheet').innerHTML = top.length ? top.map((p, i) => pcHtml(p, i, p === S.bestPhoto && p.stars >= 3)).join('') : '<div class="emptyNote">No keepers on this roll.</div>';
    $('#rsBadges').innerHTML = badges.slice(0, 4).map(b => '<span class="badge">' + b + '</span>').join(' ');
    const nx = $('#rsNext');
    if (camp && S.pro) { nx.style.display = ''; nx.textContent = pass && S.round < ROUNDS.length - 1 && proUnlocked(S.round + 1) ? 'NEXT PRO' : 'PRO AGAIN'; nx.dataset.act = nx.textContent === 'NEXT PRO' ? 'pro-next' : 'pro-retry'; }
    else if (camp && pass && S.round < ROUNDS.length - 1) { nx.style.display = ''; nx.textContent = 'NEXT ROUND'; nx.dataset.act = 'next'; }
    else if (camp && pass) { nx.style.display = ''; nx.textContent = 'SUNSET SESSION'; nx.dataset.act = 'sunset'; }
    else if (daily) { nx.style.display = ''; nx.textContent = 'ONE MORE TRY'; nx.dataset.act = 'daily'; }
    else if (!camp) { nx.style.display = ''; nx.textContent = 'NEW ROLL'; nx.dataset.act = 'sunset'; }
    else { nx.style.display = ''; nx.textContent = 'TRY AGAIN'; nx.dataset.act = 'retry'; }
    $('#rsRetry').style.display = nx.dataset.act === 'retry' || nx.dataset.act === 'pro-retry' || !camp ? 'none' : '';
    if (pass) Snd.clear(); else Snd.fail();
    enterAttract();
    S.resultAt = performance.now();
    go('result');
  }
  let countTok = 0;
  function countUp(elm, to) {
    const tok = ++countTok, t0 = performance.now(), dur = clamp(400 + to * 1.2, 500, 1300);
    let ticks = 0; elm.textContent = '0';
    const stepFn = (now) => {
      if (tok !== countTok) return;
      const k = clamp((now - t0 - 250) / dur, 0, 1), v = Math.round(to * (1 - Math.pow(1 - k, 3)));
      elm.textContent = v;
      if (k > 0 && k < 1 && (ticks++ % 3) === 0) Snd.tick(ticks);
      if (k < 1) requestAnimationFrame(stepFn);
    };
    requestAnimationFrame(stepFn);
  }
  function pcHtml(p, i, gold) {
    const stars = '<b>' + '★'.repeat(p.stars) + '</b>' + '★'.repeat(5 - p.stars);
    return '<div class="pc' + (gold ? ' gold' : '') + '" data-id="' + (p.id) + '" style="--r:' + (((i * 37) % 9) - 4) + 'deg;--d:' + (i * 0.08) + 's"><i class="tape"></i><img alt="" src="' + p.thumb + '"><div class="stars">' + stars + '</div>' + (p.rare ? '<span class="rare">RARE</span>' : '') + '</div>';
  }

  // ---------- album screen ----------
  const photoCache = {};
  function showAlbum() {
    const a = save.album, best = a[0];
    $('#best').innerHTML = best ? (function () {
      const h = pcHtml({ id: best.id, thumb: best.img, stars: best.stars, rare: best.rare }, 0, true).replace('class="pc gold"', 'class="pc gold" ');
      return h.replace('<i class="tape"></i>', '<i class="tape"></i><span class="ribbon">BEST SHOT EVER</span>');
    })() : '<div class="emptyNote">Your best photos land here.<br>Go snap Champ!</div>';
    $('#gridH').style.display = a.length > 1 ? '' : 'none';
    $('#grid').innerHTML = a.slice(1).map((p, i) => pcHtml({ id: p.id, thumb: p.img, stars: p.stars, rare: p.rare }, i + 1, false)).join('');
    const got = CHAMP_KINDS.filter(k => save.sights[k]).length;
    const dm = save.dailyMedals || {};
    $('#guideH').textContent = 'CHAMP SIGHTINGS ' + got + '/' + CHAMP_KINDS.length;
    $('#medalsLine').textContent = [(medalCount() ? '◆ Mastery goals ' + medalCount() + '/' + MEDALS_TOTAL + ' · ' + rankOf(medalCount()) : ''), save.master ? 'Masterpieces: ' + save.master : '', save.encoreBest ? 'Best encore chain ×' + save.encoreBest : '', save.reqs ? 'Daily requests: ' + save.reqs : '', (dm[3] || dm[2] || dm[1]) ? 'Daily medals: 🥇 ' + (dm[3] || 0) + '  🥈 ' + (dm[2] || 0) + '  🥉 ' + (dm[1] || 0) : '', save.gold ? '✨ Golden Champs: ' + save.gold : ''].filter(Boolean).join('   ·   ');
    const mkCards = (kinds, names, store, host) => {
      host.innerHTML = '';
      kinds.forEach(k => {
        const d = document.createElement('div'); d.className = 'st-card ' + (store[k] ? 'got' : 'nope');
        d.appendChild(Art.thumb(k, 64, k === 'sail' || k === 'baby' ? 'golden' : 'noon', !store[k]));
        const n = document.createElement('div'); n.className = 'nm'; n.textContent = store[k] ? names[k] : '???'; d.appendChild(n); host.appendChild(d);
      });
    };
    const fp = ASSIGN.filter((A, i) => save.assign[i]).length;
    $('#pagesH').textContent = 'FRONT PAGES ' + fp + '/' + ASSIGN.length;
    $('#pages').innerHTML = ASSIGN.map((A, i) => {
      const d = save.assign[i];
      return '<div class="paper' + (d ? ' got' : '') + '"><div class="mast">LAKE GAZETTE</div>' + (d ? '<div class="hl">' + escapeHtml(A.head) + '</div>' + (d.img ? '<img alt="" src="' + d.img + '">' : '') : '<div class="ph">?</div><div class="todo">Round ' + (i + 1) + '<br>' + escapeHtml(A.t) + '</div>') + '</div>';
    }).join('');
    mkCards(CHAMP_KINDS, CHAMP_NAMES, save.sights, $('#guide'));
    // what you still haven't captured: best score per sighting, and the Shot Book of style shots
    $('#guide').querySelectorAll('.st-card').forEach((d, i) => {
      const k = CHAMP_KINDS[i], b = save.best[k], bs = document.createElement('div'); bs.className = 'bs';
      bs.textContent = save.sights[k] ? (b && b.score ? 'best ' + b.score + ' · ' + (b.stars >= 5 ? '★5 ✓' : '★' + b.stars + ' → ★5') : 'no keeper yet') : 'not seen yet'; d.appendChild(bs);
    });
    const gotS = STYLE_ORDER.filter(k => save.shots[k]).length;
    $('#shotH').textContent = 'SHOT BOOK ' + gotS + '/' + STYLE_ORDER.length;
    $('#shots').innerHTML = STYLE_ORDER.map(k => { const n = save.shots[k] || 0, S1 = STYLES[k]; return '<div class="shotc' + (n ? ' got' : '') + '"><div class="sn">' + (n ? '◆ ' + S1.n + ' <i>×' + n + '</i>' : '◇ ' + S1.n) + '</div><div class="sh">' + escapeHtml(S1.hint) + '</div></div>'; }).join('');
    mkCards(Object.keys(LIFE_NAMES).filter(k => k !== 'mimic'), LIFE_NAMES, save.life, $('#life'));
    $('#albumScroll').scrollTop = 0;
    go('album');
  }
  function zoomPhoto(id) {
    const e = save.album.find(x => x.id == id) || S.photos.find(x => x.id == id && x.thumb);
    if (!e) return;
    const img = e.img || e.thumb, st = e.stars, cap = e.cap || e.caption, c = e.comps;
    let bars = '';
    if (c) {
      const row = (n, v, inv) => '<div class="zr"><span>' + n + '</span><span class="zb"><i style="display:block;height:100%;width:' + Math.round((inv ? 1 - v : v) * 100) + '%;background:' + ((inv ? 1 - v : v) > 0.7 ? '#4caf62' : (inv ? 1 - v : v) > 0.4 ? '#f0b429' : '#e0553f') + '"></i></span></div>';
      bars = '<div class="zbars">' + row('FRAMING', c.cen) + row('TIMING', c.timing) + row('VISIBLE', c.vis) + row('SHARP', c.blur, true) + '</div>';
    }
    $('#zoomPc').innerHTML = '<i class="tape"></i><img alt="" src="' + img + '"><div class="cap hand">' + escapeHtml(cap || '') + '</div>' + bars + '<div class="stars"><b>' + '★'.repeat(st) + '</b>' + '★'.repeat(5 - st) + '</div>';
    $('#zoom').classList.add('show'); S.zoomOpen = true;
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  const goalDots = (key) => (save.goals[key] || [false, false, false]).map(v => v ? '<b>◆</b>' : '◇').join('');
  function buildRounds() {
    const g = $('#roundsGrid'); g.innerHTML = '';
    const anyPro = ROUNDS.some((R, i) => proUnlocked(i)), proStars = ROUNDS.reduce((a, R, i) => a + ((save.pro[i] && save.pro[i].stars) || 0), 0);
    $('#rdTabs').style.display = anyPro ? '' : 'none';
    if (!anyPro) S.roundsPro = false;
    $('#tabN').classList.toggle('on', !S.roundsPro); $('#tabP').classList.toggle('on', !!S.roundsPro); $('#tabP').textContent = 'PRO ★' + proStars + '/24';
    $('#rdSub').innerHTML = (S.roundsPro ? 'Faster, no sparkle. Earn ★★★ on a round to open its PRO.' : 'Clear a round to open the next. ★★★ opens its PRO version.') + '<br><span class="rk">📷 ' + rankOf(medalCount()) + ' · ◆ ' + medalCount() + '/' + MEDALS_TOTAL + ' mastery goals</span>';
    if (S.roundsPro) {
      ROUNDS.forEach((R, i) => {
        const L = Art.LIGHTS[R.light], open = proUnlocked(i), rec = save.pro[i];
        const b = document.createElement('button'); b.className = 'tile pro' + (open ? '' : ' locked');
        b.style.background = 'linear-gradient(170deg,' + L.skyTop + ' 0%,' + L.skyBot + ' 38%,' + L.wTop + ' 40%,' + L.wBot + ' 100%)';
        const stars = rec ? [0, 1, 2].map(k => k < rec.stars ? '<b>★</b>' : '★').join('') : '★★★';
        b.innerHTML = '<div class="n">' + (i + 1) + ' <span class="prob">PRO</span></div><div class="nm">' + R.name + '</div>' + (open ? '<div class="st">' + stars + ' <span class="gm">' + goalDots('p' + i) + '</span></div><div class="as">Target ' + proRound(i).target + ' · big ' + bigAt(i, true) + (rec && rec.best ? ' · best ' + rec.best : '') + '</div>' : '<div class="as">Needs ★★★ on Round ' + (i + 1) + '</div><div class="lk">🔒</div>');
        b.addEventListener('click', () => { if (open) { Snd.unlock(); startRound(i, true); } });
        g.appendChild(b);
      });
      return;
    }
    ROUNDS.forEach((R, i) => {
      const L = Art.LIGHTS[R.light], unlocked = i <= save.maxRound, rec = save.rounds[i];
      const b = document.createElement('button'); b.className = 'tile' + (unlocked ? '' : ' locked') + (i === Math.min(save.maxRound, ROUNDS.length - 1) ? ' cur' : '');
      b.style.background = 'linear-gradient(170deg,' + L.skyTop + ' 0%,' + L.skyBot + ' 38%,' + L.wTop + ' 40%,' + L.wBot + ' 100%)';
      const stars = rec ? [0, 1, 2].map(s => s < rec.stars ? '<b>★</b>' : '★').join('') : '★★★';
      b.innerHTML = '<div class="n">' + (i + 1) + '</div><div class="nm">' + R.name + '</div>' + (unlocked ? '<div class="st">' + stars + ' <span class="gm">' + goalDots('n' + i) + '</span></div><div class="as' + (save.assign[i] ? ' on' : '') + '">📰 ' + (save.assign[i] ? 'Front page!' : ASSIGN[i].t) + '</div><div class="as nx">' + (rec && rec.best ? 'best ' + rec.best + ' · ' : '') + 'big score ' + bigAt(i, false) + '</div>' : '<div class="lk">🔒</div>');
      b.addEventListener('click', () => { if (unlocked) { Snd.unlock(); startRound(i); } });
      g.appendChild(b);
    });
    const sb = document.createElement('button'); sb.className = 'tile' + (save.maxRound >= ROUNDS.length ? '' : ' locked'); sb.style.gridColumn = '1 / -1';
    const L = Art.LIGHTS.sunset; sb.style.background = 'linear-gradient(170deg,' + L.skyTop + ',' + L.skyBot + ' 40%,' + L.wTop + ' 42%,' + L.wBot + ')';
    sb.innerHTML = '<div class="n">∞</div><div class="nm">Sunset Session · endless' + (save.sunsetBest ? ' · best ' + save.sunsetBest + ' · ' + sunsetRank(save.sunsetBest) : '') + ' <span class="gm">' + goalDots('s') + '</span></div>' + (save.maxRound >= ROUNDS.length ? '' : '<div class="lk">🔒</div>');
    sb.addEventListener('click', () => { if (save.maxRound >= ROUNDS.length) { Snd.unlock(); startSunset(); } });
    g.appendChild(sb);
  }

  // ---------- pause ----------
  function pause() {
    if (S.screen !== 'play') return;
    S.paused = true; if (S.snapQ.length) { S.film += S.snapQ.length; S.snapQ.length = 0; S.hudDirty = true; } // a shot that never developed is refunded
    $('#pauseSub').textContent = S.mode === 'sunset' ? 'Sunset Session' : S.mode === 'daily' ? 'Daily Lake · ' + prettyDate(S.dailyKey) : (S.pro ? 'PRO ' : 'Round ') + (S.round + 1) + ' · ' + S.R.name;
    go('pause');
  }
  function resume() { S.paused = false; go('play'); }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (S.screen === 'play' && !S.noPause) pause(); Snd.suspend(); } else Snd.resume();
  });
  window.addEventListener('pagehide', () => { if (S.screen === 'play' && !S.noPause) pause(); Snd.suspend(); });

  // ---------- input ----------
  let mouseX = W / 2, mouseY = H / 2;
  function toWorld(e) { const r = stage.getBoundingClientRect(); return { x: (e.clientX - r.left) / cssScale, y: (e.clientY - r.top) / cssScale }; }
  stage.addEventListener('pointerdown', (e) => {
    Snd.unlock();
    if (e.target.closest && e.target.closest('button, .pc, #zoom')) return;
    if (S.screen !== 'play' || S.paused) return;
    e.preventDefault();
    if (e.isPrimary === false) return; // a second finger never takes a second photo
    const p = toWorld(e); mouseX = p.x; mouseY = p.y;
    if (p.y > BY) { // the boardwalk: tourists say cheese, no film used
      let best = null, bd = 1e9; S.tourists.forEach(t => { const d = Math.abs(W * t.fx - p.x); if (d < bd) { bd = d; best = t; } });
      if (best && bd < 70) { best.pose = 1.6; bubble(best, pick(TOUR_SNAP)); Snd.cheese(); }
      return;
    }
    if (p.y < 0) return;
    if (p.y < 52 + insetTopW && (p.x > W - 100 || p.x < 80 || true) && p.y < 56 + insetTopW) { /* HUD strip: ignore so reaching for buttons never wastes film */ return; }
    snap(p.x, p.y);
  });
  stage.addEventListener('pointermove', (e) => { const p = toWorld(e); mouseX = p.x; mouseY = p.y; });
  ['contextmenu', 'gesturestart', 'gesturechange', 'selectstart', 'dragstart'].forEach(ev => document.addEventListener(ev, e => e.preventDefault()));
  document.addEventListener('touchmove', e => { if (!e.target.closest || !e.target.closest('#roundsGrid, #albumScroll, #result')) e.preventDefault(); }, { passive: false });
  document.addEventListener('pointerdown', () => Snd.unlock(), true);
  ['touchend', 'click'].forEach(t => document.addEventListener(t, () => Snd.unlock(), true)); // iOS only counts these as user activation
  window.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === ' ' || k === 'Enter') {
      Snd.unlock(); e.preventDefault();
      if (S.screen === 'play' && !S.paused) snap(mouseX, mouseY);
      else if (S.screen === 'title') $('#btnPlay').click();
      else if (S.screen === 'result') $('#rsNext').click();
      else if (S.screen === 'pause') $('#pResume').click();
    } else if (k === 'p' || k === 'P' || k === 'Escape') {
      if (S.zoomOpen) { $('#zoom').classList.remove('show'); S.zoomOpen = false; } else if (S.screen === 'play') pause(); else if (S.screen === 'pause') resume();
    } else if (k === 'm' || k === 'M') toggleAllSound();
  });

  function on(sel, fn) { $(sel).addEventListener('click', (e) => { e.stopPropagation(); if (S.screen === 'result' && performance.now() - (S.resultAt || 0) < 500) return; Snd.unlock(); Snd.click(); fn(e); }); }
  on('#btnPlay', () => { if (save.maxRound >= ROUNDS.length) startSunset(); else startRound(save.maxRound); });
  on('#btnRounds', () => { buildRounds(); go('rounds'); });
  on('#rdBack', () => go('title'));
  on('#tabN', () => { S.roundsPro = false; buildRounds(); }); on('#tabP', () => { S.roundsPro = true; buildRounds(); });
  on('#btnAlbum', showAlbum); on('#alBack', () => go(S.fromResult ? 'result' : 'title'));
  on('#btnSunset', () => { S.roundsPro = true; buildRounds(); go('rounds'); });
  on('#btnDaily', () => { if (dailyUnlocked()) startDaily(); });
  on('#btnSfx', () => { Snd.setSfx(!Snd.sfxOn); refreshSndButtons(); }); on('#btnMus', () => { Snd.setMusic(!Snd.musicOn); refreshSndButtons(); });
  on('#pSfx', () => { Snd.setSfx(!Snd.sfxOn); refreshSndButtons(); }); on('#pMus', () => { Snd.setMusic(!Snd.musicOn); refreshSndButtons(); });
  on('#btnSound', toggleAllSound); on('#btnPause', pause); on('#pResume', resume);
  on('#pRestart', () => { const rb = $('#pRestart'); if (!rb.dataset.arm) { rb.dataset.arm = '1'; rb.textContent = 'TAP AGAIN'; clearTimeout(S.restartT); S.restartT = setTimeout(() => { delete rb.dataset.arm; rb.textContent = 'RESTART'; }, 2500); return; } delete rb.dataset.arm; rb.textContent = 'RESTART'; if (S.mode === 'sunset') startSunset(); else if (S.mode === 'daily') startDaily(S.dailyKey); else startRound(S.round, S.pro); });
  on('#pQuit', () => { enterAttract(); go('title'); });
  on('#rsNext', () => { const a = $('#rsNext').dataset.act; if (a === 'next') startRound(S.round + 1); else if (a === 'sunset') startSunset(); else if (a === 'daily') startDaily(); else if (a === 'pro-next') startRound(S.lastRound + 1, true); else if (a === 'pro-retry') startRound(S.lastRound, true); else startRound(S.lastRound); });
  on('#rsRetry', () => startRound(S.lastRound, S.lastPro));
  on('#rsAlbum', () => { S.fromResult = true; showAlbum(); }); on('#rsMenu', () => { S.fromResult = false; go('title'); });
  $('#btnAlbum').addEventListener('click', () => { S.fromResult = false; });
  document.addEventListener('click', (e) => {
    const pc = e.target.closest && e.target.closest('.pc');
    if (pc && pc.dataset.id && !S.zoomOpen) { zoomPhoto(pc.dataset.id); return; }
    if (S.zoomOpen && e.target.closest('#zoom')) { $('#zoom').classList.remove('show'); S.zoomOpen = false; }
  });

  // ---------- sim + render ----------
  function simStep(dt) {
    S.t += dt;
    const live = S.screen === 'play' || S.attract;
    if (S.screen === 'play') checkRoundEnd(dt);
    if (live && S.phase !== 'intro' && S.phase !== 'done') updateSpawner(dt);
    else if (S.attract) updateSpawner(dt);
    updateEv(dt); updateDecoys(dt); updateFx(dt); updatePolas(dt); updateTourists(dt); updateBirds(dt);
    if (S.screen === 'play' && S.ev && S.ev.state === 'warn' && S.ev.t < dt + 0.001) S.hudDirty = true;
    if (S.tut && S.ev && S.ev.tut && S.ev.state === 'up') S.tutHand = clamp(S.tutHand + dt, 0, 5);
    // music tension: rises while Champ is under the ripples, eases off once he's up
    const tgt = S.screen === 'play' && S.ev && S.ev.state === 'warn' ? 0.4 + 0.6 * clamp(S.ev.t / S.ev.warn, 0, 1) : 0;
    Snd.tension += (tgt - Snd.tension) * Math.min(1, dt * (tgt > Snd.tension ? 6 : 2.5));
  }

  // a big dark shape rising under the surface during the warning (and fading as he breaks through)
  function drawSurfacing() {
    const ev = S.ev; if (!ev) return;
    let a;
    if (ev.state === 'warn') a = sm(ev.t / ev.warn);
    else if (ev.state === 'up') a = 1 - clamp(ev.u / 0.18, 0, 1);
    else return;
    if (a <= 0.01) return;
    const s = ev.s, k = ev.state === 'warn' ? clamp(ev.t / ev.warn, 0, 1) : 1;
    const wide = ev.kind === 'humps' || ev.kind === 'sail' ? 1.6 : ev.kind === 'breach' ? 1.35 : ev.kind === 'baby' ? 0.7 : 1;
    const rx = (30 + 18 * k) * s * wide, ry = rx * 0.26;
    const x = ev.x - ev.dir * (1 - k) * 16 * s, y = ev.y + 3 * s;
    const night = S.light === 'night' || S.light === 'dusk';
    ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    const c = night ? '0,8,20' : '4,30,44';
    g.addColorStop(0, 'rgba(' + c + ',' + (0.6 * a).toFixed(3) + ')'); g.addColorStop(0.55, 'rgba(' + c + ',' + (0.4 * a).toFixed(3) + ')'); g.addColorStop(1, 'rgba(' + c + ',0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.fill();
    ctx.restore();
  }
  // the "now!" sparkle at the top of Champ, brightest at the peak of the pose
  function drawGlint() {
    const ev = S.ev; if (!ev || !ev.glint || !ev.showGlint || ev.state !== 'up') return;
    const age = S.t - ev.glint; if (age > 0.6) return;
    const grow = sm(age / GLINT_LEAD), fade = 1 - sm((age - GLINT_LEAD - 0.12) / 0.32);
    const a = grow * fade; if (a <= 0.02) return;
    const p = poseNow(ev), els = worldEls(ev, p, wobble(ev));
    let tx = ev.x, ty = 1e9;
    els.forEach(q => { const top = q.y - q.ry; if (top < ev.y && top < ty) { ty = top; tx = q.x; } });
    if (ty > 1e8) return;
    const r = (13 + 11 * grow) * Math.max(0.85, ev.s), x = tx + 4 * ev.s, y = ty - 3;
    ctx.save(); ctx.translate(x, y); ctx.rotate(age * 2.2); ctx.globalAlpha = clamp(a, 0, 1);
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.9); g.addColorStop(0, 'rgba(255,250,220,0.9)'); g.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 0.9, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fffbe8';
    for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); const L = i % 2 ? r : r * 0.7; ctx.beginPath(); ctx.moveTo(0, -L); ctx.lineTo(r * 0.12, 0); ctx.lineTo(0, L * 0.12); ctx.lineTo(-r * 0.12, 0); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }
  function drawRings() {
    ctx.lineCap = 'round';
    S.rings.forEach(r => {
      if (r.t < 0) return;
      const a = r.a * (1 - r.t / r.life);
      ctx.strokeStyle = (r.gold ? 'rgba(255,214,90,' : r.enc ? 'rgba(130,232,255,' : r.shy ? 'rgba(150,190,255,' : 'rgba(255,255,255,') + clamp(a, 0, 1).toFixed(3) + ')'; ctx.lineWidth = r.w;
      ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r, r.r * r.flat, 0, 0, TAU); ctx.stroke();
    });
  }
  function drawActors() {
    const list = [];
    S.boats.forEach(b => list.push({ y: b.y, f: () => Art.drawSailboat(ctx, b.x, b.y, b.s, b.dir, S.t) }));
    S.decoys.forEach(d => list.push({ y: d.y, f: d.kind === 'mimic' ? () => { const u = clamp(d.t / d.life, 0, 1); Art.drawChamp(ctx, { pose: Art.pose('humps', u, S.t), x: d.x, y: d.y, s: d.s, dir: d.dir, wl: d.y, tt: S.t, fake: true }); } : () => Art.drawDecoy(ctx, d, S.t) }));
    const ev = S.ev;
    if (ev && ev.state === 'up') {
      const bob = wobble(ev);
      if (ev.vx) list.push({ y: ev.y + 0.4, f: () => { const bk = ev.kind === 'humps' ? 46 : 30; Art.wake(ctx, ev.x - ev.dir * bk * ev.s, ev.y + bob + 1, ev.s, ev.dir, 34, 0.45 * clamp(Math.sin(Math.PI * ev.u) * 2, 0, 1)); } });
      if (ev.kind === 'tail' || ev.kind === 'breach') list.push({ y: ev.y + 0.6, f: () => drawMotionLines(ev, bob) });
      list.push({ y: ev.y + 0.5, f: () => { const p = poseNow(ev); Art.drawChamp(ctx, { pose: p, x: ev.x, y: ev.y + bob, s: ev.s, dir: ev.dir, wl: ev.y + bob, tt: S.t, gold: ev.gold }); } });
    }
    list.sort((a, b) => a.y - b.y).forEach(o => o.f());
  }
  function drawMotionLines(ev, bob) {
    const dt = 0.05, p1 = poseNow(ev), p0 = Art.pose(ev.kind, clamp((ev.t - dt) / ev.D, 0, 1), S.t - dt);
    const a1 = worldEls(ev, p1, bob), a0 = worldEls(ev, p0, bob);
    let best = -1, tip = null, prev = null;
    a1.forEach((q, i) => { if (q.y - q.ry < ev.y + bob && (best < 0 || q.y < a1[best].y)) best = i; });
    if (best < 0) return; tip = a1[best]; prev = a0[best]; if (!prev) return;
    const vx = (tip.x - prev.x) / dt, vy = (tip.y - prev.y) / dt, sp = Math.hypot(vx, vy) / Math.max(0.5, ev.s);
    const a = clamp((sp - 60) / 140, 0, 1); if (a < 0.05) return;
    const ux = -vx / (sp * ev.s), uy = -vy / (sp * ev.s), nx = -uy, ny = ux;
    ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,' + (0.75 * a).toFixed(3) + ')'; ctx.lineCap = 'round';
    for (let k = -1; k <= 1; k++) {
      const ox = tip.x + nx * k * 7 * ev.s, oy = tip.y + ny * k * 7 * ev.s, L = (16 + 10 * a) * ev.s * (k ? 0.75 : 1);
      ctx.lineWidth = (k ? 1.4 : 2) * Math.max(0.7, ev.s);
      ctx.beginPath(); ctx.moveTo(ox + ux * 6 * ev.s, oy + uy * 6 * ev.s); ctx.lineTo(ox + ux * L, oy + uy * L); ctx.stroke();
    }
    ctx.restore();
  }
  function drawParts() {
    S.parts.forEach(p => {
      const a = clamp(1 - p.t / p.life, 0, 1);
      if (p.star) return;
      if (p.bubble) { ctx.strokeStyle = 'rgba(255,255,255,' + (a * 0.7).toFixed(2) + ')'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.stroke(); return; }
      ctx.fillStyle = 'rgba(236,250,255,' + (a * 0.9).toFixed(2) + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
    });
  }
  function drawStarParts() {
    S.parts.forEach(p => { if (!p.star) return; const a = clamp(1 - p.t / p.life, 0, 1); ctx.fillStyle = 'rgba(255,226,90,' + a.toFixed(2) + ')'; star5(ctx, p.x, p.y, p.r * 1.6); ctx.fill(); });
  }
  function drawFlashes() {
    S.flashes.forEach(f => {
      const t = f.t, a = clamp(1 - t / 0.5, 0, 1), sc = 1 + 0.4 * Math.pow(1 - clamp(t / 0.1, 0, 1), 2);
      const s = F * sc, x0 = f.x - s / 2, y0 = f.y - s / 2;
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,' + (0.7 * Math.pow(1 - clamp(t / 0.2, 0, 1), 1.5)).toFixed(3) + ')'; ctx.fillRect(x0, y0, s, s);
      ctx.fillStyle = 'rgba(255,255,255,' + (0.18 * Math.pow(1 - clamp(t / 0.14, 0, 1), 2)).toFixed(3) + ')'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')'; ctx.lineWidth = 3; ctx.lineCap = 'square';
      const L = 18;
      [[x0, y0, 1, 1], [x0 + s, y0, -1, 1], [x0, y0 + s, 1, -1], [x0 + s, y0 + s, -1, -1]].forEach(c => { ctx.beginPath(); ctx.moveTo(c[0] + c[2] * L, c[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(c[0], c[1] + c[3] * L); ctx.stroke(); });
      ctx.fillStyle = 'rgba(255,60,50,' + a.toFixed(3) + ')'; ctx.beginPath(); ctx.arc(x0 + 10, y0 - 9, 3.4, 0, TAU); ctx.fill();
      ctx.restore();
    });
  }
  function drawPops() {
    ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    S.pops.forEach(p => {
      const a = clamp(Math.min(1, (p.life - p.t) / 0.4), 0, 1), sc = 1 + 0.25 * Math.max(0, 1 - p.t / 0.18);
      ctx.save(); ctx.globalAlpha = a; ctx.translate(p.x, p.y); ctx.scale(sc, sc);
      ctx.font = '700 ' + p.size + 'px Fredoka, sans-serif'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(10,40,50,0.85)'; ctx.strokeText(p.txt, 0, 0); ctx.fillStyle = p.col; ctx.fillText(p.txt, 0, 0); ctx.restore();
    });
  }
  function drawTutorial() {
    const ev = S.ev; if (!ev || !ev.tut || ev.state === 'warn' && ev.t < 0.3) return;
    const t = S.t;
    const p = poseNow(ev), els = worldEls(ev, p, 0);
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, any = false;
    els.forEach(q => { if (q.y - q.ry < ev.y) { any = true; x0 = Math.min(x0, q.x - q.rx); x1 = Math.max(x1, q.x + q.rx); y0 = Math.min(y0, q.y - q.ry); y1 = Math.max(y1, Math.min(ev.y, q.y + q.ry)); } });
    const mc = any ? massCenter(ev, p, 0) : null, cx = mc ? mc.x : ev.x, cy = mc ? mc.y : ev.y - 30 * ev.s;
    const pulse = 0.5 + 0.5 * Math.sin(t * 6);
    ctx.save();
    if (ev.state === 'warn') {
      ctx.font = '700 15px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(10,40,50,0.85)'; ctx.fillStyle = '#fff';
      const ty = ev.y - 56 * ev.s - 6 + Math.sin(t * 4) * 3, msg0 = 'Ripples! Something’s coming…', hw = ctx.measureText(msg0).width / 2 + 8, tx = clamp(ev.x, hw, W - hw);
      ctx.strokeText(msg0, tx, ty); ctx.fillText(msg0, tx, ty);
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 + 0.4 * pulse).toFixed(2) + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, 20 + pulse * 8, 0, TAU); ctx.stroke();
      // ghost finger
      const fy = cy + 26 + Math.sin(t * 6) * 4;
      ctx.translate(cx + 6, fy); ctx.rotate(-0.25);
      ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.strokeStyle = 'rgba(20,50,60,0.7)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(-8, 0, 16, 34, 8); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.roundRect(-14, 18, 28, 26, 10); ctx.fill(); ctx.stroke();
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.setTransform(K, 0, 0, K, 0, 0);
      ctx.font = '700 17px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(10,40,50,0.85)'; ctx.fillStyle = '#ffe36b';
      const msg = ev.glint ? 'Sparkle! Tap his middle!' : 'Get ready… tap his middle';
      const ty = Math.max(HY + 20, cy - 80 * ev.s - 14); ctx.strokeText(msg, W / 2, ty); ctx.fillText(msg, W / 2, ty);
    }
    ctx.restore();
  }
  function render() {
    ctx.setTransform(K, 0, 0, K, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (S.shake > 0.1) ctx.translate((rand() - 0.5) * S.shake, (rand() - 0.5) * S.shake);
    Art.drawScene(ctx, S.light, { t: S.t, chop: S.wx.chop });
    drawBirds(); drawWhitecaps();
    drawSurfacing(); drawRings(); drawActors(); drawParts();
    Art.drawFog(ctx, S.wx.fog, S.t);
    const L = Art.LIGHTS[S.light];
    if (L.tint) { ctx.fillStyle = L.tint; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
    // photos are taken from the world as it looks right now (no HUD, no boardwalk)
    if (S.snapQ.length) processSnaps();
    drawGlint(); // after the photo, so the sparkle never ends up in the picture
    // boardwalk + tourists
    Art.drawReeds(ctx, S.light, S.t);
    const b = Art.board(); ctx.drawImage(b.cv, 0, BY - b.top, W, b.cv.height / K);
    if (L.lamps) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let x = 14; x < W; x += 54) { const g = ctx.createRadialGradient(x, BY - 20, 0, x, BY - 20, 26); g.addColorStop(0, 'rgba(255,214,120,' + (S.light === 'night' ? 0.55 : 0.28) + ')'); g.addColorStop(1, 'rgba(255,214,120,0)'); ctx.fillStyle = g; ctx.fillRect(x - 26, BY - 46, 52, 52); }
      ctx.restore();
    }
    drawTourists();
    if (L.tint) { ctx.fillStyle = L.tint; ctx.fillRect(0, BY - 32, W, H); }
    drawTutorial();
    drawStarParts(); drawPops(); drawFlashes();
    for (let i = S.pols.length - 1; i >= 0; i--) drawPola(S.pols[i], i);
  }

  // ---------- main loop ----------
  let last = 0, acc = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (ts - last) / 1000); last = ts;
    if (S.hitStop > 0) { S.hitStop -= dt; acc = 0; }
    else if (!S.paused && !document.hidden && !S.headless) {
      acc += dt;
      while (acc >= STEP) { simStep(STEP); acc -= STEP; }
      tickScore(dt);
    }
    renderHud();
    if (!S.headless) render();
  }

  // ---------- test hooks ----------
  function evInfo() {
    const ev = S.ev; if (!ev) return null;
    const p = poseNow(ev), els = worldEls(ev, p, wobble(ev));
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, any = false;
    els.forEach(q => { const top = q.y - q.ry, bot = Math.min(ev.y, q.y + q.ry); if (top < ev.y) { any = true; x0 = Math.min(x0, q.x - q.rx); x1 = Math.max(x1, q.x + q.rx); y0 = Math.min(y0, top); y1 = Math.max(y1, bot); } });
    const mc = any ? massCenter(ev, p, wobble(ev)) : null;
    return { id: ev.id, kind: ev.kind, state: ev.state, u: +ev.u.toFixed(3), t: +ev.t.toFixed(2), D: +ev.D.toFixed(2), x: +ev.x.toFixed(1), y: +ev.y.toFixed(1), s: +ev.s.toFixed(2), pk: +p.pk.toFixed(2), best: ev.best, cx: mc ? mc.x : null, cy: mc ? mc.y : null, bw: any ? x1 - x0 : 0, bh: any ? y1 - y0 : 0, vx: ev.vx || 0, glint: !!ev.glint };
  }
  window.__T = {
    ROUNDS, S, save: () => save,
    start(i, pro) { startRound(i || 0, pro); return this.state(); }, proUnlocked, sparkleOn: () => sparkleOn(),
    sunset() { startSunset(); return this.state(); },
    daily(key) { startDaily(key); return this.state(); }, dailyConfig, STYLES, GOALS_N, proGoals, DAILY_REQ, goalsState() { return { goals: S.goals.map((G, i) => ({ t: G.t, prog: S.gprog[i], done: S.gdone[i] })), key: S.gkey, new: S.goalsNew.slice(), tags: Object.assign({}, S.tagCount), encoreNext: S.encoreNext && Object.assign({}, S.encoreNext), chainBest: S.chainBest, req: S.req && { t: S.req.t, tag: S.req.tag, n: S.reqN, done: S.reqDone } }; }, landmarkBox, landmarkIn, medalCount, rankOf, sunsetRank, spawnEncoreNow() { spawnEncore(); }, todayKey, dailyPar, dailyMedal, ASSIGN, assignState() { return { t: S.assign && S.assign.t, done: S.assignDone, n: S.assignN }; },
    step(ms) { if (S.snapQ.length) { if (!S.headless) render(); processSnaps(); } const n = Math.round(ms / (STEP * 1000)); for (let i = 0; i < n; i++) simStep(STEP); return this.state(); },
    state() { return { screen: S.screen, phase: S.phase, round: S.round, film: S.film, score: S.score, streak: S.streak, sights: S.sights.map(s => s.status[0]).join(''), queue: S.queue.length, ev: evInfo(), decoys: S.decoys.map(d => d.kind + '@' + Math.round(d.x) + ',' + Math.round(d.y)), photos: S.photos.length, pols: S.pols.length, paused: S.paused, W, H, HY, BY, F, k: K, cssScale, wx: S.wx }; },
    ev: evInfo,
    snap(x, y) { const ok = snap(x, y); if (ok) { if (!S.headless) render(); processSnaps(); } return ok ? S.photos[S.photos.length - 1] && { stars: S.photos[S.photos.length - 1].stars, score: S.photos[S.photos.length - 1].score, pts: S.photos[S.photos.length - 1].pts, cap: S.photos[S.photos.length - 1].caption, hint: S.photos[S.photos.length - 1].hint, comps: S.photos[S.photos.length - 1].comps, kind: S.photos[S.photos.length - 1].kind } : null; },
    spawn(kind, x, y, opts) { S.ev = null; const e = newEv(kind, Object.assign({ x: x === undefined ? W / 2 : x, y: y === undefined ? (HY + BY) / 2 : y }, opts || {})); return evInfo(); },
    decoy(kind) { return !!spawnDecoy(kind); },
    goldNext() { if (S.ev) S.ev.gold = true; },
    skipToPeak() { const ev = S.ev; if (!ev) return null; if (ev.state === 'warn') { ev.t = ev.warn - 0.001; this.step(30); } ev.t = Math.max(0, 0.5 * ev.D - 0.02); this.step(20); return evInfo(); },
    giveFilm(n) { S.film = n; S.hudDirty = true; },
    pause, resume, go, finish() { S.phase = 'ending'; S.endT = 0.01; },
    noPause(v) { S.noPause = !!v; },
    headless(v) { S.headless = !!v; },
    seed(n) { _seed = n >>> 0 || 1; },
    unlockAll() { save.maxRound = ROUNDS.length; persist(); },
    resetSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* */ } save = blankSave(); },
    layout, remapTest: remap,
    // headless bot: plays one round at a given skill and reports. noise = tap error in px, aim = target peak value
    sim(i, o) {
      o = o || {}; const noise = o.noise === undefined ? 12 : o.noise, aim = o.aim === undefined ? 0.85 : o.aim, lag = o.lag || 0;
      const wasH = S.headless; S.headless = true;
      if (o.seed) this.seed(o.seed);
      S.noPause = true; save.tut = true;
      if (o.sunset) startSunset(); else if (o.daily) startDaily(o.daily); else startRound(i, o.pro);
      let guard = 0, shots = []; const tgt0 = S.R.target || 0;
      while (S.screen === 'play' && guard < 60 * 60 * 6) {
        guard++; simStep(STEP);
        const ev = S.ev;
        if (ev && ev.state === 'up' && S.film > 0 && S.phase !== 'ending') {
          const info = evInfo();
          if (info && info.pk >= aim && !ev.botShot && info.cx !== null) {
            ev.botShot = true; S.lastSnap = null; // one shot per sighting; the double-tap guard is for fingers, not the bot
            const nx = (rand() + rand() + rand() - 1.5) * 2 * noise, ny = (rand() + rand() + rand() - 1.5) * 2 * noise;
            if (snap(info.cx + nx, info.cy + ny)) { processSnaps(); const ph = S.photos[S.photos.length - 1]; shots.push(ph.stars + ':' + ph.score); }
          }
        }
        if (S.phase === 'done') break;
      }
      const out = { round: i, tags: Object.assign({}, S.tagCount), chain: S.chainBest, goals: S.gdone.map(v => v ? 1 : 0).join(''), score: S.score, target: o.sunset || o.daily ? 0 : tgt0, film: S.film, sights: S.sights.map(s => s.status[0]).join(''), shots: shots.join(' '), sec: +S.t.toFixed(0) };
      S.noPause = false; S.headless = wasH; return out;
    },
  };

  // ---------- boot ----------
  loadSave(); Snd.load(); refreshSndButtons(); Art.loadAssets();
  window.addEventListener('resize', () => layout(false));
  window.addEventListener('orientationchange', () => setTimeout(() => layout(true), 250));
  layout(true);
  initTourists(); enterAttract(); go('title');
  requestAnimationFrame((ts) => { last = ts; frame(ts); });
  if (document.fonts && document.fonts.load) { ['700 17px Caveat', '600 12px Fredoka', '700 18px Fredoka', '20px "Bowlby One"'].forEach(f => document.fonts.load(f)); }
})();
