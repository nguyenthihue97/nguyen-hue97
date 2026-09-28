/* ParuParu Park AI — guest app (layout & copy follow the "ParuParu Park AI v2 JP" mockup) */
(function () {
  'use strict';
  const P = window.PP;
  const { esc, store } = P;
  const $view = document.getElementById('view');
  const $tabbar = document.getElementById('tabbar');
  const $banner = document.getElementById('banner');
  const MAP_H = 1715 / 2400;

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    document.getElementById('toasts').appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }
  const levelPill = (l, small) => P.pill(l.level, l.label, small);

  /* ---------- inbox (admin notifications + local alerts) ---------- */
  /* AI notices about a specific ride (n.att) reach the guest only if that ride is near the guest's current position */
  const NEAR_TTL = 90 * 60e3;
  function inbox() {
    const now = P.simNow().getTime();
    const sent = P.notifications().filter(n => n.status === 'sent')
      .filter(n => !n.att || (P.isNearGuest(n.att) && now - n.sentAt < NEAR_TTL))
      .map(n => ({
        id: n.id, type: n.type, title: n.title, body: n.body, t: n.sentAt, area: n.area, push: n.channel !== 'app',
        att: n.att, dist: n.att ? P.distanceTo(P.byId(n.att)) : null,
      }));
    return sent.concat(store.get('guestInbox', [])).sort((a, b) => b.t - a.t);
  }
  const readSet = () => new Set(store.get('guestRead', []));
  const unreadCount = () => { const r = readSet(); return inbox().filter(n => !r.has(n.id)).length; };

  /* ---------- pins with light collision relaxation ---------- */
  let relaxed = { v: '', pts: [] };
  function relaxedPins() {
    const list = P.rides().filter(a => a.pin);
    const key = list.map(a => a.id).join();
    if (relaxed.v === key) return relaxed.pts;
    const W = 1000, H = W * MAP_H, MIN = 60;
    const pts = list.map(a => ({ a, x: a.pin.x * 10, y: a.pin.y / 100 * H }));
    for (let it = 0; it < 80; it++) {
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const p = pts[i], q = pts[j];
        let dx = q.x - p.x, dy = q.y - p.y; const d = Math.hypot(dx, dy) || .01;
        if (d < MIN) { const push = (MIN - d) / 2; dx /= d; dy /= d; p.x -= dx * push; p.y -= dy * push; q.x += dx * push; q.y += dy * push; }
      }
      pts.forEach(p => { p.x = Math.max(18, Math.min(W - 18, p.x)); p.y = Math.max(18, Math.min(H - 18, p.y)); });
    }
    relaxed = { v: key, pts: pts.map(p => ({ a: p.a, x: p.x / 10, y: p.y / H * 100 })) };
    return relaxed.pts;
  }

  /* ---------- shared pieces ---------- */
  function appbar() {
    return `<header class="appbar">
      <img src="assets/logo.svg" alt="浜名湖パルパル">
      <div class="acts">
        <button class="rbtn" data-go="#/news" aria-label="お知らせ">${icon('tbell', 17)}${unreadCount() ? '<span class="dot"></span>' : ''}</button>
        <button class="avatar" data-toast="ログイン中：HN" aria-label="マイページ">HN</button>
      </div>
    </header>`;
  }
  function row(a, l, m) {
    const off = l.closed;
    const meta = [a.zone, m != null ? m + 'm' : null, l.closed || l.nocam ? null : l.people + ' 人'].filter(Boolean).join('・');
    const showWait = !l.closed && !l.nocam;
    return `<button class="rrow ${off ? 'dim' : ''}" ${off ? 'disabled' : `data-go="#/a/${a.id}"`}>
      <div class="rthumb" style="${a.image ? `background-image:url('${a.image}')` : ''}">${a.number ? `<span class="no f-${l.level}">${a.number}</span>` : ''}</div>
      <div class="bd"><div class="nm">${esc(a.name)}</div><div class="mt">${esc(meta)}</div><div class="pw">${levelPill(l, true)}</div></div>
      <div class="wt"><div>${showWait ? `<b>${l.wait} 分</b><small>待ち</small>` : ''}</div>
        <svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="rgba(22,24,29,.1)" stroke-width="2"><path d="M1 1l6 6-6 6"/></svg></div>
    </button>`;
  }
  function bars(vals, current, height, gap) {
    const max = Math.max.apply(null, vals) || 1;
    return `<div class="bars" style="height:${height}px;gap:${gap}px">${vals.map((v, i) => {
      const h = Math.max(6, Math.round(v / max * 100));
      return `<div><i class="${i === current ? 'now' : h >= 90 ? 'hi' : ''}" style="height:${h}%"></i></div>`;
    }).join('')}</div>
    <div class="bars-x"><span>10:00</span><span>11:30</span><span>13:00</span><span>14:30</span><span>16:30</span></div>`;
  }

  /* ---------- マップ ---------- */
  function mapView() {
    const now = P.simNow();
    const pins = relaxedPins().map(p => {
      const l = P.live(p.a, now);
      if (l.closed) return '';
      return `<button class="mpin f-${l.level}" style="left:${p.x}%;top:${p.y}%" data-go="#/a/${p.a.id}" title="${esc(p.a.name)}">${p.a.number || ''}</button>`;
    }).join('');
    const near = P.rides().filter(a => a.pin).map(a => ({ a, l: P.live(a, now), m: P.distanceTo(a) }))
      .filter(x => !x.l.closed && !x.l.nocam).sort((x, y) => x.m - y.m).slice(0, 3);
    return appbar() + `
      <div class="gmap">
        <div class="mapbox" role="img" aria-label="パルパル園内マップ">
          ${pins}
          <div class="here" style="left:${P.guestPos().x}%;top:${P.guestPos().y}%">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="#00a5e3" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6" fill="#fff" stroke="none"/></svg>
            <span>現在地</span>
          </div>
        </div>
        <div class="legend">
          <div><span class="f-busy"></span>混雑</div><div><span class="f-mid"></span>やや混雑</div><div><span class="f-free"></span>空き</div>
        </div>
      </div>
      <div class="sec-h"><b>現在地から近い</b><button data-go="#/list">すべて表示 →</button></div>
      ${near.map(x => row(x.a, x.l, x.m)).join('')}`;
  }

  /* ---------- アトラクション ---------- */
  const listState = { filter: 'すべて', q: '', count: 5 };
  const FILTERS = ['待ち時間が短い順', '近い順', 'エントランスゾーン', 'レイクサイドゾーン', 'モンテゾーン'];
  function listRows() {
    const now = P.simNow();
    let rows = P.rides().map(a => ({ a, l: P.live(a, now), m: P.distanceTo(a) }));
    const dead = x => x.l.closed || x.l.nocam ? 1 : 0;
    const f = listState.filter;
    if (f === '待ち時間が短い順') rows.sort((x, y) => dead(x) - dead(y) || x.l.wait - y.l.wait);
    else if (f === '近い順') rows.sort((x, y) => (x.m == null ? 1e9 : x.m) - (y.m == null ? 1e9 : y.m));
    else {
      // default order: 空き → やや混雑 → 混雑 → 整備・休止 (then no camera); shorter wait first within a level
      const LV = { free: 0, mid: 1, busy: 2, maint: 3, nocam: 4 };
      rows.sort((x, y) => LV[x.l.level] - LV[y.l.level] || x.l.wait - y.l.wait);
      if (f !== 'すべて') rows = rows.filter(x => x.a.zone === f);
    }
    const q = listState.q.trim().toLowerCase();
    if (q) rows = rows.filter(x => (x.a.name + x.a.zone + (x.a.number || '')).toLowerCase().includes(q));
    return rows;
  }
  function listView() {
    const rows = listRows();
    const shown = rows.slice(0, listState.count);
    return appbar() + `
      <div class="lhead">
        <div class="h23">アトラクション</div>
        <label class="search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(22,24,29,.52)" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input id="lq" type="search" placeholder="アトラクションまたはエリアを検索…" value="${esc(listState.q)}" autocomplete="off">
        </label>
        <div class="chips">${FILTERS.map(f => `<button class="chip ${listState.filter === f ? 'on' : ''}" data-filter="${f}">${f}</button>`).join('')}</div>
      </div>
      <div class="gap14"></div>
      ${shown.map(x => row(x.a, x.l, x.m)).join('') || '<div class="empty">条件に一致するアトラクションはありません。</div>'}
      ${rows.length > shown.length ? `<div class="loader" id="sentinel"><i></i>他 ${rows.length - shown.length} 件を読み込み中…</div>` : ''}`;
  }
  let io = null;
  function watchSentinel() {
    if (io) io.disconnect();
    const s = document.getElementById('sentinel');
    if (!s || !('IntersectionObserver' in window)) return;
    io = new IntersectionObserver(es => {
      if (es.some(e => e.isIntersecting)) { io.disconnect(); listState.count += 5; setTimeout(() => render(true), 250); }
    }, { root: $view, rootMargin: '200px' });
    io.observe(s);
  }

  /* ---------- 詳細 ---------- */
  function walkLegs(d) {
    const l1 = Math.min(120, Math.max(40, Math.round(d * .3))), l3 = Math.max(0, d - l1);
    const m1 = Math.max(1, Math.round(l1 / 70)), m3 = Math.max(1, Math.round(l3 / 70));
    return { l1, l3, m1, m3, total: m1 + m3 };
  }
  function detailView(id) {
    const a = P.byId(id);
    if (!a || !a.cfg) return notFound();
    const now = P.simNow();
    const l = P.live(a, now), m = P.distanceTo(a), c = a.cfg;
    const s = P.attractionSeries(a, now);
    const favs = store.get('favs', []);
    const t = a.tags || [];
    const tags = [['フリーパス', 1]];
    if (t.includes('雨でもOK')) tags.push(['雨天可']);
    if (t.includes('同伴必要')) tags.push(['付き添い必要']);
    if (t.includes('わんちゃんといっしょに')) tags.push(['ペット同伴可']);
    const price = a.price == null ? '—' : a.price === 0 ? '無料' : '¥' + P.fmt(a.price);
    const off = l.closed || l.nocam;

    let advice, alts = [];
    if (off) {
      alts = P.alternatives(a, 2, now);
      const alt = alts[0];
      advice = `このアトラクションは${l.closed ? l.label : '計測準備中'}です。` + (alt ? `おすすめ：${alt.a.name}（${alt.m}m先・待ち${alt.l.wait}分）` : '');
    } else if (l.level === 'busy') {
      alts = P.alternatives(a, 2, now);
      const avg = s.vals.reduce((x, y) => x + y, 0) / s.vals.length || 1;
      const pct = Math.max(10, Math.round((l.occ / avg - 1) * 100 / 5) * 5);
      let best = null;
      for (let i = s.current + 1; i < P.SLOTS; i++) {
        const tt = P.roundMin(P.atHour(now, 10 + (i + .5) * 6.5 / P.SLOTS), 15);
        const w = P.predictWait(a, tt);
        if (!best || w < best.w) best = { t: tt, w };
      }
      advice = `通常より${pct}%混雑しています。` + (best ? `${P.hhmm(best.t)}に戻れば、待ち時間はおよそ${Math.max(5, best.w)} 分。` : '');
    } else {
      const upto = Math.min(P.SLOTS - 1, s.current + 3);
      let best = s.current;
      for (let i = s.current; i <= upto; i++) if (s.vals[i] < s.vals[best]) best = i;
      if (best === s.current) advice = '今後2時間で最も空く時間帯です。今のうちに。';
      else {
        const tt = P.roundMin(P.atHour(now, 10 + (best + .5) * 6.5 / P.SLOTS), 5);
        advice = `${P.hhmm(tt)}ごろが最も空く見込みです（待ち約${P.predictWait(a, tt)}分）。`;
      }
    }
    const walk = m != null ? walkLegs(m).total : 0;
    return `<div class="scroll">
      <div class="hero" style="${a.image ? `background-image:url('${a.image}')` : ''}">
        <button class="back" data-back aria-label="戻る"><svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 19l-7-7 7-7"/></svg></button>
      </div>
      <div class="dsheet">
        <div class="dhead">${a.number ? `<span class="no">${a.number}</span>` : ''}<span class="lab">Attraction</span>${levelPill(l)}</div>
        <div class="dtitle">${esc(a.name)}</div>
        <div class="dprice"><b>${price}</b><span>（1回・フリーパス利用可）</span></div>
        <div class="ddesc">${esc(c.desc || a.catchcopy || '')}</div>
        <div class="tags">${tags.map(x => `<span class="tag ${x[1] ? 'acc' : ''}">${x[0]}</span>`).join('')}</div>
        <div class="specs">
          <div class="spec"><small>身長制限</small><b>${esc(P.heightLabel(a))}</b></div>
          <div class="spec"><small>対象年齢</small><b>${esc(P.ageLabel(a))}</b></div>
          <div class="spec"><small>1回あたりの定員</small><b>${c.seats} 人</b></div>
        </div>
        <div class="dmeta">${esc([a.zone, m != null ? m + 'm' : null, off ? null : l.people + ' 人'].filter(Boolean).join('・'))}</div>
      </div>
      <div class="dstats">
        <div><div class="eyebrow">${off ? '状態' : '待ち時間'}</div>${off ? `<b class="txt">${esc(l.label)}</b>` : `<b>${l.wait}<span>分</span></b>`}</div>
        <div><div class="eyebrow">待機中</div><b>${off ? 0 : l.people}<span>/${l.cap}</span></b></div>
      </div>
      <div class="dbody">
        <div class="eyebrow" style="margin-bottom:10px">時間帯別の混雑度</div>
        ${bars(s.vals, off ? -1 : s.current, 92, 4)}
        <div class="aibox"><div class="eyebrow">AIからの提案</div><p>${esc(advice)}</p>
          ${alts.map(x => `<button class="alt" data-go="#/a/${x.a.id}"><i style="background-image:url('${x.a.image}')"></i>
            <div>${esc(x.a.name)}<small>待ち${x.l.wait}分・${x.l.label}・徒歩${walkLegs(x.m).total}分</small></div><em>見る →</em></button>`).join('')}
        </div>
        <div class="facts">
          <div class="fact"><span>雨天可</span><b>${t.includes('雨でもOK') ? 'あり' : 'なし'}</b></div>
          <div class="fact"><span>営業時間</span><b>${esc(c.hours)}</b></div>
          ${a.disclaimer ? `<div class="fact stack"><span>ご利用上の注意</span><b>${esc(a.disclaimer)}</b></div>` : ''}
          ${a.priceNotes ? `<div class="fact stack"><span>料金について</span><b>${esc(a.priceNotes)}</b></div>` : ''}
        </div>
        ${a.sourceUrl ? `<a class="srclink" href="${a.sourceUrl}" target="_blank" rel="noopener">公式サイトで見る ${icon('external', 13)}</a>` : ''}
      </div>
    </div>
    <div class="dbar">
      ${a.pin ? `<button class="navbtn" data-go="#/route/${a.id}">経路案内・${walk} 分（徒歩）</button>` : '<button class="navbtn off" disabled>マップ上の位置が未設定です</button>'}
      <button class="heart ${favs.includes(a.id) ? 'on' : ''}" data-fav="${a.id}" aria-label="お気に入り">♥</button>
    </div>`;
  }

  /* ---------- AI提案 ---------- */
  let routeCache = null;
  function aiView() {
    const extra = store.get('routeExtra', []);
    const key = extra.join(',');
    const now = P.simNow();
    if (!routeCache || routeCache.key !== key || now - routeCache.r.at > 2 * 60e3) routeCache = { key, r: P.aiRoute(90) };
    const r = routeCache.r;
    const names = extra.map(id => P.byId(id) && P.byId(id).name).filter(Boolean);
    return appbar() + `
      <div class="aihead">
        <div class="ey">AIアシスタント</div>
        <div class="h23">今後90分のルート</div>
        <p>${P.hhmm(r.at)}時点のカメラ計測に基づく試算・短縮 ~${r.saved} 分待ち</p>
      </div>
      ${names.length ? `<div class="note"><span>追加した行き先：${esc(names.join('、'))}</span><button data-clear-extra>解除</button></div>` : ''}
      ${r.steps.map((s, i) => `
        <button class="sug" data-go="#/a/${s.a.id}">
          <div class="rail"><b>${i + 1}</b><i></i></div>
          <div class="bd"><div class="nm">${esc(s.a.name)}</div><div class="why">${esc(s.reason)}</div>
            <div class="cs"><span>待ち ${s.wait} 分${s.predicted ? '（予測）' : ''}</span><span>徒歩 ${s.walk} 分</span></div></div>
        </button>`).join('') || '<div class="empty">現在ご案内できるルートがありません</div>'}
      ${r.steps.length ? '<div class="cta"><button data-start-route>このルートを開始</button></div>' : ''}`;
  }

  /* ---------- お知らせ ---------- */
  function newsView() {
    const r = readSet();
    const items = inbox();
    const unread = items.filter(n => !r.has(n.id)).length;
    const watches = store.get('watches', {});
    const html = appbar() + `
      <div class="ahead"><div class="h23">お知らせ</div><span>${unread} 新規</span></div>
      <div class="nearnote">${icon('tmap', 15)}<span>現在地（${esc(P.guestPos().name === '現在地' ? '入口付近' : P.guestPos().name + '付近')}）から<b>半径${P.nearRadius()}m</b>以内のアトラクションのAI通知を表示しています</span>
        ${store.get('guestPos', null) ? '<button data-resetpos>入口に戻す</button>' : ''}</div>
      <div class="gap14"></div>
      ${Object.keys(watches).filter(id => P.byId(id)).map(id => `<div class="watch">${icon('clock2', 15)}<span>${esc(P.byId(id).name)}：待ち時間が減ったら通知します</span><button data-unwatch="${id}" aria-label="解除">${icon('x', 15)}</button></div>`).join('')}
      ${items.map(n => {
        const kind = n.type === 'watch' ? '空き' : (P.NOTIF_TYPES[n.type] || { label: 'お知らせ' }).label;
        return `<div class="acard ${n.type === 'crowd' ? 'hot' : ''} ${n.att ? 'tap' : ''}" ${n.att ? `data-go="#/a/${n.att}"` : ''}>
          <div class="top"><div class="kind">${kind}${n.att ? `<em class="near">AI・${n.dist}m先</em>` : ''}</div><time>${P.hhmm(new Date(n.t))}</time></div>
          <h3>${esc(n.title)}</h3><p>${esc(n.body)}</p>${r.has(n.id) ? '' : '<span class="new"></span>'}
        </div>`;
      }).join('') || '<div class="empty">お知らせはまだありません</div>'}`;
    setTimeout(() => { if (route().name === 'news') store.set('guestRead', items.map(n => n.id)); }, 1500);
    return html;
  }

  /* ---------- 経路案内 ---------- */
  const rs = { id: null, opt: 0, swap: false, zoom: false, avoid: true, pop: false, anim: 0 };
  function geom(a) {
    const act = store.get('activeRoute', null);
    let from = P.guestPos(), fromName = '現在地';
    if (act && act.ids[act.idx] === a.id && act.idx > 0) {
      const prev = P.byId(act.ids[act.idx - 1]);
      if (prev && prev.pin) { from = prev.pin; fromName = prev.name; }
    }
    let p0 = { x: from.x, y: from.y }, p2 = { x: a.pin.x, y: a.pin.y };
    if (rs.swap) { const tmp = p0; p0 = p2; p2 = tmp; }
    const k = [.14, .34, -.3][rs.opt];
    const dx = p2.x - p0.x, dy = (p2.y - p0.y) * MAP_H;
    const mid = { x: (p0.x + p2.x) / 2 - dy * k, y: (p0.y + p2.y) / 2 + dx * k / MAP_H };
    const straight = P.metres(from, a.pin);
    const legs = walkLegs(straight);
    return { p0, mid, p2, d: straight + [0, 210, 280][rs.opt], legs, mins: legs.total + [0, 3, 4][rs.opt], base: legs.total, from, fromName };
  }
  function lerpPath(g, t) {
    const [a, b, k] = t < .5 ? [g.p0, g.mid, t * 2] : [g.mid, g.p2, (t - .5) * 2];
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  }
  function crowdOnPath(g, destId) {
    const now = P.simNow();
    let best = null;
    P.rides().forEach(x => {
      if (!x.pin || x.id === destId) return;
      if (P.live(x, now).level !== 'busy') return;
      let dmin = 1e9;
      for (let i = 0; i <= 20; i++) { const q = lerpPath(g, i / 20); dmin = Math.min(dmin, Math.hypot(q.x - x.pin.x, (q.y - x.pin.y) * MAP_H)); }
      if (dmin < 12 && (!best || dmin < best.d)) best = { a: x, d: dmin };
    });
    return best;
  }
  function nearestCam(pt) {
    let best = null;
    P.cameras().forEach(c => {
      const v = c.covers.find(x => x.att), a = v && P.byId(v.att);
      if (!a || !a.pin || P.deadCam(c)) return;
      const d = Math.hypot(a.pin.x - pt.x, a.pin.y - pt.y);
      if (!best || d < best.d) best = { c, d };
    });
    return best ? best.c.code : 'CAM-17';
  }
  function routeView(id) {
    const a = P.byId(id);
    if (!a || !a.pin) return notFound();
    if (rs.id !== id) Object.assign(rs, { id, opt: 0, swap: false, zoom: false, pop: false });
    const now = P.simNow();
    const g = geom(a), l = P.live(a, now);
    const eta = P.hhmm(new Date(now.getTime() + g.mins * 60e3));
    const dest = g.p2, start = g.p0;
    const hot = crowdOnPath(g, a.id);
    let tip;
    if (l.closed) tip = `このアトラクションは${l.label}です。経路は表示しますが、別のアトラクションをおすすめします。`;
    else if (rs.opt === 1) tip = 'カメラが確認：混雑している通路をすべて避けたルートです。';
    else if (rs.opt === 2) tip = '屋根のある通路を優先したルートです。雨の日におすすめです。';
    else if (rs.avoid && hot) tip = `カメラが確認：${hot.a.name}が混雑しているため、その前の通路を避けたルートです。`;
    else tip = 'このルートの通路は空いています。';
    const desc = [
      `到着予定 ${eta}・最短ルート。` + (rs.avoid ? '通路が空いていることをカメラが確認しています' : '混雑状況を考慮せずに計算しています'),
      `到着予定 ${eta}・混雑を避けるルート。人の少ない通路を優先しています`,
      `到着予定 ${eta}・屋根ありルート。雨にぬれにくい通路を優先しています`,
    ][rs.opt];
    const cross = (g.mid.x - start.x) * (dest.y - g.mid.y) - (g.mid.y - start.y) * (dest.x - g.mid.x);
    const zoneShort = a.zone.replace('ゾーン', '');
    const steps = [
      { t: `${rs.swap ? a.name : g.fromName}からメイン通路を進みます：${rs.swap ? 'エントランス' : zoneShort}`, m: `${g.legs.l1} m・${g.legs.m1} 分`, ic: 'sup' },
      { t: `中央広場で${cross > 0 ? '右' : '左'}へ`, m: `飲食エリアを通過・カメラ ${nearestCam(g.mid)}`, ic: cross > 0 ? 'sright' : 'sleft' },
      { t: `次のエリアゲートまで進みます：${rs.swap ? 'エントランス' : zoneShort}`, m: `${g.legs.l3 + [0, 210, 280][rs.opt]} m・${g.legs.m3 + [0, 3, 4][rs.opt]} 分`, ic: 'sup' },
      { t: `到着：${rs.swap ? '現在地' : a.name}`, m: rs.swap ? 'メインゲート付近' : l.closed ? l.label : '待機列は入口の左手です', ic: 'scheck' },
    ];
    const watches = store.get('watches', {});
    const extra = store.get('routeExtra', []);
    const act = store.get('activeRoute', null);
    const inAct = act && act.ids[act.idx] === a.id;
    const topName = rs.swap ? a.name : g.fromName, destName = rs.swap ? '現在地' : a.name;
    const pts = [g.p0, g.mid, g.p2].map(p => `${p.x},${p.y * MAP_H}`).join(' ');
    const bub = lerpPath(g, .5);
    return `<div class="nav">
      <div class="nmap">
        <div class="mapbox ${rs.zoom ? 'zoom' : ''}" style="--ox:${dest.x}%;--oy:${dest.y}%" role="img" aria-label="ルートマップ">
          <svg class="route" viewBox="0 0 100 ${(MAP_H * 100).toFixed(3)}" preserveAspectRatio="none">
            <polyline points="${pts}" fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" style="stroke-width:8px"/>
            <polyline points="${pts}" fill="none" stroke="#00a5e3" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" style="stroke-width:4px"/>
          </svg>
          <div class="start" style="left:${start.x}%;top:${start.y}%"><svg width="18" height="18" viewBox="0 0 24 24" fill="#16181d" stroke="#fff" stroke-width="2.4"><circle cx="12" cy="12" r="9"/></svg></div>
          <div class="dest" style="left:${dest.x}%;top:${dest.y}%">${rs.swap ? '' : a.number || ''}</div>
          <div class="dlabel" style="left:${dest.x}%;top:${dest.y}%">${esc(destName)}</div>
          <div class="bubble" style="left:${bub.x}%;top:${bub.y}%">${g.mins} 分</div>
          <div class="walker" id="walker" style="display:none"></div>
        </div>
      </div>
      <div class="odcard">
        <button class="ib" data-back aria-label="戻る"><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#16181d" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 19l-7-7 7-7"/></svg></button>
        <div class="pts">
          <div class="pt"><span class="d1"></span><span class="t1">${esc(topName)}</span></div>
          <div class="sep"></div>
          <div class="pt"><svg width="13" height="13" viewBox="0 0 24 24" fill="#e5392b" style="flex:none"><path d="M12 22s7-6.3 7-11.4A7 7 0 1 0 5 10.6C5 15.7 12 22 12 22Z"/></svg><span class="t2">${esc(destName)}</span></div>
        </div>
        <button class="ib sm" data-rs="swap" aria-label="入れ替え" style="color:rgba(22,24,29,.6)">${icon('mswap', 17)}</button>
      </div>
      <div class="mctrls">
        <button data-rs="locate" aria-label="現在地">${icon('mlocate', 17)}</button>
        <button data-rs="zoom" aria-label="${rs.zoom ? '縮小' : '拡大'}">${icon(rs.zoom ? 'minus' : 'plus', 17)}</button>
      </div>
      <div class="nsheet">
        <div class="handle"><span></span></div>
        <div class="nsh"><b>徒歩</b>
          <button class="${rs.pop ? 'on' : ''}" data-rs="pop" aria-label="ルートの選択">${icon('msliders', 17)}</button>
          <button data-rs="share" aria-label="共有">${icon('mshare', 17)}</button>
          <button data-back aria-label="閉じる">${icon('x', 17, '', 2.2)}</button>
        </div>
        ${rs.pop ? `<div class="pop"><label><input type="checkbox" data-avoid ${rs.avoid ? 'checked' : ''}>混雑した通路を避ける</label></div>` : ''}
        <div class="ropts">${[['rwalk', 0], ['ravoid', 3], ['rroof', 4]].map(([ic, plus], i) =>
          `<button class="ropt ${rs.opt === i ? 'on' : ''}" data-opt="${i}">${icon(ic, 16)}<span>${g.base + plus} 分</span></button>`).join('')}</div>
        <div class="rinfo">
          <div class="big">${g.mins} 分</div>
          <p>${desc}</p>
          <div class="dist">${g.d}m・${['平坦な通路', 'ゆるやかな坂あり', '屋根付き通路'][rs.opt]}</div>
        </div>
        <div class="racts">
          <button class="primary" data-rs="go"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M3 11 21 3l-8 18-2-7-8-3Z"/></svg>開始</button>
          <button class="${watches[a.id] ? 'on' : ''}" data-watch="${a.id}">${icon('clock2', 15)}${watches[a.id] ? '通知を設定済み' : '待ち時間が減ったら通知'}</button>
          <button class="${extra.includes(a.id) ? 'on' : ''}" data-extra="${a.id}">${icon(extra.includes(a.id) ? 'check' : 'plus', 15)}${extra.includes(a.id) ? '追加済み' : '追加'}</button>
        </div>
        ${inAct ? `<div class="progress"><span>AIルート ${act.idx + 1}/${act.ids.length}</span>${act.idx + 1 < act.ids.length
          ? `<button data-next>次へ：${esc(P.byId(act.ids[act.idx + 1]).name)}</button>` : '<button data-end-route>ルートを終了</button>'}</div>` : ''}
        <div class="tip"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a81d0c" stroke-width="2" stroke-linecap="round" style="flex:none;margin-top:2px"><path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3ZM12 9v4M12 17h.01"/></svg><div>${esc(tip)}</div></div>
        ${steps.map((s, i) => `<div class="nstep"><div class="ico ${i === steps.length - 1 ? 'last' : ''}">${icon(s.ic, 16, '', 2.2)}</div>
          <div><div class="t">${esc(s.t)}</div><div class="m">${esc(s.m)}</div></div></div>`).join('')}
      </div>
    </div>`;
  }
  function animateWalk(a) {
    const g = geom(a), w = document.getElementById('walker');
    if (!w) return;
    w.style.display = 'block';
    const t0 = performance.now(), dur = 4200, swap = rs.swap;
    cancelAnimationFrame(rs.anim); clearTimeout(rs.walkDone);
    let done = false;
    const finish = () => {                 // runs once, even if rAF is paused (background tab)
      if (done) return;
      done = true; cancelAnimationFrame(rs.anim); clearTimeout(rs.walkDone); rs.anim = 0;
      if (swap) { P.resetGuestPos(); toast('入口付近に戻りました'); }
      else { P.setGuestPos(a.pin, a.name); toast(`${a.name}に到着しました・現在地を更新`); }
    };
    const step = t => {
      const k = Math.min(1, (t - t0) / dur), p = lerpPath(g, k);
      w.style.left = p.x + '%'; w.style.top = p.y + '%';
      if (k < 1) rs.anim = requestAnimationFrame(step); else finish();
    };
    rs.anim = requestAnimationFrame(step);
    rs.walkDone = setTimeout(finish, dur + 150);
  }

  const notFound = () => appbar() + '<div class="empty">ページが見つかりません</div>';

  /* ---------- routing ---------- */
  function route() {
    const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
    return { name: name || 'map', arg };
  }
  const TABS = [['map', 'tmap', 'マップ'], ['list', 'tlist', 'アトラクション'], ['ai', 'tai', 'AI提案'], ['news', 'tbell', 'お知らせ']];
  function render(keepScroll) {
    const r = route();
    const sc = $view.querySelector('.scroll') || $view;
    const top = sc.scrollTop;
    const chipsX = ($view.querySelector('.chips') || {}).scrollLeft || 0;
    const fn ={ map: mapView, list: listView, a: () => detailView(r.arg), ai: aiView, news: newsView, route: () => routeView(r.arg) }[r.name] || notFound;
    const html = fn();
    $view.className = 'view' + (r.name === 'a' || r.name === 'route' ? ' split' : '');
    $view.innerHTML = html;
    const active = r.name === 'a' ? 'list' : r.name;
    $tabbar.style.display = r.name === 'route' ? 'none' : '';
    document.querySelector('.phone').classList.toggle('no-tabs', r.name === 'route');
    $tabbar.innerHTML = TABS.map(([k, ic, label]) => `<a class="tab ${active === k ? 'on' : ''}" href="#/${k}">${icon(ic, 21)}<span>${label}</span></a>`).join('');
    if (keepScroll) (($view.querySelector('.scroll')) || $view).scrollTop = top;
    const chips = $view.querySelector('.chips');
    if (chips) { if (keepScroll) chips.scrollLeft = chipsX; chipEdges(chips); }
    if (r.name === 'list') watchSentinel();
    document.getElementById('clock').textContent = P.hhmm(P.simNow()).replace(/^0/, '');
  }
  /* ---------- horizontal chip row: mouse drag, wheel, edge fades (touch scrolls natively) ---------- */
  function chipEdges(el) {
    const max = el.scrollWidth - el.clientWidth;
    el.classList.toggle('fade-l', el.scrollLeft > 4);
    el.classList.toggle('fade-r', el.scrollLeft < max - 4);
  }
  let chipDrag = null;
  $view.addEventListener('pointerdown', e => {
    const el = e.target.closest('.chips');
    if (!el || e.pointerType !== 'mouse' || e.button !== 0) return;
    chipDrag = { el, x: e.clientX, left: el.scrollLeft, moved: false, id: e.pointerId };
  });
  window.addEventListener('pointermove', e => {
    if (!chipDrag || e.pointerId !== chipDrag.id) return;
    const dx = e.clientX - chipDrag.x;
    if (!chipDrag.moved && Math.abs(dx) < 5) return;
    if (!chipDrag.moved) { chipDrag.moved = true; chipDrag.el.classList.add('dragging'); try { chipDrag.el.setPointerCapture(e.pointerId); } catch (_) { /* synthetic / released pointer */ } }
    chipDrag.el.scrollLeft = chipDrag.left - dx;
  });
  window.addEventListener('pointerup', e => {
    if (!chipDrag || e.pointerId !== chipDrag.id) return;
    const d = chipDrag; chipDrag = null;
    d.el.classList.remove('dragging');
    if (d.moved) {       // swallow the click that follows a drag so no chip gets toggled
      const stop = ev => { ev.stopPropagation(); ev.preventDefault(); };
      window.addEventListener('click', stop, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', stop, true), 0);
    }
  });
  $view.addEventListener('wheel', e => {
    const el = e.target.closest('.chips');
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    const max = el.scrollWidth - el.clientWidth;
    if ((delta < 0 && el.scrollLeft <= 0) || (delta > 0 && el.scrollLeft >= max)) return;   // let the page scroll at the ends
    e.preventDefault();
    el.scrollLeft += delta;
  }, { passive: false });
  $view.addEventListener('scroll', e => { if (e.target.classList && e.target.classList.contains('chips')) chipEdges(e.target); }, true);
  $view.addEventListener('click', e => {       // bring the tapped chip fully into view
    const c = e.target.closest('.chips .chip');
    if (c) setTimeout(() => { const n = $view.querySelector(`.chip[data-filter="${c.dataset.filter}"]`); if (n) n.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' }); }, 0);
  });

  window.addEventListener('hashchange', () => {
    cancelAnimationFrame(rs.anim); clearTimeout(rs.walkDone); rs.anim = 0;
    if (route().name !== 'list') listState.count = 5;
    render(false); $view.scrollTop = 0;
  });

  /* ---------- interactions ---------- */
  $view.addEventListener('input', e => {
    if (e.target.id !== 'lq') return;
    listState.q = e.target.value; listState.count = 5;
    const pos = e.target.selectionStart;
    render(true);
    const q = document.getElementById('lq');
    if (q) { q.focus(); q.setSelectionRange(pos, pos); }
  });
  $view.addEventListener('change', e => {
    if ('avoid' in e.target.dataset) { rs.avoid = e.target.checked; render(true); }
  });
  $view.addEventListener('click', e => {
    const el = e.target.closest('[data-go],[data-back],[data-filter],[data-fav],[data-start-route],[data-clear-extra],[data-unwatch],[data-rs],[data-opt],[data-watch],[data-extra],[data-next],[data-end-route],[data-toast],[data-resetpos]');
    if (!el) return;
    const d = el.dataset;
    if (d.go) { location.hash = d.go; return; }
    if ('back' in d) { if (history.length > 1) history.back(); else location.hash = '#/map'; return; }
    if (d.toast) { toast(d.toast); return; }
    if ('resetpos' in d) { P.resetGuestPos(); toast('現在地を入口付近に戻しました'); return; }
    if (d.filter) { listState.filter = listState.filter === d.filter ? 'すべて' : d.filter; listState.count = 5; render(true); return; }
    if (d.fav) {
      const on = store.update('favs', [], f => f.includes(d.fav) ? f.filter(x => x !== d.fav) : f.concat(d.fav)).includes(d.fav);
      toast(on ? 'お気に入りに追加しました' : 'お気に入りから外しました'); return;
    }
    if ('startRoute' in d) {
      const r = routeCache && routeCache.r;
      if (!r || !r.steps.length) return;
      store.set('activeRoute', { ids: r.steps.map(s => s.a.id), idx: 0 });
      location.hash = '#/route/' + r.steps[0].a.id; return;
    }
    if ('clearExtra' in d) { store.set('routeExtra', []); routeCache = null; return; }
    if (d.unwatch) { store.update('watches', {}, w => { delete w[d.unwatch]; return w; }); return; }
    if (d.opt) { rs.opt = +d.opt; render(true); return; }
    if (d.rs) {
      const a = P.byId(rs.id);
      if (d.rs === 'swap') rs.swap = !rs.swap;
      if (d.rs === 'zoom') rs.zoom = !rs.zoom;
      if (d.rs === 'locate') { rs.zoom = false; rs.swap = false; }
      if (d.rs === 'pop') rs.pop = !rs.pop;
      if (d.rs === 'share') {
        const text = `${a.name}までの経路（徒歩${geom(a).mins}分）`;
        if (navigator.share) navigator.share({ title: '浜名湖パルパル', text, url: location.href }).catch(() => {});
        else if (navigator.clipboard) navigator.clipboard.writeText(text + ' ' + location.href).then(() => toast('リンクをコピーしました'), () => toast(text));
        else toast(text);
        return;
      }
      if (d.rs === 'go') { animateWalk(a); return; }
      render(true); return;
    }
    if (d.watch) {
      const on = store.update('watches', {}, w => {
        if (w[d.watch]) delete w[d.watch]; else w[d.watch] = { start: P.live(P.byId(d.watch)).wait, at: Date.now() };
        return w;
      })[d.watch];
      toast(on ? '待ち時間が減ったらお知らせします' : '通知を解除しました'); return;
    }
    if (d.extra) {
      const on = store.update('routeExtra', [], x => x.includes(d.extra) ? x.filter(i => i !== d.extra) : x.concat(d.extra)).includes(d.extra);
      routeCache = null;
      toast(on ? 'AI提案ルートに追加しました' : 'ルートから外しました'); return;
    }
    if ('next' in d) { const act = store.update('activeRoute', null, v => (v.idx++, v)); location.hash = '#/route/' + act.ids[act.idx]; return; }
    if ('endRoute' in d) { store.set('activeRoute', null); toast('ルートを終了しました'); location.hash = '#/ai'; }
  });

  /* ---------- push banner & watches ---------- */
  const shown = new Set();
  let bannerSeen = P.simNow().getTime();
  function checkBanner() {
    const items = inbox().filter(n => n.push !== false && n.t > bannerSeen && !shown.has(n.id));
    if (!items.length) return;
    const n = items[0];
    items.forEach(x => shown.add(x.id));
    bannerSeen = Math.max(bannerSeen, n.t);
    $banner.innerHTML = `<div class="bh"><i>${icon('tbell', 12, '', 2.4)}</i>浜名湖パルパル<time>たった今</time></div><h4>${esc(n.title)}</h4><p>${esc(n.body)}</p>`;
    $banner.classList.add('show');
    clearTimeout(checkBanner.t);
    checkBanner.t = setTimeout(hideBanner, 6000);
  }
  /* banner: tap → お知らせ, swipe up → dismiss (follows the finger, snaps back if not far enough) */
  let bDrag = null;
  const hideBanner = () => { clearTimeout(checkBanner.t); $banner.style.transition = ''; $banner.style.transform = ''; $banner.classList.remove('show'); };
  $banner.addEventListener('pointerdown', e => {
    if (!$banner.classList.contains('show')) return;
    bDrag = { y: e.clientY, t: performance.now(), dy: 0, moved: false, id: e.pointerId };
    clearTimeout(checkBanner.t);                                            // don't auto-hide while held
    try { $banner.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointer */ }
  });
  $banner.addEventListener('pointermove', e => {
    if (!bDrag || e.pointerId !== bDrag.id) return;
    const dy = e.clientY - bDrag.y;
    if (!bDrag.moved && Math.abs(dy) < 6) return;
    bDrag.moved = true;
    bDrag.dy = dy < 0 ? dy : dy / 4;                                        // free upward, resist downward
    $banner.style.transition = 'none';
    $banner.style.transform = `translateY(${bDrag.dy}px)`;
  });
  const endBannerDrag = e => {
    if (!bDrag || e.pointerId !== bDrag.id) return;
    const d = bDrag; bDrag = null;
    if (!d.moved) { if (e.type === 'pointerup') { hideBanner(); location.hash = '#/news'; } return; }   // a tap
    const fast = d.dy / Math.max(1, performance.now() - d.t) < -0.5;       // quick flick up
    if (d.dy < -$banner.offsetHeight * 0.3 || fast) hideBanner();
    else {                                                                  // snap back, resume auto-hide
      $banner.style.transition = ''; $banner.style.transform = '';
      checkBanner.t = setTimeout(hideBanner, 4000);
    }
  };
  $banner.addEventListener('pointerup', endBannerDrag);
  $banner.addEventListener('pointercancel', endBannerDrag);
  function checkWatches() {
    const w = store.get('watches', {}), now = P.simNow();
    let changed = false;
    Object.keys(w).forEach(id => {
      const a = P.byId(id);
      if (!a) return;
      const l = P.live(a, now);
      if (l.closed || l.nocam) return;
      if (l.wait < w[id].start || (l.level === 'free' && w[id].start > 0)) {
        store.update('guestInbox', [], list => [{
          id: 'w' + Date.now() + id, type: 'watch', t: now.getTime(), push: true,
          title: `${a.name}が空いてきました`, body: `通知を設定したアトラクションです。現在の待ち時間は${l.wait}分。`,
        }].concat(list).slice(0, 30));
        delete w[id]; changed = true;
      }
    });
    if (changed) store.set('watches', w);
  }

  /* ---------- live updates ---------- */
  let pending = false;
  function scheduleRender() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      if (route().name === 'route' && rs.anim) return;
      if (document.activeElement && document.activeElement.id === 'lq') return;
      render(true);
    });
  }
  store.on(key => {
    if (key === 'guestRead' && route().name === 'news') return;
    if (['notifications', 'rideEdits', 'ridesAdded', 'ridesRemoved', 'cameraEdits', 'camerasAdded', 'camerasRemoved', 'guestInbox', 'guestRead', 'watches', 'routeExtra', 'favs', 'guestPos', 'nearRadius'].includes(key)) scheduleRender();
    if (key === 'guestPos' || key === 'nearRadius') checkBanner();
    if (key === 'notifications' || key === 'guestInbox') checkBanner();
  });
  render(false);
  setInterval(() => {
    P.autoSendCheck(); checkWatches(); checkBanner();
    if (route().name !== 'route') scheduleRender();
    document.getElementById('clock').textContent = P.hhmm(P.simNow()).replace(/^0/, '');
  }, 5000);
})();
