/* ParuParu Park AI — shared core
 * - attraction data (scraped from pal2.co.jp → data/attractions.js) + operator edits
 * - AI camera simulation (deterministic, so guest app & admin agree)
 * - shared store (localStorage, synced between tabs)
 */
(function () {
  'use strict';

  const DATA = window.PARK_DATA;
  const ALL = DATA.attractions;
  const BASE_RIDES = ALL.filter(a => a.isAttraction);
  const FACILITIES = ALL.filter(a => !a.isAttraction);
  const ZONES = DATA.zones;
  const zoneByKey = Object.fromEntries(ZONES.map(z => [z.key, z]));

  /* ---------- storage ---------- */
  const PREFIX = 'pp.v2.';
  const mem = {};
  const listeners = new Set();
  let version = 0;
  const store = {
    get(key, def) {
      try {
        const v = localStorage.getItem(PREFIX + key);
        return v == null ? (key in mem ? mem[key] : def) : JSON.parse(v);
      } catch (e) { return key in mem ? mem[key] : def; }
    },
    set(key, val) {
      mem[key] = val; version++;
      try { localStorage.setItem(PREFIX + key, JSON.stringify(val)); } catch (e) { /* private mode */ }
      listeners.forEach(fn => fn(key));
    },
    update(key, def, fn) { const v = fn(store.get(key, def)); store.set(key, v); return v; },
    on(fn) { listeners.add(fn); },
  };
  window.addEventListener('storage', e => {
    if (e.key && e.key.startsWith(PREFIX)) { version++; listeners.forEach(fn => fn(e.key.slice(PREFIX.length))); }
  });

  /* ---------- ride parameters ----------
   * seats / cycle / cap and the 14:32 snapshot count come from the design mockup
   * (the official site does not publish them). base = peak occupancy derived from the snapshot. */
  const SPEC = {   // [seats per run, minutes per run, people counted at 14:32, queue capacity]
    bakke: [8, 3, 12, 40], gururimori: [12, 4, 0, 60], coaster: [14, 3, 180, 200], kurukuru: [11, 3, 48, 90],
    mini: [10, 3, 30, 80], baloon: [10, 3, 58, 100], gokart: [9, 3, 124, 110], miniq: [8, 3, 22, 70],
    blockcart: [12, 4, 26, 60], dragon: [8, 4, 40, 70], popcornpanic: [24, 6, 55, 90], wild: [12, 3, 62, 80],
    tower: [8, 3, 0, 60], detemiya: [15, 5, 34, 80], donburako: [10, 3, 88, 120], goodjob: [10, 4, 18, 50],
    kaizoku: [24, 3, 70, 100], train: [12, 4, 25, 50], merrygoround: [30, 4, 44, 90], theater: [40, 8, 60, 120],
    stadium: [20, 6, 30, 100], parachute: [12, 3, 41, 60], fireman: [10, 4, 36, 60], teacup: [24, 3, 28, 60],
    koku: [36, 11, 96, 140], ducks: [12, 3, 20, 50],
  };
  const PHASE = { bakke: -.4, gururimori: .3, coaster: -.2, kurukuru: -.9, mini: .5, baloon: .1, gokart: .3, miniq: .8,
    blockcart: -.3, dragon: .2, wild: .4, tower: -.5, detemiya: .6, goodjob: -.2, kaizoku: .2, train: -.6,
    merrygoround: .1, stadium: .7, koku: .9, ducks: -.3 };
  const SNAP_CURVE = .82;                     // day curve value at 14:32
  const HOURS = '10:00 – 16:30';
  const OPEN_H = 10, CLOSE_H = 16.5;
  const LOCATION = { x: 52, y: 88 };          // 現在地 (park entrance)
  const M_PER_PX = 0.28;                      // map px (2400 wide) → metres
  const WALK_M_PER_MIN = 70;

  function defaults(a) {
    const s = SPEC[a.id];
    const seats = s ? s[0] : 10, cycle = s ? s[1] : 3, cap = s ? s[3] : 60;
    const base = s && s[2] ? Math.min(1.35, s[2] / cap / SNAP_CURVE) : .42;
    return { name: a.name, zoneKey: a.zoneKey, status: null, cap, seats, cycle, base, phase: PHASE[a.id] || 0,
      height: a.heightLimit && a.heightLimit.min || '', hours: HOURS, desc: a.catchcopy || '',
      thMid: 45, thBusy: 75, alertOps: true, notifyGuest: true, notifyFree: true };
  }
  let cache = { v: -1 };
  function rideList() {
    if (cache.v === version) return cache.rides;
    const edits = store.get('rideEdits', {});
    const added = store.get('ridesAdded', []);
    const removed = store.get('ridesRemoved', []);
    const list = BASE_RIDES.concat(added).filter(a => !removed.includes(a.id)).map(a => {
      const d = defaults(a), e = edits[a.id] || {};
      const cfg = Object.assign({}, d, e);
      ['cap', 'seats', 'cycle', 'thMid', 'thBusy'].forEach(k => { cfg[k] = Number(cfg[k]) || d[k]; });
      const z = zoneByKey[cfg.zoneKey] || zoneByKey[a.zoneKey];
      return Object.assign({}, a, {
        name: cfg.name || a.name, zoneKey: z.key, zone: z.name, catchcopy: cfg.desc || a.catchcopy,
        heightLimit: cfg.height ? Object.assign({}, a.heightLimit, { min: Number(cfg.height) }) : a.heightLimit,
        cfg,
      });
    });
    cache = { v: version, rides: list, byId: Object.fromEntries(list.concat(FACILITIES).map(a => [a.id, a])) };
    return list;
  }
  const rides = () => rideList();
  const byId = id => { rideList(); return cache.byId[id]; };
  const cfg = a => (a.cfg || byId(a.id).cfg);
  const throughput = a => { const c = cfg(a); return c.seats > 0 && c.cycle > 0 ? Math.round(c.seats * 60 / c.cycle) : 0; };

  /* ---------- clock ----------
   * Inside opening hours → real time. Outside → demo clock starting 14:32 today,
   * shared between tabs through the store so guest & admin show the same moment. */
  function simNow() {
    const d = new Date();
    const h = d.getHours() + d.getMinutes() / 60;
    if (h >= OPEN_H && h < CLOSE_H) return d;
    let start = store.get('demoStart', 0);
    if (!start || Date.now() - start > 2 * 3600e3) { start = Date.now(); store.set('demoStart', start); }
    const base = new Date(d); base.setHours(14, 32, 0, 0);
    return new Date(base.getTime() + (Date.now() - start));
  }
  const pad = n => String(n).padStart(2, '0');
  const hhmm = d => pad(d.getHours()) + ':' + pad(d.getMinutes());
  const WD = ['日', '月', '火', '水', '木', '金', '土'];
  const dateLabel = d => `${d.getMonth() + 1}/${d.getDate()}（${WD[d.getDay()]}）${hhmm(d)}`;
  const hourOf = d => d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  const atHour = (ref, h) => { const d = new Date(ref); d.setHours(0, 0, 0, 0); return new Date(d.getTime() + h * 3600e3); };

  /* ---------- deterministic noise ---------- */
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    h += h << 13; h ^= h >>> 7; h += h << 3; h ^= h >>> 17; h += h << 5;
    return ((h >>> 0) % 100000) / 100000;
  }
  const daySeed = d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  function smoothNoise(key, d) {
    const m = hourOf(d) * 60 / 7;
    const k = Math.floor(m), f = m - k, s = daySeed(d);
    const a = hash(key + s + k) * 2 - 1, b = hash(key + s + (k + 1)) * 2 - 1;
    const t = f * f * (3 - 2 * f);
    return a + (b - a) * t;
  }

  /* ---------- crowd model ---------- */
  function dayCurve(h, phase) {
    if (h < OPEN_H || h > CLOSE_H) return 0;
    const ramp = Math.min(1, (h - OPEN_H) / 1.2 + .15);
    const peak = Math.exp(-Math.pow(h - (13.4 + phase), 2) / (2 * 1.5 * 1.5));
    return ramp * (.28 + .72 * peak);
  }
  const REASON_LABEL = { '点検': '点検中', '長期整備': '長期整備中', '整備': '整備中', '休止': '休止中', '運休': '休止中', '未開業': '未開業' };
  const STATUS_REASON = { '整備中': '整備', '休止中': '休止', '未開業': '未開業' };
  function closedReason(a) {
    const st = cfg(a).status;
    if (st === '稼働中') return null;
    if (st && STATUS_REASON[st]) return STATUS_REASON[st];
    return a.closedReason || null;
  }
  const closedLabel = r => REASON_LABEL[r] || (/中$/.test(r) ? r : r + '中');
  function occAt(a, d, jitter) {
    const c = cfg(a);
    let v = c.base * dayCurve(hourOf(d), c.phase) * (1 + .14 * smoothNoise(a.id, d));
    if (jitter) v += (hash(a.id + Math.floor(d.getTime() / 5000)) - .5) * .03;   // 5s measurement jitter
    return Math.max(0, Math.min(1.3, v));
  }
  function levelFor(a, occ) {
    const c = cfg(a);
    return occ >= c.thBusy / 100 ? 'busy' : occ >= c.thMid / 100 ? 'mid' : 'free';
  }
  const LEVEL_LABEL = { busy: '混雑', mid: 'やや混雑', free: '空き', maint: '休止中', nocam: 'カメラ未割当' };
  function waitFromCount(a, people) {
    const thr = throughput(a);
    if (!thr || !people) return 0;
    return Math.round(people / thr * 60 * 1.15 / 5) * 5;
  }
  function live(a, d) {
    d = d || simNow();
    const c = cfg(a);
    const reason = closedReason(a);
    if (reason) return { closed: true, reason, label: closedLabel(reason), people: 0, cap: c.cap, occ: 0, level: 'maint', wait: 0 };
    if (!camerasForRide(a.id).length) return { nocam: true, label: 'カメラ未設置', people: 0, cap: c.cap, occ: 0, level: 'nocam', wait: 0 };
    const people = Math.round(occAt(a, d, true) * c.cap);
    const occ = people / c.cap;
    const level = levelFor(a, occ);
    const calc = waitCalc(a, d);
    return { closed: false, people, cap: c.cap, occ, level, label: LEVEL_LABEL[level], wait: calc.wait };
  }
  const measurable = a => !closedReason(a) && camerasForRide(a.id).length > 0;

  /* ---------- wait time: one queue camera per ride ----------
   * people = sum of the ride's queue cameras (each its own stretch), average of the last 3 minutes (so a few people moving don't jitter it)
   * capacity = seats per run × runs per hour (set per ride in the admin)
   * wait = people ÷ capacity × 60 × 1.15 (loading / empty-seat factor), rounded to 5 minutes */
  const QUEUE_AVG = 3, LOAD_FACTOR = 1.15;
  function waitCalc(a, d) {
    d = d || simNow();
    const c = cfg(a), thr = throughput(a);
    let q = 0;
    for (let m = 0; m < QUEUE_AVG; m++) q += occAt(a, new Date(d.getTime() - m * 60e3), m === 0) * c.cap;
    // total = sum of every queue camera's stretch; a camera that is down is estimated from its usual share (推定)
    const paused = store.get('pausedCams', {});
    const parts = queueShares(a).map(({ cam, share }) => ({ cam, share, count: Math.round(q / QUEUE_AVG * share), est: deadCam(cam) || paused[cam.code] != null }));
    const queue = parts.length ? parts.reduce((s, p) => s + p.count, 0) : Math.round(q / QUEUE_AVG);
    const raw = thr ? queue / thr * 60 * LOAD_FACTOR : 0;
    return { queue, thr, raw, wait: queue ? Math.round(raw / 5) * 5 : 0, parts, estimated: parts.some(p => p.est), queueCams: parts.map(p => p.cam) };
  }
  /* future estimate (charts, AI route): same model without camera noise */
  function predictWait(a, d) {
    return waitFromCount(a, Math.round(occAt(a, d, false) * cfg(a).cap));
  }

  /* 12 time slots across the operating day (for bar charts) */
  const SLOTS = 12;
  const slotHour = i => OPEN_H + (i + .5) * (CLOSE_H - OPEN_H) / SLOTS;
  function slotIndex(d) {
    const h = hourOf(d);
    return Math.max(0, Math.min(SLOTS - 1, Math.floor((h - OPEN_H) / ((CLOSE_H - OPEN_H) / SLOTS))));
  }
  function series(fn, d) {
    d = d || simNow();
    const vals = [];
    for (let i = 0; i < SLOTS; i++) vals.push(fn(atHour(d, slotHour(i))));
    return { vals, current: slotIndex(d) };
  }
  const attractionSeries = (a, d) => series(t => occAt(a, t, false), d);

  /* ---------- park & zone aggregates ---------- */
  const openRides = () => rides().filter(measurable);
  function zoneStats(key, d) {
    d = d || simNow();
    let people = 0, cap = 0;
    const zr = rides().filter(a => a.zoneKey === key);
    zr.forEach(a => { const l = live(a, d); if (!l.closed && !l.nocam) { people += l.people; cap += l.cap; } });
    const occ = cap ? people / cap : 0;
    return { key, name: zoneByKey[key].name, people, cap, n: zr.length, occ, level: occ >= .7 ? 'busy' : occ >= .45 ? 'mid' : 'free' };
  }
  function parkGuestsAt(d, jitter) {
    let s = 0;
    rides().forEach(a => { if (measurable(a)) s += Math.round(occAt(a, d, jitter) * cfg(a).cap); });
    return Math.round(s * 1.2 + 120 * dayCurve(hourOf(d), 0) + 40);
  }
  const parkGuests = d => parkGuestsAt(d || simNow(), true);
  const parkSeries = d => series(t => parkGuestsAt(t, false), d);

  /* ---------- geometry ---------- */
  function metres(p, q) {
    const dx = (p.x - q.x) * 24, dy = (p.y - q.y) * 17.15;
    return Math.round(Math.hypot(dx, dy) * M_PER_PX);
  }
  /* guest position: the park entrance until the guest "arrives" somewhere via 経路案内 */
  const guestPos = () => store.get('guestPos', null) || Object.assign({ name: '現在地' }, LOCATION);
  const setGuestPos = (pin, name) => store.set('guestPos', { x: pin.x, y: pin.y, name: name || '現在地' });
  const resetGuestPos = () => store.set('guestPos', null);
  const nearRadius = () => Number(store.get('nearRadius', 200)) || 200;          // AI notification radius (m)
  const distanceTo = (a, from) => a.pin ? metres(from || guestPos(), a.pin) : null;
  /* an AI notice about a ride is shown to the guest only when that ride is within nearRadius() */
  function isNearGuest(attId) {
    const a = byId(attId);
    return !!(a && a.pin && metres(guestPos(), a.pin) <= nearRadius());
  }
  const walkMin = m => Math.max(1, Math.round(m / WALK_M_PER_MIN));

  /* ---------- cameras ---------- */
  const Q = "待機列の計測";
  const CAMERAS_BASE = [
    { code: 'CAM-01', place: 'メインゲート', zone: 'entrance', kind: 'gate', model: 'AXIS P3265-LV', installed: '03/2024', acc: 98.2,
      covers: [{ name: '改札ゲートA〜D', role: '入退場の計測' }, { name: 'ゲート前広場', role: 'エリア混雑度' }] },
    { code: 'CAM-02', place: 'バッケとかくれんぼ', model: 'AXIS M3086-V', installed: '03/2024', acc: 97.9, covers: [{ att: 'bakke', role: Q }] },
    { code: 'CAM-03', place: 'ミニコースター', model: 'AXIS M3086-V', installed: '03/2024', acc: 97.4, covers: [{ att: 'mini', role: Q }] },
    // long queue: two queue cameras, each counting its own stretch (share = usual portion of the line, %)
    { code: 'CAM-04', place: 'メガコースター 待機列（前方）', model: 'AXIS P3265-LV', installed: '03/2024', acc: 97.5,
      covers: [{ att: 'coaster', role: Q, share: 60 }, { name: 'エントランスゾーン中央通路', role: 'エリア混雑度' }] },
    { code: 'CAM-05', place: 'メガコースター 待機列（後方）', model: 'AXIS M3086-V', installed: '03/2024', acc: 96.8, covers: [{ att: 'coaster', role: Q, share: 40 }] },
    { code: 'CAM-08', place: 'ゴーカート', model: 'AXIS M3086-V', installed: '06/2024', acc: 97.0, covers: [{ att: 'gokart', role: Q }] },
    { code: 'CAM-09', place: 'ミニＱレーシング', model: 'AXIS M3086-V', installed: '06/2024', acc: 96.9, covers: [{ att: 'miniq', role: Q }] },
    { code: 'CAM-11', place: 'バルーンレース', model: 'AXIS M3086-V', installed: '06/2024', acc: 97.1, covers: [{ att: 'baloon', role: Q }] },
    { code: 'CAM-12', place: 'ボンジョールノのくるくるクルーズ', model: 'AXIS M3086-V', installed: '06/2024', acc: 97.2, covers: [{ att: 'kurukuru', role: Q }] },
    { code: 'CAM-14', place: 'ドン・ブラーコ', model: 'AXIS P3265-LV', installed: '06/2024', acc: 96.3, covers: [{ att: 'donburako', role: Q }] },
    { code: 'CAM-17', place: 'レイクサイド飲食エリア', zone: 'lakeside', kind: 'area', status: 'lost', model: 'AXIS M3086-V', installed: '09/2024',
      covers: [{ name: 'レイクサイドフードエリア', role: '座席の混雑度' }] },
    { code: 'CAM-21', place: '空中ブランコ', status: 'maint', model: 'AXIS M3086-V', installed: '09/2024', covers: [{ att: 'tower', role: Q }] },
  ];
  ['gururimori', 'blockcart', 'dragon', 'popcornpanic', 'wild', 'detemiya', 'goodjob', 'kaizoku', 'train', 'merrygoround',
    'theater', 'stadium', 'parachute', 'fireman', 'teacup', 'koku', 'ducks'].forEach((id, i) => {
    const code = 'CAM-' + ['06', '07', '10', '13', '15', '16', '18', '19', '20', '22', '23', '24', '25', '26', '27', '28', '29'][i];
    const a = BASE_RIDES.find(x => x.id === id);
    CAMERAS_BASE.push({ code, place: a.name, model: i % 3 === 0 ? 'AXIS P3265-LV' : 'AXIS M3086-V', installed: i % 2 ? '09/2024' : '12/2024',
      acc: +(96 + (i % 4) * .4).toFixed(1), covers: [{ att: id, role: Q }] });
  });
  const CAM_STATUS = {
    ok:       { label: '稼働中',       key: 'free' },
    overload: { label: 'フレーム過負荷', key: 'mid' },
    lost:     { label: '信号断',       key: 'busy' },
    maint:    { label: '整備中',       key: 'maint' },
    inactive: { label: '未有効化',     key: 'nocam' },
  };
  const CAM_MODELS = ['AXIS M3086-V', 'AXIS P3265-LV', 'Hanwha XNV-C7083R'];
  const CAM_ROLES = ["待機列の計測"];
  /* フレーム過負荷 is computed, not stored: AI load = people detected in frame ÷ what the model can
   * track in real time. Above LOAD_HI frames get skipped (overload); it clears only below LOAD_LO (hysteresis).
   * 信号断 / 整備中 / 未有効化 stay manual device states. */
  const MODEL_CAP = { 'AXIS M3086-V': 120, 'AXIS P3265-LV': 240, 'Hanwha XNV-C7083R': 180 };   // people per frame
  const LOAD_HI = .9, LOAD_LO = .75;
  const frameCap = c => MODEL_CAP[c.model] || 150;
  const camLoadAt = (c, d, jitter) => cameraCountAt(c, d, jitter) / frameCap(c);
  function autoStatus(c, d) {
    const step = 60e3, open = atHour(d, OPEN_H).getTime();
    let hi = null;
    // walk back minute by minute until the load was clearly low; any spike since then means overload
    for (let t = Math.floor(d.getTime() / step) * step; t >= open; t -= step) {
      const l = camLoadAt(c, new Date(t), false);
      if (l < LOAD_LO) break;
      if (l > LOAD_HI) hi = t;
    }
    return hi == null ? { status: 'ok', since: null } : { status: 'overload', since: hi };
  }
  function camPerf(c, d) {   // live processing figures shown on the camera detail page
    const load = camLoadAt(c, d || simNow(), true), over = c.status === 'overload', base = c.fps || 25;
    return {
      load, cap: frameCap(c), over,
      fps: over ? Math.max(8, Math.round(base * LOAD_HI / Math.max(load, LOAD_HI) * .6)) : base,
      latency: 1.2 + Math.max(0, load - .5) * (over ? 4 : 2),
      acc: c.acc == null ? null : c.acc - (over ? Math.max(0, load - LOAD_LO) * 20 : 0),
    };
  }
  let camCache = { v: -1 };
  function cameras() {
    const now = simNow();
    const key = version + ':' + Math.floor(now.getTime() / 60e3);
    if (camCache.v === key) return camCache.list;
    const edits = store.get('cameraEdits', {});
    const added = store.get('camerasAdded', []);
    const removed = store.get('camerasRemoved', []);
    const list = CAMERAS_BASE.concat(added).filter(c => !removed.includes(c.code)).map(c => {
      const e = Object.assign({ status: 'ok', res: '1920×1080', fps: 25, sens: 70, interval: 5, minConf: 85, alertLost: true, edge: true, clip: false },
        c, edits[c.code] || {});
      e.covers = e.covers.map(v => (v.att && v.role !== Q ? Object.assign({}, v, { role: Q }) : v));   // cameras are queue-only (old saved boarding roles)
      const first = e.covers.find(v => v.att);
      if (first) {
        const r = BASE_RIDES.concat(store.get('ridesAdded', [])).find(x => x.id === first.att);
        if (r) e.zone = zoneOfRide(r);
      }
      e.zone = e.zone || 'entrance';
      return e;
    }).sort((a, b) => a.code.localeCompare(b.code));
    camCache = { v: key, list };
    // status second: the load uses each camera's share of the queue, which needs the full list
    list.forEach(e => { if (e.status === 'ok' || e.status === 'overload') { const s = autoStatus(e, now); e.status = s.status; e.overSince = s.since; } });
    return list;
  }
  function zoneOfRide(r) { const e = store.get('rideEdits', {})[r.id]; return (e && e.zoneKey) || r.zoneKey; }
  const camerasForRide = id => cameras().filter(c => c.covers.some(v => v.att === id));
  /* several queue cameras on one ride: each counts its own, non-overlapping stretch of the line (no double counting).
   * share = that stretch's usual portion of the queue (%, set in the ride form); missing shares split the rest equally. */
  function queueShares(a) {
    const cams = camerasForRide(a.id);
    if (cams.length <= 1) return cams.map(cam => ({ cam, share: 1 }));
    const given = cams.map(c => Number((c.covers.find(v => v.att === a.id) || {}).share) || 0);
    const unknown = given.filter(x => !x).length, rest = Math.max(0, 100 - given.reduce((s, x) => s + x, 0));
    const raw = given.map(x => x || (unknown ? rest / unknown : 0));
    const tot = raw.reduce((s, x) => s + x, 0) || 1;
    return cams.map((cam, i) => ({ cam, share: raw[i] / tot }));
  }
  const shareOf = (c, a) => { const s = queueShares(a).find(x => x.cam.code === c.code); return s ? s.share : 1; };
  const deadCam = c => c.status === 'lost' || c.status === 'maint' || c.status === 'inactive';
  function cameraCountAt(c, d, jitter) {   // raw model value (history); cameraCount() applies device state
    const atts = c.covers.filter(v => v.att);
    if (atts.length) {
      return atts.reduce((sum, v) => {
        const a = byId(v.att);
        if (!a || closedReason(a)) return sum;
        return sum + Math.round(occAt(a, d, jitter) * cfg(a).cap * shareOf(c, a));   // only this camera's stretch of the line
      }, 0);
    }
    if (c.kind === 'gate') {
      const v = 72 * dayCurve(hourOf(d), -.8) * (1 + .15 * smoothNoise(c.code, d));
      return Math.max(0, Math.round(v + (jitter ? (hash(c.code + Math.floor(d.getTime() / 5000)) - .5) * 4 : 0)));
    }
    return Math.round(40 * dayCurve(hourOf(d), .2));
  }
  function cameraCount(c, d) {
    if (c.status === 'lost') return null;
    if (deadCam(c)) return 0;
    const paused = store.get('pausedCams', {});
    if (paused[c.code] != null) return paused[c.code];
    return cameraCountAt(c, d || simNow(), true);
  }
  const cameraSeries = (c, d) => series(t => cameraCountAt(c, t, false), d);

  /* ---------- notifications ---------- */
  const NOTIF_TYPES = {
    crowd:    { label: '混雑',    bg: '#ffe9e4', ink: '#b3230f' },
    disperse: { label: '分散誘導', bg: '#fff2d4', ink: '#8a5200' },
    maint:    { label: '整備',    bg: '#ededf2', ink: 'rgba(22,24,29,.6)' },
    weather:  { label: '天候',    bg: '#e4f4fc', ink: '#00688f' },
    event:    { label: 'イベント', bg: '#e4f7ec', ink: '#0d7a3c' },
  };
  const AREAS = [['all', '全エリア']].concat(ZONES.map(z => [z.key, z.name]));
  const areaName = k => (AREAS.find(a => a[0] === k) || [k, k])[1];
  const CHANNELS = { both: 'プッシュ＋アプリ内', push: 'プッシュ', app: 'アプリ内' };

  function seed() {
    if (store.get('seeded', 0) === 2) return;
    const now = simNow();
    const ago = min => now.getTime() - min * 60e3;
    store.set('notifications', [
      { id: 'N-118', type: 'crowd', auto: true, att: 'coaster', kind: 'crowd', radius: 200, title: 'メガコースター「四次元」が混雑しています', body: '待ち時間は45分です。空いているミニＱレーシングはいかがですか。', area: 'entrance', channel: 'both', status: 'sent', sentAt: ago(.5), createdAt: ago(.5), reach: 1284 },
      { id: 'N-117', type: 'maint', auto: false, title: '空中ブランコ「まわっタワ～」は点検中です', body: '15:30に再開予定です。ご了承ください。', area: 'all', channel: 'app', status: 'sent', sentAt: ago(42), createdAt: ago(42), reach: 2410 },
      { id: 'N-116', type: 'disperse', auto: true, title: 'モンテゾーンの混雑がピークです', body: 'レイクサイドゾーンの方が空いています。移動をおすすめします。', area: 'monte', channel: 'both', status: 'sent', sentAt: ago(62), createdAt: ago(62), reach: 1876 },
      { id: 'N-115', type: 'event', auto: false, title: '20:00から花火ショーを開催します', body: 'レイクサイドステージ前でお待ちください。', area: 'all', channel: 'push', status: 'scheduled', scheduledAt: atHour(now, 19.5).getTime(), createdAt: ago(90) },
      { id: 'N-114', type: 'crowd', auto: true, att: 'gokart', kind: 'over', radius: 200, title: 'ゴーカートの待ち列を一時停止しました', body: '混雑解消のため、15分後に再開します。', area: 'entrance', channel: 'app', status: 'sent', sentAt: ago(107), createdAt: ago(107), reach: 940 },
      { id: 'N-113', type: 'weather', auto: false, title: '雨天のため一部アトラクションを休止します', body: '対象アトラクションはアプリでご確認ください。', area: 'all', channel: 'both', status: 'draft', createdAt: ago(150) },
    ]);
    store.set('logs', [
      { t: ago(3), text: 'モンテゾーンからメガコースター入口へスタッフ3名を配置' },
      { t: ago(20), text: '補助列を開放：ゴーカート' },
      { t: ago(42), text: '空中ブランコ「まわっタワ～」を整備のため運行停止' },
      { t: ago(62), text: '分散案内を通知：エントランスゾーン（アプリ配信）' },
    ]);
    // current states count as already notified, so only new changes trigger AI notices
    const sent = {};
    rides().forEach(a => { autoKinds(a, live(a, now)).forEach(k => { sent[a.id + ':' + k] = now.getTime(); }); });
    store.set('autoSent', sent);
    store.set('guestPos', null);
    store.set('seeded', 2);
  }
  const notifications = () => store.get('notifications', []);
  function notifStatus(n, d) {
    d = d || simNow();
    if (n.status === 'sent') return d.getTime() - n.sentAt < 3 * 60e3 ? 'sending' : 'sent';
    return n.status;
  }
  const STATUS_LABEL = { sending: '送信中', sent: '送信済み', scheduled: '予約', draft: '下書き' };
  function estimateReach(area, d, nearby) {
    const g = parkGuests(d);
    if (nearby) return Math.round(g * .35 * nearRadius() / 200 / 10) * 10;   // guests within the radius
    return Math.round(g * (area === 'all' ? 1.9 : .95) / 10) * 10;
  }
  function nextNoticeId() {
    const nums = notifications().map(n => parseInt(String(n.id).replace(/\D/g, ''), 10)).filter(n => n > 0);
    return 'N-' + (Math.max(112, ...nums) + 1);
  }
  function saveNotification(n) {
    store.update('notifications', [], list => {
      const i = list.findIndex(x => x.id === n.id);
      if (i >= 0) list[i] = n; else list.unshift(n);
      return list;
    });
  }
  function addLog(text, d) {
    store.update('logs', [], l => [{ t: (d || simNow()).getTime(), text }].concat(l).slice(0, 60));
  }

  /* nearest quiet ride — alternatives & AI notifications */
  function alternatives(a, n, d) {
    d = d || simNow();
    const from = a.pin || LOCATION;
    return openRides()
      .filter(x => x.id !== a.id && x.pin)
      .map(x => ({ a: x, l: live(x, d), m: metres(from, x.pin) }))
      // quiet rides first; if there are not enough, fill up with busier ones (farther / longer waits)
      .sort((p, q) => ((p.l.level === 'busy') - (q.l.level === 'busy')) || (p.l.wait + walkMin(p.m)) - (q.l.wait + walkMin(q.m)))
      .slice(0, n || 3);
  }

  /* scheduled release + AI auto-send when a ride crosses its 混雑 threshold */
  function autoSendCheck(d) {
    d = d || simNow();
    notifications().filter(n => n.status === 'scheduled' && n.scheduledAt <= d.getTime()).forEach(n => {
      saveNotification(Object.assign({}, n, { status: 'sent', sentAt: d.getTime(), reach: estimateReach(n.area, d) }));
      addLog(`予約通知を送信：${n.title}`, d);
    });
    if (!store.get('autoSendEnabled', true)) return;
    const sent = store.get('autoSent', {});
    let changed = false;
    rides().forEach(a => {
      const l = live(a, d);
      const kinds = autoKinds(a, l);
      if (!kinds.includes('maint') && sent[a.id + ':maint']) { delete sent[a.id + ':maint']; changed = true; }   // reopened → a later closure notifies again
      if (!cfg(a).notifyGuest) return;
      kinds.forEach(kind => {
        const key = a.id + ':' + kind;
        if (sent[key] && (kind === 'maint' || d.getTime() - sent[key] < 45 * 60e3)) return;   // maint: once per closure
        if (kind === 'crowd' && kinds.includes('over')) return;                                // overload message supersedes crowd
        sent[key] = d.getTime(); changed = true;
        saveNotification(Object.assign(autoMessage(a, l, kind, d), {
          id: nextNoticeId(), auto: true, att: a.id, kind, radius: nearRadius(),
          area: a.zoneKey, channel: 'both', status: 'sent', sentAt: d.getTime(), createdAt: d.getTime(),
          reach: estimateReach(a.zoneKey, d, true),
        }));
        addLog(`${{ crowd: '混雑', over: '収容超過', maint: '整備・休止' }[kind]}通知をAI自動送信：${a.name}（周辺${nearRadius()}mのゲスト）`, d);
      });
    });
    if (changed) store.set('autoSent', sent);
  }
  /* which AI notice kinds apply to a ride right now */
  function autoKinds(a, l) {
    if (l.closed) return ['maint'];
    if (l.nocam) return [];
    const k = [];
    if (l.people > l.cap) k.push('over');
    if (l.occ >= cfg(a).thBusy / 100) k.push('crowd');
    return k;
  }
  function autoMessage(a, l, kind, d) {
    const alt = alternatives(a, 1, d)[0];
    const tail = alt ? `近くの${alt.a.name}（待ち${alt.l.wait}分）はいかがですか。` : '';
    if (kind === 'maint') return { type: 'maint', title: `${a.name}は${l.label}です`, body: 'ただいまご利用いただけません。' + tail };
    if (kind === 'over') return { type: 'crowd', title: `${a.name}の待機列が定員を超えています`, body: `現在${l.people}人（定員${l.cap}人）。待ち時間は約${l.wait}分です。` + tail };
    return { type: 'crowd', title: `${a.name}が混雑しています`, body: `待ち時間は${l.wait}分です。` + tail };
  }

  /* ---------- AI route (今後90分のルート) ---------- */
  function aiRoute(totalMin) {
    totalMin = totalMin || 90;
    const t0 = simNow();
    const must = store.get('routeExtra', []);
    let pos = guestPos(), t = t0.getTime();
    const steps = [];
    const pool = openRides().filter(a => a.pin);
    // Always suggest 3 rides (when 3 are open): nearby + short waits score best, farther rides fill in when needed.
    // Predictions are clamped to 10 min before closing so late-day routes still get sensible waits.
    const lastSlot = atHour(t0, CLOSE_H - 10 / 60).getTime();
    for (let s = 0; s < 3; s++) {
      let best = null;
      pool.forEach(a => {
        if (steps.some(x => x.a.id === a.id)) return;
        const m = metres(pos, a.pin), walk = walkMin(m);
        const arrive = new Date(t + walk * 60e3);
        const w = predictWait(a, new Date(Math.max(t0.getTime(), Math.min(arrive.getTime(), lastSlot))));
        const score = w + walk * .8 - cfg(a).base * 18 - (must.includes(a.id) ? 200 : 0) + hash(a.id + s) * 2;
        if (!best || score < best.score) best = { a, walk, m, wait: w, arrive, score };
      });
      if (!best) break;
      const endAt = best.arrive.getTime() + (best.wait + cfg(best.a).cycle) * 60e3;
      best.overTime = endAt - t0.getTime() > totalMin * 60e3;
      best.afterClose = best.arrive.getTime() > atHour(t0, CLOSE_H).getTime();
      best.predicted = best.arrive.getTime() - t0.getTime() > 15 * 60e3;
      best.reason = routeReason(best, pos, s, t0);
      steps.push(best);
      pos = best.a.pin; t = endAt;
    }
    let saved = 0;
    steps.forEach(x => {
      const peak = Math.max.apply(null, attractionSeries(x.a, t0).vals);
      saved += Math.max(0, waitFromCount(x.a, Math.round(peak * cfg(x.a).cap)) - x.wait);
    });
    return { at: t0, steps, saved };
  }
  function routeReason(st, from, idx, t0) {
    const a = st.a, l = live(a, t0);
    if (st.afterClose) return `${a.zone}にあります。閉園（16:30）間際の到着になるため、早めの移動がおすすめです。`;
    const zoneRides = openRides().filter(x => x.zoneKey === a.zoneKey);
    const quietest = zoneRides.every(x => x === a || live(x, t0).occ >= l.occ);
    if (idx === 0 && quietest) return `${a.zone}で最も空いています。現在カメラは${l.people}/${l.cap}人を計測。`;
    if (st.predicted && st.wait < l.wait) return `${hhmm(st.arrive)}には待ち時間が${st.wait}分まで下がる見込み。` + (idx === 2 ? 'ルートの最後に。' : '');
    if (st.predicted) return `到着予定${hhmm(st.arrive)}。その時間帯も待ち${st.wait}分前後で安定する見込みです。`;
    let peakT = null, peakV = -1;
    for (let m = 60; m >= 0; m -= 5) {
      const d = new Date(t0.getTime() - m * 60e3), v = occAt(a, d, false);
      if (v > peakV) { peakV = v; peakT = d; }
    }
    const dir = a.pin.x > from.x + 6 ? '湖側へ向かう途中。' : a.pin.y < from.y - 8 ? 'モンテ方面へ向かう途中。' : '近くで、';
    if (peakT && t0 - peakT > 10 * 60e3) {
      const r = new Date(peakT); r.setMinutes(Math.floor(r.getMinutes() / 5) * 5);
      return `${dir}${hhmm(r)}から混雑が下がり続けています。`;
    }
    return `${dir}現在の待ち時間は${l.wait}分と短めです。`;
  }

  /* ---------- misc helpers ---------- */
  function heightLabel(a) {
    const h = a.heightLimit || {};
    if (h.label) return h.label;
    if (h.min && h.max) return `${h.min}〜${h.max}cm`;
    if (h.min) return `${h.min}cm以上`;
    if (h.max) return `${h.max}cm以下`;
    return '制限なし';
  }
  function ageLabel(a) {
    const g = a.ageLimit || {};
    if (g.label) return g.label;
    if (g.min != null && g.max != null) return `${g.min}〜${g.max}歳`;
    if (g.min != null) return `${g.min}歳から`;
    if (g.max != null) return `${g.max}歳以下`;
    return '年齢制限なし';
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => n == null ? '—' : Number(n).toLocaleString('ja-JP');

  /* style helpers shared by both apps (values from the design mockup) */
  const COLORS = {
    busy: { bg: '#ffe9e4', ink: '#a81d0c', fill: '#e5392b' },
    mid:  { bg: '#fff2d4', ink: '#8a5200', fill: '#f0a01a' },
    free: { bg: '#e4f7ec', ink: '#0d7a3c', fill: '#17a34a' },
    maint: { bg: '#ededf2', ink: 'rgba(22,24,29,.5)', fill: '#c2c2cd' },
    nocam: { bg: '#f3f3f7', ink: 'rgba(22,24,29,.45)', fill: '#d8d8e0' },
  };
  const pill = (key, label, small) => `<span class="pill${small ? ' sm' : ''} k-${key}">${esc(label)}</span>`;

  seed();

  window.PP = {
    DATA, ALL, ZONES, zoneByKey, FACILITIES, HOURS, LOCATION, COLORS,
    guestPos, setGuestPos, resetGuestPos, nearRadius, isNearGuest,
    rides, byId, cfg, throughput, defaults, SPEC,
    store, simNow, hhmm, dateLabel, atHour, hourOf, hash,
    live, measurable, waitCalc, LEVEL_LABEL, closedLabel, predictWait, waitFromCount, closedReason, openRides, occAt,
    SLOTS, attractionSeries, parkSeries, parkGuests, parkGuestsAt, zoneStats,
    metres, distanceTo, walkMin,
    cameras, camerasForRide, cameraCount, cameraCountAt, cameraSeries, deadCam, camPerf, queueShares, LOAD_HI, LOAD_LO, CAM_STATUS, CAM_MODELS, CAM_ROLES,
    NOTIF_TYPES, AREAS, areaName, CHANNELS, STATUS_LABEL, notifications, notifStatus, estimateReach, saveNotification, nextNoticeId, addLog,
    alternatives, autoSendCheck, aiRoute,
    heightLabel, ageLabel, esc, fmt, pill,
    onTick(fn, ms) { fn(); return setInterval(fn, ms || 5000); },
  };
})();
