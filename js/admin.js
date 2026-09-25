/* ParuParu Park AI — operations dashboard (layout & copy follow the "ParuParu Park AI v2 JP" mockup) */
(function () {
  'use strict';
  const P = window.PP;
  const { esc, fmt, store } = P;
  const $page = document.getElementById('page');
  const pct = v => Math.round(v * 100) + '%';
  const ZSHORT = k => P.zoneByKey[k].short;

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    document.getElementById('toasts').appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }
  function download(name, text) {
    const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const csv = v => { const s = String(v == null ? '' : v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const numChip = (level, no) => `<span class="num-chip f-${level}">${no || '–'}</span>`;
  const fillCls = l => ({ busy: 'f-busy', mid: 'f-mid', free: 'f-free', maint: 'f-maint', nocam: 'f-nocam' })[l];
  function bars(vals, current, height, gap, cutoff) {
    const max = Math.max.apply(null, vals) || 1;
    return `<div class="bars" style="height:${height}px;gap:${gap}px;${height > 150 ? 'margin-top:14px' : 'margin-top:10px'}">${vals.map((v, i) => {
      const off = cutoff != null && cutoff >= 0 && i >= cutoff;
      const h = off ? 100 : Math.max(6, Math.round(v / max * 100));
      return `<div><i class="${off ? 'off' : i === current ? 'now' : h >= 90 ? 'hi' : ''}" style="height:${h}%"></i></div>`;
    }).join('')}</div>
    <div class="bars-x" style="${height > 150 ? 'margin-top:6px' : ''}"><span>10:00</span><span>11:30</span><span>13:00</span><span>14:30</span><span>16:30</span></div>`;
  }
  const chk = on => `<span class="box ${on ? 'on' : ''}">${on ? '✓' : ''}</span>`;
  const slotOf = h => Math.max(0, Math.min(P.SLOTS - 1, Math.floor((h - 10) / (6.5 / P.SLOTS))));

  /* ---------- derived ---------- */
  const camsNeedingAction = () => P.cameras().filter(c => c.status !== 'ok');
  const pendingNotifs = () => P.notifications().filter(n => n.status === 'draft' || n.status === 'scheduled');
  const REASON_STATUS = r => ['点検', '長期整備', '整備'].includes(r) ? '整備中' : '休止中';
  function statusOf(l) {
    if (l.closed) return REASON_STATUS(l.reason);
    if (l.nocam) return 'カメラ未割当';
    return P.LEVEL_LABEL[l.level];
  }
  const ORDER = { busy: 0, mid: 1, free: 2, maint: 3, nocam: 4 };
  function tableRows(now) {
    return P.rides().map(a => ({ a, l: P.live(a, now) }))
      .sort((x, y) => ((y.l.people > y.l.cap) - (x.l.people > x.l.cap)) || ORDER[x.l.level] - ORDER[y.l.level] || y.l.occ - x.l.occ);
  }
  function sinceAbove(fn, thr, now) {
    let t = now.getTime();
    for (let m = 0; m < 240; m += 2) { const d = new Date(now.getTime() - m * 60e3); if (fn(d) < thr) break; t = d.getTime(); }
    return new Date(t);
  }
  function zoneOccAt(key, d) {
    let p = 0, c = 0;
    P.rides().forEach(a => { if (a.zoneKey !== key || !P.measurable(a)) return; p += P.occAt(a, d, false) * a.cfg.cap; c += a.cfg.cap; });
    return c ? p / c : 0;
  }
  function alerts(now) {
    const dismissed = store.get('dismissed', {});
    const visible = k => !dismissed[k] || now.getTime() - dismissed[k] > 30 * 60e3;
    const out = [];
    P.ZONES.forEach(z => {
      const s = P.zoneStats(z.key, now);
      if (s.occ < .6) return;
      const top = P.openRides().filter(a => a.zoneKey === z.key).map(a => ({ a, l: P.live(a, now) })).sort((x, y) => y.l.occ - x.l.occ)[0];
      const from = P.ZONES.map(x => P.zoneStats(x.key, now)).filter(x => x.key !== z.key).sort((x, y) => x.occ - y.occ)[0];
      const t = sinceAbove(d => zoneOccAt(z.key, d), .6, now);
      out.push({ key: 'zone-' + z.key + '-' + t.getHours(), lv: 3, tag: 'レベル3・緊急', t, hot: true,
        title: `${z.name}：現在の収容率 ${pct(s.occ)}`,
        body: `${top ? top.a.name + 'の入口誘導' : '入口誘導'}へスタッフ3名の配置を推奨します。`,
        action: `${from.name}から${top ? top.a.name : z.name}入口へスタッフ3名を配置` });
    });
    P.openRides().forEach(a => {
      const l = P.live(a, now);
      if (l.occ < a.cfg.thBusy / 100 || !a.cfg.alertOps) return;
      let rising = 0;
      for (let m = 5; m <= 90; m += 5) {
        if (P.occAt(a, new Date(now - (m - 5) * 60e3), false) >= P.occAt(a, new Date(now - m * 60e3), false)) rising = m; else break;
      }
      const fut = new Date(now.getTime() + 20 * 60e3); fut.setMinutes(Math.round(fut.getMinutes() / 5) * 5);
      const fw = P.predictWait(a, fut);
      const t = sinceAbove(d => P.occAt(a, d, false), a.cfg.thBusy / 100, now);
      out.push({ key: 'att-' + a.id + '-' + t.getHours(), lv: 2, tag: 'レベル2', t,
        title: rising >= 10 ? `${a.name}の待機列が${rising}分間、増加し続けています` : `${a.name}の収容率が${pct(l.occ)}に達しています`,
        body: fw > l.wait ? `${P.hhmm(fut)}に待ち時間${fw}分へ到達する見込みです。` : `現在の待ち時間は${l.wait}分です。補助列の開放を推奨します。`,
        action: `補助列を開放：${a.name}` });
    });
    camsNeedingAction().forEach(c => {
      if (c.status !== 'lost' && c.status !== 'overload') return;
      const t = c.status === 'overload' ? new Date(c.overSince) : new Date(Math.min(now.getTime() - 5 * 60e3, P.atHour(now, 13 + 55 / 60).getTime()));
      const pf = c.status === 'overload' && P.camPerf(c, now);
      out.push({ key: 'cam-' + c.code + (pf ? '-' + c.overSince : ''), lv: 1, tag: '機器', t, code: c.code,
        title: `${c.code} ${P.CAM_STATUS[c.status].label}`,
        body: c.status === 'lost' ? `${c.place}は近隣カメラで推定中です。`
          : `${c.place}の画面内人数が処理上限の${pct(pf.load)}（${pf.cap}人/フレーム）に達し、${pf.fps} fps に間引いて計測を継続中です。`,
        action: `${c.code}（${c.place}）の点検を保守へ依頼` });
    });
    return out.filter(a => visible(a.key)).sort((x, y) => y.lv - x.lv || y.t - x.t);
  }

  /* =================== 概況 =================== */
  function pageDash() {
    const now = P.simNow();
    const guests = P.parkGuests(now);
    const lastWeek = P.parkGuestsAt(new Date(now.getTime() - 7 * 864e5), false) * .89;   // last week was a quieter day
    const diff = Math.round((guests / lastWeek - 1) * 100);
    const measured = P.openRides().map(a => ({ a, l: P.live(a, now) }));
    const avgWait = Math.round(measured.reduce((s, x) => s + x.l.wait, 0) / (measured.length || 1));
    const busy = measured.filter(x => x.l.level === 'busy').sort((x, y) => y.l.occ - x.l.occ);
    const excluded = P.rides().length - measured.length;
    const cams = P.cameras();
    const cnt = s => cams.filter(c => c.status === s).length;
    const ps = P.parkSeries(now);
    const mx = Math.max.apply(null, ps.vals);
    let s0 = ps.vals.indexOf(mx), s1 = s0;
    while (s0 > 0 && ps.vals[s0 - 1] >= mx * .9) s0--;
    while (s1 < P.SLOTS - 1 && ps.vals[s1 + 1] >= mx * .9) s1++;
    const hm = h => { const m = Math.round(h * 2) / 2; return `${Math.floor(m)}:${m % 1 ? '30' : '00'}`; };
    const al = alerts(now);
    const kpi = (label, v, s) => `<div class="cell kpi"><div class="eyebrow">${label}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
    return `
    <div class="kpis">
      ${kpi('園内のゲスト数', fmt(guests), `${diff >= 0 ? '+' : ''}${diff}%（先週同時刻比）`)}
      ${kpi('平均待ち時間', avgWait + ' 分', '運行中のアトラクション・警告しきい値25分')}
      ${kpi('混雑アトラクション', `${busy.length} / ${measured.length}`, `${busy.map(x => '#' + x.a.number).join('・')}${busy.length ? '・' : ''}${excluded}件は計測対象外（整備／休止）`)}
      ${kpi('稼働中カメラ', `${cnt('ok')} / ${cams.length}`, `フレーム過負荷 ${cnt('overload')}台・信号断 ${cnt('lost')}台・整備中 ${cnt('maint')}台`)}
    </div>
    <div class="dash">
      <div class="l">
        <div class="chartblk">
          <div class="hd"><div class="eyebrow">園内全体の来園者数・本日</div><span>ピーク ${hm(10 + s0 * 6.5 / P.SLOTS)}–${hm(10 + (s1 + 1) * 6.5 / P.SLOTS)}</span></div>
          ${bars(ps.vals, ps.current, 184, 8)}
        </div>
        <div class="sechead"><div class="eyebrow">エリア別混雑度</div></div>
        <div class="zones">${P.ZONES.map(z => {
          const s = P.zoneStats(z.key, now);
          return `<a class="cell" href="#/rides?zone=${z.key}"><b class="nm">${z.name}</b><div class="pct">${pct(s.occ)}</div>
            <div class="dt">${s.people} / ${s.cap} 人・${s.n} 件</div><div class="meter"><i class="${fillCls(s.level)}" style="width:${Math.min(100, s.occ * 100)}%"></i></div></a>`;
        }).join('')}</div>
        <div class="sechead"><div class="eyebrow">現在の混雑トップ</div><a class="lnk" href="#/rides">すべてのアトラクション →</a></div>
        ${tableRows(now).slice(0, 3).map(({ a, l }) => `
          <div class="toprow" data-go="#/rides/${a.id}">${numChip(l.level, a.number)}
            <div class="bd"><b>${esc(a.name)}</b><small>${esc(a.zone)}・${l.people}/${l.cap} 人</small></div>
            ${P.pill(l.level, statusOf(l), true)}<div class="w">${l.closed || l.nocam ? '—' : l.wait + ' 分'}</div></div>`).join('')}
      </div>
      <div>
        <div class="alhead">${icon('warn', 15)}混雑アラート<span>${al.length}件</span></div>
        <div class="alerts">${al.slice(0, 4).map(a => `
          <div class="alert ${a.hot ? 'hot' : ''}">
            <div class="ah"><span>${a.tag}</span><span>${P.hhmm(a.t)}</span></div>
            <h3>${esc(a.title)}</h3><p>${esc(a.body)}</p>
            <div class="btns"><button class="ok" data-act="${esc(a.key)}">配置調整</button><button class="sk" data-skip="${esc(a.key)}">スキップ</button>
              ${a.code ? `<button class="sk" data-go="#/cams/${a.code}" style="margin-left:auto">詳細</button>` : ''}</div>
          </div>`).join('') || '<div class="alempty">現在アラートはありません</div>'}</div>
        <div class="sechead" style="border-top:1px solid var(--div2)"><div class="eyebrow">運用ログ</div></div>
        ${store.get('logs', []).slice(0, 8).map(l => `<div class="logrow"><time>${P.hhmm(new Date(l.t))}</time><span>${esc(l.text)}</span></div>`).join('')}
      </div>
    </div>`;
  }

  /* =================== アトラクション一覧 =================== */
  const rideSt = { zone: 'all', crowd: 'all', op: 'all', q: '', page: 0 };
  const RIDE_FILTERS = {
    zone:  { label: 'エリア', all: 'すべてのエリア', opts: () => P.ZONES.map(z => [z.key, z.name]) },
    crowd: { label: '混雑状況', all: 'すべての混雑状況', opts: () => [['busy', '混雑'], ['mid', 'やや混雑'], ['free', '空き']] },
    op:    { label: '運行状態', all: 'すべての運行状態', opts: () => [['active', '稼働中'], ['paused', '休止中']] },
  };
  const rideDraft = { q: '', zone: 'all', crowd: 'all', op: 'all' };   // values typed in the filter panel, applied on 検索
  function filteredRides(now) {
    const q = rideSt.q.trim().toLowerCase();
    return tableRows(now)
      .filter(x => rideSt.zone === 'all' || x.a.zoneKey === rideSt.zone)
      .filter(x => rideSt.crowd === 'all' || (!x.l.closed && !x.l.nocam && x.l.level === rideSt.crowd))
      .filter(x => rideSt.op === 'all' || (rideSt.op === 'paused' ? x.l.closed : !x.l.closed))
      .filter(x => !q || (x.a.name + x.a.zone + (x.a.number || '')).toLowerCase().includes(q));
  }
  function filterSelect(key) {
    const f = RIDE_FILTERS[key];
    return `<label class="ff"><span class="fl">${f.label}</span>
      <span class="fsel"><select name="${key}" data-rdraft="${key}">
        ${[['all', 'すべて']].concat(f.opts()).map(([v, l]) => `<option value="${v}" ${rideDraft[key] === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select>${icon('chevronD', 16, '', 2)}</span></label>`;
  }
  function filterPanel() {
    const dirty = ['q', 'zone', 'crowd', 'op'].some(k => rideDraft[k] !== (k === 'q' ? '' : 'all')) || ['zone', 'crowd', 'op'].some(k => rideSt[k] !== 'all') || rideSt.q;
    return `
    <div class="lhead2"><h2>アトラクション一覧</h2><button class="btn acc round" data-go="#/rides/new">${icon('plus', 15, '', 2.4)}アトラクションを追加</button></div>
    <form class="fpanel" id="rideFilter" role="search" autocomplete="off">
      <label class="ff wide"><span class="fl">アトラクション名</span>
        <span class="finp">${icon('search', 16)}<input name="q" data-rdraft="q" value="${esc(rideDraft.q)}" placeholder="アトラクション名"></span></label>
      ${filterSelect('zone')}${filterSelect('crowd')}${filterSelect('op')}
      <div class="fact">
        <button type="button" class="freset" data-rfreset ${dirty ? '' : 'disabled'}>フィルターを解除</button>
        <button type="submit" class="btn acc round">${icon('search', 15, '', 2.4)}検索</button>
      </div>
    </form>`;
  }
  function pageRides() {
    const now = P.simNow();
    const q = new URLSearchParams(location.hash.split('?')[1] || '');
    if (q.get('zone')) { Object.assign(rideSt, { zone: q.get('zone'), crowd: 'all', op: 'all', q: '', page: 0 }); Object.assign(rideDraft, { zone: q.get('zone'), crowd: 'all', op: 'all', q: '' }); history.replaceState(null, '', '#/rides'); }
    const list = filteredRides(now);
    const PER = rideSt.per || 20, pages = Math.max(1, Math.ceil(list.length / PER));
    rideSt.page = Math.min(rideSt.page, pages - 1);
    const from = rideSt.page * PER, slice = list.slice(from, from + PER);
    const cond = `${rideSt.q ? `・「${esc(rideSt.q)}」` : ''}${['zone', 'crowd', 'op'].filter(k => rideSt[k] !== 'all').map(k => '・' + RIDE_FILTERS[k].opts().find(o => o[0] === rideSt[k])[1]).join('')}`;
    return `
    ${filterPanel()}
    <div class="tcard">
    ${cond ? `<div class="tcond">絞り込み：${cond.slice(1)}<span>混雑度順</span></div>` : ''}
    <div class="tblwrap">
      <div class="grid-h rides-g"><div>アトラクション</div><div>エリア</div><div>人数／収容</div><div>待ち</div><div>カメラ</div><div>混雑状況</div><div>運行状態</div><div></div></div>
      ${list.length ? '' : '<div class="empty">条件に一致するアトラクションはありません。</div>'}
      ${slice.map(({ a, l }) => {
        const over = l.people > l.cap && !l.closed;
        const cams = P.camerasForRide(a.id);
        return `<div class="grid-r rides-g" data-go="#/rides/${a.id}">
          <div class="nmc"><span class="rthumb ${a.image ? '' : 'noimg'}" style="${a.image ? `background-image:url('${a.image}')` : ''}">${numChip(l.level, a.number)}</span><span>${esc(a.name)}</span></div>
          <div class="zn">${esc(a.zone)}</div>
          <div class="capc ${over ? 'over' : ''}">
            <div class="cap-row"><b>${l.closed || l.nocam ? '—' : `${l.people} / ${l.cap}`}</b><span>${l.closed || l.nocam ? '' : pct(l.occ)}</span></div>
            <div class="meter"><i class="${over ? 'over' : fillCls(l.level)}" style="width:${Math.min(100, l.occ * 100)}%"></i></div>
            ${over ? `<div class="ov">${icon('warn', 11, '', 2.4)}${l.people - l.cap}人超過</div>` : ''}
          </div>
          <div style="font-weight:800">${l.closed || l.nocam ? '—' : l.wait + ' 分'}</div>
          <div class="camlbl">${cams.length ? cams.map(c => c.code.replace('CAM-', '')).join('・') : '—'}</div>
          <div>${P.pill(l.level, statusOf(l), true)}</div>
          <div>${opSwitch(a, l)}</div>
          ${rowActs('ride', a.id, a.name, '#/rides/' + a.id)}
        </div>`;
      }).join('')}
    </div>
    ${tableFooter(list.length, rideSt.page, pages, PER, 'rp', 'ride')}
    </div>`;
  }
  function opSwitch(a, l) {
    const on = !l.closed;
    return `<button class="sw ${on ? 'on' : ''}" role="switch" aria-checked="${on}" data-rtoggle="${a.id}"
      title="${on ? '稼働中（クリックで休止）' : esc(l.label) + '（クリックで再開）'}" aria-label="${esc(a.name)}の運行状態：${on ? '稼働中' : '休止中'}"><i></i></button>`;
  }
  /* table footer: "N件を表示" + page size on the left, 前へ / pages / 次へ on the right */
  function tableFooter(total, cur, pages, per, key, sizeKey) {
    const nums = [];
    for (let p = 0; p < pages; p++) {
      if (pages <= 7 || p === 0 || p === pages - 1 || Math.abs(p - cur) <= 1) nums.push(p);
      else if (nums[nums.length - 1] !== '…') nums.push('…');
    }
    return `<div class="tfoot">
      <div class="tf-l"><span>${total}件を表示</span>
        <label class="psize"><select data-psize="${sizeKey}" aria-label="1ページの表示件数">${[10, 20, 50].map(n => `<option value="${n}" ${per === n ? 'selected' : ''}>${n}件</option>`).join('')}</select>${icon('chevronD', 14, '', 2)}</label></div>
      <nav class="tf-r" aria-label="ページ送り">
        <button class="pgb txt" data-${key}="${cur - 1}" ${cur === 0 ? 'disabled' : ''}>${icon('chevronL', 15, '', 2.2)}前へ</button>
        ${nums.map(p => p === '…' ? '<span class="pgdots">…</span>' : `<button class="pgb ${p === cur ? 'on' : ''}" data-${key}="${p}" ${p === cur ? 'aria-current="page"' : ''}>${p + 1}</button>`).join('')}
        <button class="pgb txt" data-${key}="${cur + 1}" ${cur >= pages - 1 ? 'disabled' : ''}>次へ${icon('chevronR', 15, '', 2.2)}</button>
      </nav>
    </div>`;
  }

  /* =================== アトラクション詳細 =================== */
  function rideLog(a, l, now, cams) {
    const q = cams[0] ? cams[0].code : 'CAM-—';
    const m = k => P.hhmm(new Date(now.getTime() - k * 60e3));
    if (l.closed) return [[m(40), '運行を停止・整備モードへ切替'], [m(42), '待機列の計測：0 人'], [m(190), q + 'が計測エリアを再調整'], ['09:30', '監視セッションを開始']];
    const prev = Math.round(P.occAt(a, new Date(now.getTime() - 10 * 60e3), false) * a.cfg.cap);
    const d = l.people - prev;
    return [[m(1), `待機列の計測：${l.people} 人（10分前比 ${d >= 0 ? '+' : ''}${d}）`],
      [m(10), l.level === 'busy' ? '待機列混雑アラート：レベル2' : '待機列の混雑度は許容範囲内です'],
      [m(27), q + 'が計測エリアを再調整'],
      [m(44), `待機列の計測：${Math.round(P.occAt(a, new Date(now.getTime() - 44 * 60e3), false) * a.cfg.cap)} 人`]];
  }
  function pageRide(id) {
    const a = P.byId(id);
    if (!a || !a.cfg) return '<div class="empty">アトラクションが見つかりません。</div>';
    const now = P.simNow(), l = P.live(a, now), c = a.cfg;
    const cams = P.camerasForRide(a.id);
    const s = P.attractionSeries(a, now);
    const thr = l.closed ? 0 : P.throughput(a);
    const dec = n => String(Math.round(n * 10) / 10);
    const boxesA = [[8, 30, 18, 34, 1], [32, 26, 16, 32, 1], [56, 38, 17, 30, 0], [76, 28, 16, 34, 1]];
    const boxesB = [[14, 34, 20, 36, 0], [44, 30, 18, 34, 1], [70, 40, 18, 30, 0]];
    let ops;
    if (l.closed) ops = `${l.label}のため運行を停止しています。再開前に待機列の案内表示を確認してください。`;
    else if (l.nocam) ops = 'カメラが未割当のため計測値がありません。アトラクションを編集でカメラを割り当ててください。';
    else if (l.level === 'busy') {
      const since = sinceAbove(d => P.occAt(a, d, false), c.thBusy / 100, now);
      const mins = Math.max(5, Math.round((now - since) / 60e3 / 5) * 5);
      ops = `待機列が${mins > 60 ? '1時間以上' : mins + '分間'}、収容率${c.thBusy}%を超えています。改札スタッフ2名の増員と補助列の開放を推奨します。`;
    } else ops = '混雑度は安定しています。追加の配置調整は不要です。';
    return `
    <div class="split">
      <div class="l">
        <a class="btn" href="#/rides">← すべてのアトラクション</a>
        <div class="rhead"><div><div class="eyebrow">${esc(a.zone)}</div><div class="nm">${esc(a.name)}</div></div>
          <a class="btn" href="#/rides/${a.id}/edit" style="padding:9px 13px">アトラクションを編集</a></div>
        <div class="camcards">
          ${cams.length ? '' : '<div class="nocams">このアトラクションにはカメラが未割当です。 <strong>アトラクションを編集</strong> で計測用カメラを選んでください。</div>'}
          ${cams.map((cm, i) => {
            const n = P.cameraCount(cm, now);
            const sh = cams.length > 1 ? (P.queueShares(a).find(x => x.cam.code === cm.code) || {}).share : null;
            const dead = P.deadCam(cm);
            return `<div class="camcard" data-go="#/cams/${cm.code}">
              <div class="feed ${i % 2 ? 'alt' : ''}">
                ${dead ? '' : (i === 0 ? boxesA : boxesB).map(b => `<div class="bx ${b[4] ? 'hot' : ''}" style="left:${b[0]}%;top:${b[1]}%;width:${b[2]}%;height:${b[3]}%"></div>`).join('')}
                <span class="tg">${cm.code}・${dead ? P.CAM_STATUS[cm.status].label : 'ライブ映像'}</span>
              </div>
              <div class="ft"><span>待機列${sh != null ? `（区間 ${pct(sh)}）` : ''}</span><span>AI計測 ${n == null ? '—' : n} 人</span></div>
            </div>`;
          }).join('')}
        </div>
        <div style="margin-top:24px">
          <div class="eyebrow">時間帯別の来園者数・本日</div>
          ${bars(s.vals, l.closed ? -1 : s.current, 150, 6)}
        </div>
      </div>
      <div class="rc">
        <div class="pad"><div class="eyebrow">現在</div>
          <div class="big2"><div><b>${l.closed || l.nocam ? '—' : l.wait}<span>分</span></b><small>待ち時間</small></div>
            <div><b>${l.people}<span>/${l.cap}</span></b><small>人数／収容</small></div></div></div>
        ${waitCalcBlock(a, l, c, now, thr, dec)}
        <div class="pad opsbox"><div class="eyebrow">配置の提案</div><p>${esc(ops)}</p>
          <div class="btns"><button class="btn acc lg" data-staff="${a.id}">スタッフを配置</button><button class="btn lg" data-notify="${a.id}">ゲストへ通知を送る</button></div></div>
        <div class="pad last"><div class="eyebrow">カメラログ</div>
          ${rideLog(a, l, now, cams).map(([t, m]) => `<div class="klog"><time>${t}</time><span>${esc(m)}</span></div>`).join('')}</div>
      </div>
    </div>`;
  }

  /* 待ち時間の算出方法: queue camera count ÷ theoretical capacity */
  function waitCalcBlock(a, l, c, now, thr, dec) {
    if (l.closed || l.nocam) return `<div class="pad"><div class="eyebrow">待ち時間の算出方法</div>
      <div class="note" style="margin-top:8px">${l.closed ? '運行停止中のため待ち時間は算出していません。' : 'カメラが未割当のため待ち時間を算出できません。'}</div></div>`;
    const k = P.waitCalc(a, now);
    const qCams = k.queueCams.map(x => x.code).join('・') || '—';
    const rows = [
      ...(k.parts.length > 1
        ? k.parts.map(p => [`${p.cam.code}の区間（${pct(p.share)}${p.est ? '・推定' : ''}）`, p.count + ' 人']).concat([['待機列の人数（合計・直近3分の平均）', k.queue + ' 人']])
        : [[`待機列の人数（直近3分の平均・${qCams}${k.estimated ? '・推定' : ''}）`, k.queue + ' 人']]),
      ['1回あたりの座席数 × 運行回数', `${c.seats} 席 × ${Math.round(60 / c.cycle * 10) / 10} 回／時`],
      ['理論上の処理能力', thr + ' 人／時'],
      ['計算値', dec(k.queue / thr * 60) + ' 分'],
      ['乗降係数', `×1.15 → ${dec(k.raw)} 分`],
      ['ゲスト表示（5分単位）', k.wait + ' 分'],
    ];
    return `<div class="pad"><div class="wchead"><div class="eyebrow">待ち時間の算出方法</div></div>
      <div class="formula"><span>(</span><b>${k.queue}</b><span class="m">人</span><span>÷</span><b>${thr}</b><span class="m">人／時</span><span>) × 60 × 1.15 =</span><b class="acc">${dec(k.raw)} 分</b></div>
      ${rows.map(([x, v]) => `<div class="kv calc"><span>${x}</span><b>${v}</b></div>`).join('')}
      ${k.estimated ? `<div class="wfb">${k.parts.filter(p => p.est).map(p => p.cam.code).join('・')}が停止中のため、その区間は通常の比率（${k.parts.filter(p => p.est).map(p => pct(p.share)).join('・')}）で推定しています。</div>` : ''}
      <div class="note">${k.parts.length > 1 ? '複数の待機列カメラは区間を分けて計測し（重複なし）、合計します。' : ''}待機列カメラが5秒ごとに人数を計測し、直近3分の平均を使います。処理能力 ＝ 1回あたりの座席数 × 1時間あたりの運行回数（アトラクション編集画面で設定）。係数1.15は乗り降りの時間や空席を補正する目安です。結果は5分単位に丸めています。</div>
    </div>`;
  }

  /* =================== アトラクション 追加／編集 =================== */
  let rf = null;           // ride form state
  // queue stretch share per camera (%) when a ride has several queue cameras; unset → equal split
  const shareVal = (f, code) => (f.shares && f.shares[code] != null && f.shares[code] !== '' ? f.shares[code] : Math.round(100 / f.cams.length));
  const shareSum = f => f.cams.reduce((s, code) => s + (Number(shareVal(f, code)) || 0), 0);
  function rideFormFrom(id) {
    if (id === 'new') {
      const draft = store.get('rideDraft', null);
      const nums = P.rides().map(a => a.number || 0);
      return draft || { rideId: null, name: '', code: 'RIDE-' + String(Math.max(...nums) + 1).padStart(3, '0'), zoneKey: 'entrance', status: '未開業', cap: 80, seats: 20, cycle: 3,
        height: 110, hours: P.HOURS, desc: '', cams: [], shares: {}, thMid: 45, thBusy: 75, alertOps: true, notifyGuest: true, notifyFree: false, step: 'info' };
    }
    const a = P.byId(id);
    if (!a || !a.cfg) return null;
    const c = a.cfg;
    return { rideId: a.id, name: a.name, code: c.code || 'RIDE-' + String(a.number || 0).padStart(3, '0'), zoneKey: a.zoneKey,
      status: c.status || (P.closedReason(a) ? REASON_STATUS(P.closedReason(a)) : '稼働中'), cap: c.cap, seats: c.seats, cycle: c.cycle,
      height: (a.heightLimit && a.heightLimit.min) || '', hours: c.hours, desc: c.desc, cams: P.camerasForRide(a.id).map(x => x.code),
      shares: Object.fromEntries(P.queueShares(a).map(x => [x.cam.code, Math.round(x.share * 100)])),
      thMid: c.thMid, thBusy: c.thBusy, alertOps: c.alertOps, notifyGuest: c.notifyGuest, notifyFree: c.notifyFree, step: 'info' };
  }
  function pageRideForm(id) {
    if (!rf || rf._for !== id) { rf = rideFormFrom(id); if (!rf) return '<div class="empty">アトラクションが見つかりません。</div>'; rf._for = id; }
    const f = rf;
    const thr = Number(f.seats) > 0 && Number(f.cycle) > 0 ? Math.round(Number(f.seats) * 60 / Number(f.cycle)) : 0;
    const lv = 60 >= Number(f.thBusy) ? 'busy' : 60 >= Number(f.thMid) ? 'mid' : 'free';
    const wait = thr ? Math.max(1, Math.round(Number(f.cap) * .6 / thr * 60)) : '—';
    const a = f.rideId ? P.byId(f.rideId) : null;
    const checks = [
      [!!f.name.trim(), f.name.trim() ? 'アトラクション名を入力済み' : 'アトラクション名が未入力です'],
      [f.cams.length > 0, f.cams.length ? `カメラ${f.cams.length}台を割当済み` : 'カメラ未割当。計測値がありません'],
      ...(f.cams.length > 1 ? [[shareSum(f) === 100, shareSum(f) === 100 ? '区間の比率：合計100%' : `区間の比率の合計が${shareSum(f)}%です（100%にしてください）`]] : []),
      [Number(f.thBusy) > Number(f.thMid), Number(f.thBusy) > Number(f.thMid) ? '混雑しきい値：適正値です' : 'しきい値「混雑」は「やや混雑」より大きい必要があります'],
      [thr > 0, thr > 0 ? '座席数と1回あたりの時間を設定済み' : '待ち時間の算出には座席数と1回あたりの時間が必要です'],
    ];
    const inp = (k, cls, type, extra) => `<input class="fin ${cls}" data-rf="${k}" value="${esc(f[k])}" ${type ? `type="${type}"` : ''} ${extra || ''}>`;
    const seg = (k, vals, labels) => `<div class="seg">${vals.map((v, i) => `<button class="${f[k] === v ? 'on' : ''}" data-rfs="${k}:${v}">${labels ? labels[i] : v}</button>`).join('')}</div>`;
    let body;
    if (f.step === 'info') body = `
      <div class="fgrid">
        <div class="full"><div class="flabel b">アトラクション名</div>${inp('name', 'n', '', 'placeholder="例：メガコースター「四次元」"')}<div class="hint">ゲストアプリとマップに表示される名称です。</div></div>
        <div><div class="flabel b">コード アトラクション</div>${inp('code', 'mono', '', 'placeholder="RIDE-010"')}</div>
        <div><div class="flabel b">稼働状態</div>${seg('status', ['稼働中', '整備中', '未開業'])}</div>
        <div class="full"><div class="flabel b">エリア</div>${seg('zoneKey', P.ZONES.map(z => z.key), P.ZONES.map(z => z.name))}</div>
        <div><div class="flabel b">待機列の収容人数（人）</div>${inp('cap', 'n', 'number')}</div>
        <div><div class="flabel b">1回あたりの座席数</div>${inp('seats', 'n', 'number')}</div>
        <div><div class="flabel b">1回あたりの時間（分）</div>${inp('cycle', 'n', 'number', 'step="0.5"')}</div>
        <div class="full calcbox"><span class="m">処理能力 =</span><b>${esc(f.seats)}</b><span class="m">座席 × 60 ÷</span><b>${esc(f.cycle)}</b><span class="m">分 =</span><b class="acc">${thr ? thr + ' 人／時' : '— 両方の数値が必要です'}</b></div>
        <div><div class="flabel b">身長制限（cm）</div>${inp('height', 'n', 'number')}</div>
        <div><div class="flabel b">営業時間</div>${inp('hours', 'n')}</div>
        <div class="full"><div class="flabel b">ゲストアプリ用の短い説明</div><textarea class="fin ta2" data-rf="desc" rows="3">${esc(f.desc)}</textarea></div>
        <div class="full"><div class="flabel b">アトラクション写真</div>
          <div class="photo"><div class="ph" style="${a && a.image ? `background-image:url('${a.image}')` : ''}"></div>
            <div><button class="btn" data-toast="写真のアップロードは本番環境で有効になります">画像を選ぶ</button><div class="hint">JPGまたはPNG、16:9、最小1280×720。</div></div></div></div>
      </div>`;
    else if (f.step === 'cam') body = `
      <div style="padding-top:20px">
        <div class="eyebrow">アトラクションに割り当てたカメラ</div>
        <div class="sub" style="margin-top:5px">このアトラクションの計測値を供給するカメラを選びます。1台で複数のアトラクションを担当できます。</div>
        ${f.cams.length > 1 ? `<div class="sharebox">
          <div class="eyebrow">待機列の区間の比率</div>
          <div class="sub" style="margin-top:5px">待機列を区間に分け、各カメラは自分の区間だけを計測します（重複して数えない）。通常時にその区間に並ぶ人の割合を入力してください。カメラが停止したときの推定にも使います。</div>
          <div class="sharegrid">${f.cams.map(code => `<label class="shareitem"><span class="mono">${code}</span>
            <span class="shareinp"><input class="fin n" type="number" min="0" max="100" data-rfshare="${code}" value="${esc(shareVal(f, code))}"><i>%</i></span></label>`).join('')}</div>
        </div>` : ''}
        <div class="pickwrap tall">${P.cameras().map(c => {
          const on = f.cams.includes(c.code);
          return `<div class="pickrow ${on ? 'on' : ''}" data-rfcam="${c.code}">${chk(on)}
            <div class="bd"><b>${esc(c.place)}</b><small>${c.code}・${P.zoneByKey[c.zone].name}・${P.CAM_STATUS[c.status].label}</small></div>
            <span class="role">${on ? (f.cams[0] === c.code ? '主カメラ' : '副カメラ') : '未割当'}</span></div>`;
        }).join('')}</div>
      </div>`;
    else body = `
      <div class="fgrid">
        <div class="full"><div class="eyebrow">混雑しきい値</div><div class="sub" style="margin-top:5px">待機列の収容率（${esc(f.cap)} 人).</div></div>
        <div><div class="flabel b">レベル “やや混雑” （%）</div>${inp('thMid', 'n', 'number')}</div>
        <div><div class="flabel b">レベル “混雑” （%）</div>${inp('thBusy', 'n', 'number')}</div>
        <div class="full thbar"><div class="free ${lv === 'free' ? 'on' : ''}">空き</div><div class="mid ${lv === 'mid' ? 'on' : ''}">やや混雑</div><div class="busy ${lv === 'busy' ? 'on' : ''}">混雑</div></div>
        <div class="full" style="border-top:1px solid var(--div2);padding-top:16px"><div class="eyebrow">アラート &amp; 通知</div>
          ${[['alertOps', '混雑しきい値を超えたら管理者に通知', 'アラート一覧と当番スタッフへ送信します。'],
            ['notifyGuest', '混雑時にゲストへ通知', 'ゲストアプリに空いているアトラクションを提案します。'],
            ['notifyFree', '登録したゲストに空き始めを通知', '「空き」まで下がり5分継続した場合のみ送信します。']].map(([k, t, h]) =>
            `<div class="chk chkrow" data-rft="${k}">${chk(f[k])}<div><b>${t}</b><small>${h}</small></div></div>`).join('')}
        </div>
      </div>`;
    return `
    <div class="split w380">
      <div class="l fp">
        <div class="fhead"><a class="btn" href="${f.rideId ? '#/rides/' + f.rideId : '#/rides'}">← キャンセル</a><span class="eyebrow">${f.rideId ? 'アトラクションを編集' : 'アトラクションを新規追加'}</span></div>
        <div class="fh1">${f.rideId ? esc(f.name || 'アトラクション') : 'アトラクションを新規追加'}</div>
        <div class="steps">${[['info', '1・基本情報'], ['cam', '2・カメラ'], ['rule', '3・しきい値 & アラート']].map(([k, t]) => `<button class="${f.step === k ? 'on' : ''}" data-rfstep="${k}">${t}</button>`).join('')}</div>
        ${body}
      </div>
      <div class="rc">
        <div class="pad"><div class="eyebrow">ゲストアプリでのプレビュー</div>
          <div class="pvride"><div class="img" style="${a && a.image ? `background-image:url('${a.image}')` : ''}"></div>
            <div class="bd"><div class="nm">${esc(f.name.trim() || 'アトラクション名')}</div><div class="zn">${P.zoneByKey[f.zoneKey].name}・${f.cams.length ? f.cams.length + '台' : 'カメラ未割当'}</div>
              <div class="ft">${P.pill(lv, P.LEVEL_LABEL[lv], true)}<div><b>${wait}</b><small>分（予測待ち時間）</small></div></div></div></div>
          <div class="hint" style="margin-top:10px;line-height:1.5">設定したしきい値を確認するため、収容率60%で試算しています。</div></div>
        <div class="pad checks"><div class="eyebrow">保存前チェック</div>
          ${checks.map(([ok, t]) => `<div class="ck ${ok ? '' : 'bad'}"><i>${ok ? '✓' : '!'}</i><span>${t}</span></div>`).join('')}</div>
        <div class="factions">
          <button class="btn acc lg" data-rfsave>${f.rideId ? '変更を保存' : 'アトラクションを作成'}</button>
          <button class="btn lg" data-rfdraft>下書き保存</button>
          ${f.rideId ? '<button class="btn lg link" data-rfstop>運行停止</button>' : ''}
        </div>
      </div>
    </div>`;
  }
  function setCamCovers(code, rideId, on, role) {
    const c = P.cameras().find(x => x.code === code);
    if (!c) return;
    const has = c.covers.some(v => v.att === rideId);
    if (has === on) return;
    const covers = on ? c.covers.concat({ att: rideId, role: role || '待機列の計測' }) : c.covers.filter(v => v.att !== rideId);
    saveCamera(code, { covers });
  }
  function saveCamera(code, patch) {
    const added = store.get('camerasAdded', []);
    const i = added.findIndex(c => c.code === code);
    if (i >= 0) { added[i] = Object.assign({}, added[i], patch); store.set('camerasAdded', added); }
    else store.update('cameraEdits', {}, e => { e[code] = Object.assign({}, e[code], patch); return e; });
  }
  function saveRideForm() {
    const f = rf;
    if (!f.name.trim()) { toast('アトラクション名を入力してください'); f.step = 'info'; render(true); return; }
    if (Number(f.thBusy) <= Number(f.thMid)) { toast('しきい値「混雑」は「やや混雑」より大きい必要があります'); f.step = 'rule'; render(true); return; }
    if (f.cams.length > 1 && shareSum(f) !== 100) { toast(`区間の比率の合計が${shareSum(f)}%です（100%にしてください）`); f.step = 'cam'; render(true); return; }
    let id = f.rideId;
    if (!id) {
      id = 'r' + Date.now().toString(36);
      const num = Math.max(...P.rides().map(a => a.number || 0)) + 1;
      store.update('ridesAdded', [], l => l.concat({ id, number: num, name: f.name.trim(), zone: P.zoneByKey[f.zoneKey].name, zoneKey: f.zoneKey, isAttraction: true,
        price: null, priceNotes: null, tags: ['フリーパス'], heightLimit: {}, ageLimit: {}, catchcopy: f.desc, description: '', disclaimer: null, closedReason: null,
        image: null, gallery: [], pin: null, sourceUrl: null, custom: true }));
      store.set('rideDraft', null);
    }
    store.update('rideEdits', {}, e => {
      e[id] = Object.assign({}, e[id], { name: f.name.trim(), code: f.code, zoneKey: f.zoneKey, status: f.status, cap: +f.cap, seats: +f.seats, cycle: +f.cycle,
        height: f.height, hours: f.hours, desc: f.desc, thMid: +f.thMid, thBusy: +f.thBusy, alertOps: f.alertOps, notifyGuest: f.notifyGuest, notifyFree: f.notifyFree });
      return e;
    });
    P.cameras().forEach(c => setCamCovers(c.code, id, f.cams.includes(c.code), '待機列の計測'));
    f.cams.forEach(code => {                                         // each camera's stretch of the queue
      const c = P.cameras().find(x => x.code === code);
      if (!c) return;
      const share = f.cams.length > 1 ? Number(shareVal(f, code)) : undefined;
      saveCamera(code, { covers: c.covers.map(v => (v.att === id ? Object.assign({}, v, { share }) : v)) });
    });
    P.addLog(`${f.rideId ? 'アトラクションを更新' : 'アトラクションを追加'}：${f.name.trim()}`);
    toast(f.rideId ? '変更を保存しました' : 'アトラクションを作成しました');
    rf = null;
    location.hash = '#/rides/' + id;
  }

  /* =================== AIカメラ =================== */
  const camSt = { q: '', zone: 'all', status: 'all', att: 'all', page: 0 };
  const camDraft = { q: '', zone: 'all', status: 'all', att: 'all' };   // filter panel values, applied on 検索
  const CAM_FILTERS = {
    zone:   { label: 'エリア', opts: () => P.ZONES.map(z => [z.key, z.name]) },
    status: { label: '状態', opts: () => [['ok', '稼働中'], ['overload', 'フレーム過負荷'], ['lost', '信号断'], ['maint', '整備中'], ['inactive', '未有効化']] },
    att:    { label: '担当アトラクション', opts: () => P.rides().map(a => [a.id, (a.number ? a.number + '. ' : '') + a.name]) },
  };
  function camFilterPanel() {
    const dirty = camDraft.q || camSt.q || ['zone', 'status', 'att'].some(k => camDraft[k] !== 'all' || camSt[k] !== 'all');
    const sel = k => `<label class="ff"><span class="fl">${CAM_FILTERS[k].label}</span>
      <span class="fsel"><select name="${k}" data-cmdraft="${k}">
        ${[['all', 'すべて']].concat(CAM_FILTERS[k].opts()).map(([v, l]) => `<option value="${esc(v)}" ${camDraft[k] === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}
      </select>${icon('chevronD', 16, '', 2)}</span></label>`;
    return `
    <form class="fpanel" id="camFilter" role="search" autocomplete="off">
      <label class="ff wide"><span class="fl">カメラ</span>
        <span class="finp">${icon('search', 16)}<input name="q" data-cmdraft="q" value="${esc(camDraft.q)}" placeholder="カメラコード・設置場所"></span></label>
      ${sel('zone')}${sel('status')}${sel('att')}
      <div class="fact">
        <button type="button" class="freset" data-cmreset ${dirty ? '' : 'disabled'}>フィルターを解除</button>
        <button type="submit" class="btn acc round">${icon('search', 15, '', 2.4)}検索</button>
      </div>
    </form>`;
  }
  function pageCams() {
    const now = P.simNow();
    const all = P.cameras();
    const cnt = s => all.filter(c => c.status === s).length;
    const q = camSt.q.trim().toLowerCase();
    const list = all.filter(c => (camSt.zone === 'all' || c.zone === camSt.zone) && (camSt.status === 'all' || c.status === camSt.status)
      && (camSt.att === 'all' || c.covers.some(v => v.att === camSt.att))
      && (!q || (c.code + ' ' + c.place).toLowerCase().includes(q)));
    const PER = camSt.per || 20, pages = Math.max(1, Math.ceil(list.length / PER));
    camSt.page = Math.min(camSt.page, pages - 1);
    const from = camSt.page * PER, slice = list.slice(from, from + PER);
    const dotCls = { ok: 'f-free', overload: 'f-mid', lost: 'f-busy', maint: 'f-maint', inactive: 'f-nocam' };
    const cond = `${camSt.q ? `・「${esc(camSt.q)}」` : ''}${['zone', 'status', 'att'].filter(k => camSt[k] !== 'all').map(k => '・' + esc((CAM_FILTERS[k].opts().find(o => o[0] === camSt[k]) || [0, camSt[k]])[1])).join('')}`;
    return `
    <div class="lhead2"><div><h2>AIカメラ一覧</h2>
        <div class="lsub">${all.length}台・稼働中 ${cnt('ok')}台・フレーム過負荷 ${cnt('overload')}台・信号断 ${cnt('lost')}台・整備中 ${cnt('maint')}台</div></div>
      <div class="lbtns"><button class="btn round ghostline" data-export>${icon('external', 14, '', 2.2)}レポート出力</button>
        <button class="btn acc round" data-go="#/cams/new">${icon('plus', 15, '', 2.4)}カメラを追加</button></div></div>
    ${camFilterPanel()}
    <div class="tcard">
    ${cond ? `<div class="tcond">絞り込み：${cond.slice(1)}<span>${list.length}台</span></div>` : ''}
    <div class="tblwrap">
      <div class="grid-h cams-g"><div>カメラコード</div><div>アトラクション</div><div>エリア</div><div>状態</div><div>計測人数</div><div></div></div>
      ${list.length ? "" : "<div class=\"empty\">条件に一致するカメラはありません。</div>"}
      ${slice.map(c => {
        const st = P.CAM_STATUS[c.status], n = P.cameraCount(c, now);
        return `<div class="grid-r cams-g" data-go="#/cams/${c.code}">
          <div class="code"><span class="dot ${dotCls[c.status]}"></span>${c.code}</div>
          <div class="pl">${esc(c.covers.filter(v => v.att && P.byId(v.att)).map(v => P.byId(v.att).name).join("・") || c.place)}${c.covers.filter(v => v.att && P.byId(v.att)).map(v => {
            const qs = P.queueShares(P.byId(v.att)), s = qs.length > 1 && qs.find(x => x.cam.code === c.code);
            return s ? `<small class="sec">区間 ${pct(s.share)}</small>` : '';
          }).join('')}</div>
          <div class="zn">${P.zoneByKey[c.zone].name}</div>
          <div>${P.pill(st.key, st.label, true)}</div>
          <div class="cn"><b>${n == null || P.deadCam(c) ? '—' : n}</b><small>人</small></div>
          ${rowActs('cam', c.code, c.code + ' ' + c.place, '#/cams/' + c.code)}
        </div>`;
      }).join('')}
    </div>
    ${tableFooter(list.length, camSt.page, pages, PER, 'cp', 'cam')}
    </div>`;
  }

  /* camera detail */
  const cd = { code: null, editZone: false, draft: null, replay: null };
  const DEFAULT_ZONE = [[8, 55], [92, 55], [98, 97], [2, 97]];
  function camLogs(c, now, n) {
    const own = (store.get('camLogs', {})[c.code] || []).map(l => [P.hhmm(new Date(l.t)), l.text, l.t]);
    let base;
    if (c.status === 'lost') base = [['13:55', 'レコーダーとの接続が切断・近隣カメラで推定中'], ['13:54', '信号品質が32%まで低下'], ['11:20', '計測エリアを調整'], ['09:30', '監視セッションを開始']];
    else if (c.status === 'maint') base = [['11:20', '計測を停止・整備モードへ切替'], ['11:18', '計測 0 人'], ['10:05', '計測エリアを調整'], ['09:30', '監視セッションを開始']];
    else {
      const prev = P.cameraCountAt(c, new Date(now.getTime() - 10 * 60e3), false);
      const m = k => P.hhmm(new Date(now.getTime() - k * 60e3));
      base = [[m(1), `計測 ${n} 人（10分前比 ${n - prev >= 0 ? '+' : ''}${n - prev}）`], [m(10), n > 50 ? '混雑しきい値レベル2を超過' : '計測値は平常範囲'],
        [m(27), '明るさに合わせて計測エリアを自動補正'], [m(112), `計測 ${P.cameraCountAt(c, new Date(now.getTime() - 112 * 60e3), false)} 人`], ['09:30', '監視セッションを開始']];
      if (c.status === 'overload') {
        base.push([P.hhmm(new Date(c.overSince)), `処理負荷が${Math.round(P.LOAD_HI * 100)}%を超過・フレームを間引き（${P.camPerf(c, now).fps} fps）`]);
        base.sort((x, y) => y[0].localeCompare(x[0]));
      }
    }
    return own.map(x => [x[0], x[1]]).concat(base).slice(0, 8);
  }
  function pageCam(code) {
    const c = P.cameras().find(x => x.code === code);
    if (!c) return '<div class="empty">カメラが見つかりません。</div>';
    if (cd.code !== code) Object.assign(cd, { code, editZone: false, draft: null, replay: null });
    const now = P.simNow();
    const st = P.CAM_STATUS[c.status];
    const dead = P.deadCam(c);
    const n = P.cameraCount(c, now);
    const paused = store.get('pausedCams', {})[c.code] != null;
    const zone = cd.draft || store.get('camZones', {})[c.code] || DEFAULT_ZONE;
    const s = P.cameraSeries(c, now);
    const cutoff = dead ? (c.status === 'maint' ? slotOf(11 + 20 / 60) : c.status === 'lost' ? slotOf(13 + 55 / 60) : 0) : -1;
    const lostMin = Math.max(1, Math.round((now - P.atHour(now, 13 + 55 / 60)) / 60e3));
    const pf = P.camPerf(c, now);
    const res = c.res || '1920×1080', fps = pf.fps + ' fps';
    const metrics = [
      ['計測精度（24時間）', pf.acc != null && !dead ? pf.acc.toFixed(1) + '%' : '—'],
      ['処理負荷', dead || paused ? '—' : `${pct(pf.load)}（上限 ${pf.cap}人/フレーム）`],
      ['処理遅延', dead ? '—' : pf.latency.toFixed(1) + ' s'],
      ['解像度・FPS', dead ? '—・—' : `${res}・${fps}`],
      ['接続', c.status === 'lost' ? `信号断 ${lostMin}分` : c.status === 'maint' ? '整備中' : c.status === 'inactive' ? '未有効化'
        : pf.over ? `高負荷・${P.hhmm(new Date(c.overSince))}から` : pf.load >= P.LOAD_LO ? 'やや高負荷' : '安定'],
      ['AIモデル', 'crowd-count v3.2'],
    ];
    const footer = dead ? (c.status === 'maint' ? '計測停止・11:20から整備中' : c.status === 'lost' ? '13:55からデータなし' : '未有効化') : paused ? `一時停止中 ${n} 人` : `AI計測中 ${n} 人`;
    const covers = c.covers.map(v => {
      const a = v.att && P.byId(v.att), qs = a ? P.queueShares(a) : [];
      const sh = qs.length > 1 ? (qs.find(x => x.cam.code === c.code) || {}).share : null;
      return [v.att ? (a || {}).name || v.att : v.name, v.role + (sh != null ? `・区間 ${pct(sh)}` : '')];
    });
    return `
    <div class="split">
      <div class="l">
        <div class="headrow"><a class="btn" href="#/cams">← すべてのカメラ</a>${P.pill(st.key, st.label, true)}<span class="sp"></span>
          <a class="btn" href="#/cams/${c.code}/edit">カメラを編集</a></div>
        <div class="ttl"><span class="code">${c.code}</span><span class="nm">${esc(c.place)}</span></div>
        <div class="sub">${P.zoneByKey[c.zone].name}・${esc(c.model)}・設置 ${esc(c.installed)}</div>
        <div class="feedbig ${dead ? 'dead' : ''}" id="feed">
          ${dead ? `<div class="deadmsg">${footer}</div>` : `
            ${cd.editZone ? `<div class="zonearea"><svg class="zone" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="${zone.map(p => p.join(',')).join(' ')}"/></svg>
              ${zone.map((p, i) => `<span class="hdl" data-h="${i}" style="left:${p[0]}%;top:${p[1]}%"></span>`).join('')}</div>` : ''}
            ${cd.replay ? '<div class="replay"><i id="rbar"></i></div><div class="rlbl" id="rlbl">再生中</div>' : ''}
            <div class="res">${res}・${fps}</div>`}
          <div class="live ${dead ? 'dead' : paused ? 'paused' : ''}"><i></i>${c.code}・${dead ? st.label : cd.replay ? '再生' : paused ? '一時停止' : 'ライブ'}</div>
        </div>
        ${dead ? '' : `<div class="samplenote">計測エリアのサンプル画角（20人）・${c.code} のライブ計測値: <span data-live-n>${n}</span> 人</div>`}
        <div class="ctlbar">
          <div class="acts">${cd.editZone
            ? '<span>ハンドルをドラッグして計測エリアを調整</span><button data-zone="reset">初期化</button><button data-zone="cancel">キャンセル</button><button class="p" data-zone="save">保存</button>'
            : dead ? '<button class="p" data-reconnect>再接続する</button><button data-ticket>整備チケットを作成</button><button data-replay>直近30分を再生</button>'
              : `<button class="${paused ? 'on' : ''}" data-pause>${paused ? '再開' : '一時停止'}</button><button data-zone="edit">計測エリアを調整</button><button class="${cd.replay ? 'on' : ''}" data-replay>${cd.replay ? '再生を停止' : '直近30分を再生'}</button>`}</div>
          <div class="ft ${dead ? 'dead' : paused ? 'paused' : ''}" id="livelbl">${footer}</div>
        </div>
        <div style="margin-top:24px">
          <div class="eyebrow">カメラ計測人数・本日</div>
          ${bars(s.vals, dead ? -1 : s.current, 140, 6, cutoff)}
          ${dead ? `<div class="chartnote">${c.status === 'maint' ? '11:20からデータなし・カメラ整備中' : c.status === 'lost' ? '13:55からデータなし・近隣カメラで推定中' : 'データなし'}</div>` : ''}
        </div>
      </div>
      <div class="rc">
        <div class="pad"><div class="eyebrow">技術指標</div><div style="margin-top:10px">
          ${metrics.map(([k, v]) => `<div class="kv"><span>${k}</span><b class="${v === '—' || /^(信号断|整備|未有効)/.test(v) ? 'warn' : ''}">${v}</b></div>`).join('')}</div></div>
        <div class="pad"><div class="eyebrow">カメラが担当するエリア</div>
          ${covers.map(([nm, role]) => `<div class="kv cov"><b>${esc(nm)}</b><span>${esc(role)}</span></div>`).join('') || '<div class="sub">未割当</div>'}</div>
        <div class="pad last"><div class="eyebrow">機器ログ</div>
          ${camLogs(c, now, n).map(([t, m]) => `<div class="klog"><time>${t}</time><span>${esc(m)}</span></div>`).join('')}</div>
      </div>
    </div>`;
  }
  function addCamLog(code, text) {
    store.update('camLogs', {}, m => { m[code] = [{ t: P.simNow().getTime(), text }].concat(m[code] || []).slice(0, 10); return m; });
  }

  /* camera form */
  let cf = null;
  const ST_OPTS = { '稼働中': 'ok', '整備中': 'maint', '未有効化': 'inactive', 'フレーム過負荷': 'overload', '信号断': 'lost' };
  /* camera name = the ride it watches + 待機列 (cameras are installed at the queue only) */
  function camPlace(rides, fallback) {
    const a = rides.map(id => P.byId(id)).find(Boolean);
    return a ? `${a.name} 待機列` : (fallback || '待機列カメラ');
  }
  const keepPlace = f => (f.nameCovers && f.nameCovers.length ? f.place : null);   // gate / area cameras keep their own name
  function camFormFrom(code) {
    if (code === 'new') {
      const used = P.cameras().map(c => parseInt(c.code.slice(4), 10));
      let n = 1; while (used.includes(n)) n++;
      return { camId: null, code: 'CAM-' + String(n).padStart(2, '0'), place: '', zone: 'entrance', model: 'AXIS M3086-V', res: '1920×1080', fps: 25,
        installed: `${String(P.simNow().getMonth() + 1).padStart(2, '0')}/${P.simNow().getFullYear()}`, status: '未有効化', rides: [], role: '待機列の計測',
        sens: 70, interval: 5, minConf: 85, alertLost: true, clip: false, edge: true, step: 'info' };
    }
    const c = P.cameras().find(x => x.code === code);
    if (!c) return null;
    return { camId: c.code, code: c.code, place: c.place, zone: c.zone, model: c.model, res: c.res || '1920×1080', fps: c.fps || 25, installed: c.installed,
      status: P.CAM_STATUS[c.status].label, rides: c.covers.filter(v => v.att).map(v => v.att), role: [(c.covers.find(v => v.att) || {}).role].find(r => P.CAM_ROLES.includes(r)) || '待機列の計測',
      sens: c.sens || 70, interval: c.interval || 5, minConf: c.minConf || (c.acc ? Math.round(c.acc) : 85), alertLost: c.alertLost !== false, clip: !!c.clip || c.status === 'lost', edge: c.edge !== false,
      nameCovers: c.covers.filter(v => !v.att), step: 'info' };
  }
  function pageCamForm(code) {
    if (!cf || cf._for !== code) { cf = camFormFrom(code); if (!cf) return '<div class="empty">カメラが見つかりません。</div>'; cf._for = code; }
    const f = cf;
    const covered = f.rides.map(id => P.byId(id)).filter(Boolean);
    const load = covered.reduce((s, a) => s + P.live(a).people, 0);
    const zb = `left:${50 - f.sens * .42}%;top:${50 - f.sens * .34}%;width:${f.sens * .84}%;height:${f.sens * .68}%`;
    const codeOk = /^CAM-\d{2,}$/.test(f.code), dup = P.cameras().some(c => c.code === f.code && c.code !== f.camId);
    const checks = [
      [codeOk && !dup, codeOk ? (dup ? `コード ${f.code}は他のカメラで使用中です` : `コード ${f.code}は使用可能です`) : 'コードは CAM-08 の形式で入力してください'],
      [f.rides.length > 0, f.rides.length ? `アトラクション${f.rides.length}件を担当` : 'アトラクション未割当。計測値は供給されません'],
      [Number(f.minConf) >= 80, Number(f.minConf) >= 80 ? `信頼度しきい値 ${f.minConf}%：適正値です` : '信頼度しきい値は80%以上を推奨します'],
    ];
    const inp = (k, cls, type, extra) => `<input class="fin ${cls}" data-cf="${k}" value="${esc(f[k])}" ${type ? `type="${type}"` : ''} ${extra || ''}>`;
    const seg = (k, vals, labels, sm) => `<div class="seg ${sm ? 'sm' : ''}">${vals.map((v, i) => `<button class="${f[k] === v ? 'on' : ''}" data-cfs="${k}:${v}">${labels ? labels[i] : v}</button>`).join('')}</div>`;
    const stOpts = ['稼働中', '整備中', '未有効化'].concat(['稼働中', '整備中', '未有効化'].includes(f.status) ? [] : [f.status]);
    let body;
    if (f.step === 'info') body = `
      <div class="fgrid">
        <div><div class="flabel b">カメラコード</div>${inp('code', 'mono', '', 'placeholder="CAM-30"')}<div class="hint">ログと映像上に表示されるコードです。</div></div>
        <div class="full"><div class="flabel b">エリア</div>${seg('zone', P.ZONES.map(z => z.key), P.ZONES.map(z => z.name))}</div>
        <div class="full"><div class="flabel b">機器モデル</div>${seg('model', P.CAM_MODELS, null, true)}</div>
        <div><div class="flabel b">解像度</div>${inp('res', 'mono')}</div>
        <div><div class="flabel b">フレームレート（fps）</div>${inp('fps', 'n', 'number')}</div>
        <div><div class="flabel b">設置年月</div>${inp('installed', 'n', '', 'placeholder="08/2026"')}</div>
        <div><div class="flabel b">状態</div>${seg('status', stOpts)}
          <div class="hint">${['稼働中', '整備中', '未有効化'].includes(f.status) ? '手動設定。異常状態はシステムが自動検知します。' : `“${f.status}” はシステムが自動検知した状態です。別の状態を選ぶと上書きされます。`}</div></div>
      </div>`;
    else if (f.step === 'zone') body = `
      <div style="padding-top:20px">
        <div class="eyebrow">映像内の計測エリア</div>
        <div class="sub" style="margin-top:5px">この範囲に入った人だけを計測します。通路が写り込む場合はドラッグして狭めてください。</div>
        <div class="zonebox"><div class="zb" style="${zb}"></div><span class="spec">${esc(f.res)}・${esc(f.fps)} fps・毎${esc(f.interval)} 秒</span><span class="sens">計測エリア ${f.sens}%</span></div>
        <div class="rangerow"><span class="eyebrow" style="white-space:nowrap">計測エリアのカバー率</span><input type="range" min="30" max="100" step="5" value="${f.sens}" data-cf="sens"><span class="v">${f.sens}%</span></div>
        <div style="margin-top:24px;border-top:1px solid var(--div2);padding-top:16px"><div class="eyebrow">カメラが担当するアトラクション</div>
          <div class="sub" style="margin-top:5px">このカメラの計測値を、選んだアトラクションへ供給します。</div>
          <div class="pickwrap">${P.rides().map(a => {
            const on = f.rides.includes(a.id);
            const other = P.camerasForRide(a.id).filter(c => c.code !== f.camId).map(c => c.code);
            return `<div class="pickrow s11 ${on ? 'on' : ''}" data-cfride="${a.id}">${chk(on)}<span class="nochip">${a.number || '–'}</span>
              <div class="bd"><b>${esc(a.name)}</b><small>${esc(a.zone)}</small></div>
              <span class="role ${other.length ? '' : 'acc'}">${other.length ? '担当：' + other.join(', ') : 'カメラなし'}</span></div>`;
          }).join('')}</div></div>
      </div>`;
    else body = `
      <div class="fgrid">
        <div><div class="flabel b">計測周期（秒）</div>${inp('interval', 'n', 'number', 'min="1"')}<div class="hint">周期を短くすると数値は滑らかになりますが、処理負荷は増えます。</div></div>
        <div><div class="flabel b">最低信頼度（%）</div>${inp('minConf', 'n', 'number', 'min="50" max="100"')}<div class="hint">このしきい値を下回るフレームは計測から除外されます。</div></div>
        <div class="full" style="border-top:1px solid var(--div2);padding-top:16px"><div class="eyebrow">機器ルール</div>
          ${[['alertLost', '信号断が60秒を超えたら警告', '機器レベルのアラートに追加し、近隣カメラによる推定へ切り替えます。'],
            ['edge', '端末内で処理（エッジ）', 'センターへ送るのは数値のみ。ゲストの映像は送信しません。'],
            ['clip', '混雑しきい値を超えたら10秒間の映像を保存', '計測値にずれがあったときの照合用。7日後に自動削除されます。']].map(([k, t, h]) =>
            `<div class="chk chkrow" data-cft="${k}"><span class="box sq ${f[k] ? 'on' : ''}">${f[k] ? '✓' : ''}</span><div><b>${t}</b><small>${h}</small></div></div>`).join('')}
        </div>
      </div>`;
    return `
    <div class="split w380">
      <div class="l fp">
        <div class="fhead"><a class="btn" href="${f.camId ? '#/cams/' + f.camId : '#/cams'}">← キャンセル</a><span class="eyebrow">${f.camId ? 'カメラを編集' : '新規カメラ'}</span></div>
        <div class="ttl"><span class="code s22">${esc(f.code)}</span><span class="nm">${esc(camPlace(f.rides, keepPlace(f)))}</span></div>
        <div class="steps">${[['info', '1・機器'], ['zone', '2・計測エリア'], ['rule', '3・処理 & アラート']].map(([k, t]) => `<button class="${f.step === k ? 'on' : ''}" data-cfstep="${k}">${t}</button>`).join('')}</div>
        ${body}
      </div>
      <div class="rc">
        <div class="pad"><div class="eyebrow">映像プレビュー</div>
          <div class="zonebox sm"><div class="zb" style="${zb}"></div><span class="spec">${esc(f.code)}</span></div>
          <div style="margin-top:12px">
            <div class="kv"><span>エリア</span><b>${P.zoneByKey[f.zone].name}</b></div>
            <div class="kv"><span>担当</span><b>${f.rides.length ? f.rides.length + ' 件' : '未割当'}</b></div>
            <div class="kv"><span>役割</span><b>${esc(f.role)}</b></div>
            <div class="kv"><span>計測エリア内</span><b>${covered.length ? load + ' 人' : '—'}</b></div>
          </div></div>
        <div class="pad checks"><div class="eyebrow">保存前チェック</div>
          ${checks.map(([ok, t]) => `<div class="ck ${ok ? '' : 'bad'}"><i>${ok ? '✓' : '!'}</i><span>${t}</span></div>`).join('')}</div>
        <div class="factions">
          <button class="btn acc lg" data-cfsave>${f.camId ? '変更を保存' : 'カメラを作成'}</button>
          <button class="btn lg" data-cftest>接続テスト</button>
          ${f.camId ? '<button class="btn lg link" data-cfremove>カメラを取り外す</button>' : ''}
        </div>
      </div>
    </div>`;
  }
  function saveCamForm() {
    const f = cf;
    if (!/^CAM-\d{2,}$/.test(f.code)) { toast('コードは CAM-08 の形式で入力してください'); f.step = 'info'; render(true); return; }
    if (P.cameras().some(c => c.code === f.code && c.code !== f.camId)) { toast(`コード ${f.code}は他のカメラで使用中です`); return; }
    const covers = (f.nameCovers || []).concat(f.rides.map(att => ({ att, role: f.role })));
    const rec = { place: camPlace(f.rides, keepPlace(f)), zone: f.zone, model: f.model, res: f.res, fps: Number(f.fps) || 25, installed: f.installed, status: ST_OPTS[f.status] || 'ok',
      covers, sens: Number(f.sens), interval: Number(f.interval), minConf: Number(f.minConf), alertLost: f.alertLost, edge: f.edge, clip: f.clip };
    if (f.camId) { saveCamera(f.camId, rec); addCamLog(f.camId, 'カメラ設定を更新'); }
    else {
      store.update('camerasAdded', [], l => l.concat(Object.assign({ code: f.code, acc: 97.0 }, rec)));
      store.update('camerasRemoved', [], l => l.filter(x => x !== f.code));
    }
    P.addLog(`${f.camId ? 'カメラ設定を更新' : 'カメラを追加'}：${f.code}（${rec.place}）`);
    toast(f.camId ? '変更を保存しました' : 'カメラを作成しました');
    const code = f.camId || f.code;
    cf = null;
    location.hash = '#/cams/' + code;
  }

  /* =================== 通知 =================== */
  const ntSt = { q: '', type: 'all', area: 'all', status: 'all', page: 0, asc: false };
  const ntDraft = { q: '', type: 'all', area: 'all', status: 'all' };   // filter panel values, applied on 検索
  const NT_FILTERS = {
    type:   { label: '種類', opts: () => Object.entries(P.NOTIF_TYPES).map(([k, v]) => [k, v.label]) },
    area:   { label: '対象エリア', opts: () => P.AREAS },
    status: { label: '状態', opts: () => [['sending', '送信中'], ['sent', '送信済み'], ['scheduled', '予約'], ['draft', '下書き']] },
  };
  function ntFilterPanel() {
    const dirty = ntDraft.q || ntSt.q || ['type', 'area', 'status'].some(k => ntDraft[k] !== 'all' || ntSt[k] !== 'all');
    const sel = k => `<label class="ff"><span class="fl">${NT_FILTERS[k].label}</span>
      <span class="fsel"><select name="${k}" data-ntdraft="${k}">
        ${[['all', 'すべて']].concat(NT_FILTERS[k].opts()).map(([v, l]) => `<option value="${v}" ${ntDraft[k] === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}
      </select>${icon('chevronD', 16, '', 2)}</span></label>`;
    return `
    <form class="fpanel" id="ntFilter" role="search" autocomplete="off">
      <label class="ff wide"><span class="fl">通知</span>
        <span class="finp">${icon('search', 16)}<input name="q" data-ntdraft="q" value="${esc(ntDraft.q)}" placeholder="タイトル・本文"></span></label>
      ${sel('type')}${sel('area')}${sel('status')}
      <div class="fact">
        <button type="button" class="freset" data-ntreset ${dirty ? '' : 'disabled'}>フィルターを解除</button>
        <button type="submit" class="btn acc round">${icon('search', 15, '', 2.4)}検索</button>
      </div>
    </form>`;
  }
  const KIND = t => { const k = P.NOTIF_TYPES[t]; return `<span class="kind" style="background:${k.bg};color:${k.ink}">${k.label}</span>`; };
  function stLabel(n, now) {
    const s = P.notifStatus(n, now);
    return `<span class="st ${s}"><i></i>${s === 'scheduled' ? '予約・' + P.hhmm(new Date(n.scheduledAt || 0)) : P.STATUS_LABEL[s]}</span>`;
  }
  function pageNotices() {
    const now = P.simNow();
    const all = P.notifications();
    const sentToday = all.filter(n => n.status === 'sent' && new Date(n.sentAt).toDateString() === now.toDateString());
    const q = ntSt.q.trim().toLowerCase();
    let list = all.filter(n => (ntSt.type === 'all' || n.type === ntSt.type) && (ntSt.area === 'all' || n.area === ntSt.area)
      && (ntSt.status === 'all' || P.notifStatus(n, now) === ntSt.status) && (!q || (n.title + ' ' + n.body).toLowerCase().includes(q)));
    const cond = `${ntSt.q ? `・「${esc(ntSt.q)}」` : ''}${['type', 'area', 'status'].filter(k => ntSt[k] !== 'all').map(k => '・' + esc(NT_FILTERS[k].opts().find(o => o[0] === ntSt[k])[1])).join('')}`;
    list.sort((a, b) => ntSt.asc ? a.createdAt - b.createdAt : b.createdAt - a.createdAt);
    const PER = ntSt.per || 10, pages = Math.max(1, Math.ceil(list.length / PER));
    ntSt.page = Math.min(ntSt.page, pages - 1);
    const from = ntSt.page * PER, slice = list.slice(from, from + PER);
    const kpi = (label, v, s) => `<div class="cell kpi n"><div class="eyebrow" style="font-weight:700;letter-spacing:.07em">${label}</div><div class="v">${v}</div><div class="s" style="font-size:11.5px">${s}</div></div>`;
    return `
    <div class="kpis">
      ${kpi('本日の送信', sentToday.length, `うち ${sentToday.filter(n => n.auto).length} 件はAI自動送信`)}
      ${kpi('到達ゲスト', fmt(sentToday.reduce((s, n) => s + (n.reach || 0), 0)), 'アプリ表示回数')}
      ${kpi('AI自動送信', all.filter(n => n.auto).length, 'カメラのしきい値で起動')}
      ${kpi('送信待ち', pendingNotifs().length, '下書きと予約')}
    </div>
    <div class="lhead2"><div><h2>通知一覧</h2>
        <div class="lsub">${all.length}件・送信済み ${all.filter(n => n.status === 'sent').length}件・予約 ${all.filter(n => n.status === 'scheduled').length}件・下書き ${all.filter(n => n.status === 'draft').length}件</div></div>
      <div class="lbtns"><label class="radsel" title="AIが自動送信する通知を受け取るゲストの範囲（アトラクションからの距離）">${icon('tmap', 14)}AI通知の範囲
          <span class="psize"><select data-radius aria-label="AI通知の範囲">${[100, 200, 300, 500].map(m => `<option value="${m}" ${P.nearRadius() === m ? 'selected' : ''}>半径${m}m</option>`).join('')}</select>${icon('chevronD', 14, '', 2)}</span></label>
        <button class="btn round ghostline" data-nsort title="並び順を切り替え">${icon('swap', 14, '', 2.2)}${ntSt.asc ? '古い順' : '新しい順'}</button>
        <a class="btn acc round" href="#/notices/new">${icon('plus', 15, '', 2.4)}通知を作成</a></div></div>
    ${ntFilterPanel()}
    <div class="tcard">
    ${cond ? `<div class="tcond">絞り込み：${cond.slice(1)}<span>${list.length}件</span></div>` : ''}
    <div class="tblwrap">
      <div class="grid-h nt-g"><div>通知</div><div>対象エリア</div><div>配信チャネル</div><div>状態</div><div class="r">到達数</div><div></div></div>
      ${list.length ? '' : '<div class="empty">条件に一致する通知はありません。</div>'}
      ${slice.map(n => `<div class="grid-r nt-g" data-go="#/notices/${n.id}">
        <div style="min-width:0"><div class="pills">${KIND(n.type)}<span class="auto ${n.auto ? 'on' : ''}">${n.auto ? 'AI自動' : '手動'}</span></div>
          <div class="tt noi18n">${esc(n.title)}</div><div class="bd noi18n">${esc(n.body)}</div></div>
        <div class="sm">${n.att && P.byId(n.att) ? `<span class="nearlbl">${icon('tmap', 12)}${esc(P.byId(n.att).name)}周辺</span><small class="nearr">半径${P.nearRadius()}m</small>` : esc(P.areaName(n.area))}</div><div class="sm">${P.CHANNELS[n.channel]}</div>
        <div>${stLabel(n, now)}</div><div class="r" style="font-weight:800">${n.reach ? fmt(n.reach) : '—'}</div>${rowActs('notice', n.id, window.PPi18n && PPi18n.lang === 'vi' ? n.id : n.title, '#/notices/' + n.id)}</div>`).join('')}
    </div>
    ${tableFooter(list.length, ntSt.page, pages, PER, 'np', 'notice')}
    </div>`;
  }

  let nf = null;
  function pageNoticeForm(id) {
    if (!nf || nf._for !== id) {
      const src = id === 'new' ? Object.assign({ id: null, type: 'crowd', auto: false, title: '', body: '', area: 'all', channel: 'both', status: 'new' }, store.get('noticePrefill', null) || {})
        : P.notifications().find(n => n.id === id);
      if (!src) return '<div class="empty">通知が見つかりません。</div>';
      store.set('noticePrefill', null);
      nf = Object.assign({ _for: id, _saved: false }, src);
    }
    const f = nf;
    const opts = (list, key, cls) => list.map(([k, n]) => `<button class="opt ${cls || ''} ${f[key] === k ? 'on' : ''}" data-nf="${key}:${k}">${n}</button>`).join('');
    return `
    <div class="split w352">
      <div class="l np">
        <div class="nf-top"><a class="btn gray" href="#/notices">← 通知一覧</a>${f._saved ? '<span class="saved">保存しました</span>' : ''}
          ${f.status === 'sent' ? `<span class="sub" style="margin:0">送信済み（${P.hhmm(new Date(f.sentAt))}）・内容を変えて再送信できます</span>` : ''}</div>
        <div class="nf-l flabel">通知の種類</div>
        <div class="nf-b b18 opts">${opts(Object.entries(P.NOTIF_TYPES).map(([k, v]) => [k, v.label]), 'type', 'k')}</div>
        <div class="nf-l t6 flabel">タイトル</div>
        <div class="nf-b"><input class="fin" data-nfin="title" value="${esc(f.title)}" maxlength="60" placeholder="例: メガコースターが混雑しています"></div>
        <div class="nf-l t0 flabel">本文</div>
        <div class="nf-b b18"><textarea class="fin ta" data-nfin="body" rows="3" maxlength="200" placeholder="例: 待ち時間は45分です。空いているアトラクションはいかがですか。">${esc(f.body)}</textarea></div>
        <div class="nf-split">
          <div><div class="flabel">対象エリア</div><div class="opts">${opts(P.AREAS, 'area')}</div></div>
          <div><div class="flabel">配信チャネル</div><div class="opts">${opts(Object.entries(P.CHANNELS), 'channel')}</div></div>
        </div>
        <div class="nf-auto">
          <div class="chk" data-nfauto>${chk(f.auto)}<div><b>しきい値超過時にAIが自動送信</b><small class="m4">カメラが収容率75%超を検知すると、この通知が自動で送信されます。</small></div></div>
          <div class="nf-sched"><span class="chk" data-nfsched style="align-items:center;gap:8px">${chk(f.status === 'scheduled')}予約送信</span>
            <input type="time" data-nfin="time" value="${f.scheduledAt ? P.hhmm(new Date(f.scheduledAt)) : '19:30'}" ${f.status === 'scheduled' ? '' : 'disabled'}></div>
        </div>
        <div class="nf-acts">
          <button class="btn acc lg" data-nfsave="send">${f.status === 'scheduled' ? '予約を保存' : '今すぐ送信'}</button>
          <button class="btn gray lg" data-nfsave="draft">下書き保存</button>
          <a class="btn ghost lg" href="#/notices">キャンセル</a>
          ${f.id && f.status !== 'sent' ? '<button class="btn ghost lg" data-nfdel style="margin-left:auto;color:var(--hot-d)">削除</button>' : ''}
        </div>
      </div>
      <div class="rc">
        <div class="pvhead flabel">アプリでのプレビュー</div>
        <div class="pvwrap"><div class="pvframe"><div class="pvcard">
          <div class="bh"><i>${icon('tbell', 12, '', 2.4)}</i>浜名湖パルパル<time>たった今</time></div>
          <h4 id="pv-t" class="${f.title ? 'noi18n' : ''}">${esc(f.title) || '通知のタイトルがここに表示されます'}</h4><p id="pv-b" class="${f.body ? 'noi18n' : ''}">${esc(f.body) || 'ゲストへ送る本文。'}</p>
          <div class="kw">${KIND(f.type)}</div></div></div></div>
        <div class="pvkv">
          <div class="kv"><span>対象エリア</span><b>${esc(P.areaName(f.area))}</b></div>
          <div class="kv"><span>配信チャネル</span><b>${P.CHANNELS[f.channel]}</b></div>
          <div class="kv"><span>推定到達数</span><b>約 ${fmt(P.estimateReach(f.area))} 人</b></div>
        </div>
      </div>
    </div>`;
  }
  function saveNotice(mode) {
    const f = nf;
    if (!f.title.trim()) { toast('タイトルを入力してください'); const t = document.querySelector('[data-nfin="title"]'); if (t) t.focus(); return; }
    const now = P.simNow();
    const n = Object.assign({}, f); delete n._for; delete n._saved; delete n._time;
    if (!n.id) { n.id = P.nextNoticeId(); n.createdAt = now.getTime(); }
    if (f._time) { const [h, m] = f._time.split(':').map(Number); n.scheduledAt = P.atHour(now, h + m / 60).getTime(); }
    if (mode === 'draft') {
      if (n.status !== 'scheduled') n.status = 'draft';
      P.saveNotification(n);
      Object.assign(nf, { id: n.id, status: n.status, createdAt: n.createdAt, _saved: true });
      nf._for = n.id; history.replaceState(null, '', '#/notices/' + n.id);
      render(true); return;
    }
    if (n.status === 'scheduled') {
      if (!n.scheduledAt || n.scheduledAt <= now.getTime()) n.scheduledAt = (n.scheduledAt || P.atHour(now, 19.5).getTime()) + (n.scheduledAt && n.scheduledAt <= now.getTime() ? 864e5 : 0);
      P.saveNotification(n);
      toast(`${P.hhmm(new Date(n.scheduledAt))}に送信を予約しました`);
    } else {
      if (f.status === 'sent') { n.id = P.nextNoticeId(); n.createdAt = now.getTime(); }
      Object.assign(n, { status: 'sent', sentAt: now.getTime(), reach: P.estimateReach(n.area, now) });
      P.saveNotification(n);
      P.addLog(`通知を送信：${n.title}（${P.areaName(n.area)}・${P.CHANNELS[n.channel]}）`);
      toast('通知を送信しました');
    }
    nf = null;
    Object.assign(ntSt, { q: '', type: 'all', area: 'all', status: 'all', page: 0, asc: false });
    Object.assign(ntDraft, { q: '', type: 'all', area: 'all', status: 'all' });
    location.hash = '#/notices';
  }

  /* =================== list row actions: edit modal / delete confirm =================== */
  function rowActs(kind, id, label, viewHref) {
    return `<div class="acts-cell">
      ${viewHref ? `<a class="ia" href="${viewHref}" data-mview title="詳細" aria-label="${esc(label)}の詳細">${icon('eye', 16)}</a>` : ''}
      <button class="ia" data-medit="${kind}:${esc(id)}" title="編集" aria-label="${esc(label)}を編集">${icon('pencil', 16)}</button>
      <button class="ia del" data-mdel="${kind}:${esc(id)}" title="削除" aria-label="${esc(label)}を削除">${icon('trash', 16)}</button>
    </div>`;
  }
  let md = null;   // { mode: 'edit'|'delete', kind, id, f, err }
  const $modal = document.getElementById('modal');
  const splitKey = s => { const i = s.indexOf(':'); return [s.slice(0, i), s.slice(i + 1)]; };
  const CAM_STATUS_LABELS = ['稼働中', '整備中', '未有効化'];

  function openEdit(kind, id) {
    let f;
    if (kind === 'ride') {
      const a = P.byId(id); if (!a) return;
      const c = a.cfg;
      f = { name: a.name, zoneKey: a.zoneKey, status: c.status || (P.closedReason(a) ? REASON_STATUS(P.closedReason(a)) : '稼働中'),
        cap: c.cap, seats: c.seats, cycle: c.cycle, thMid: c.thMid, thBusy: c.thBusy, desc: c.desc || '' };
    } else if (kind === 'cam') {
      const c = P.cameras().find(x => x.code === id); if (!c) return;
      f = { place: c.place, role: [(c.covers.find(v => v.att) || {}).role].find(r => P.CAM_ROLES.includes(r)) || '待機列の計測',
        nameCovers: c.covers.filter(v => !v.att), zone: c.zone, model: c.model, status: P.CAM_STATUS[c.status].label, fps: c.fps || 25 };
    } else {
      const n = P.notifications().find(x => x.id === id); if (!n) return;
      f = { type: n.type, title: n.title, body: n.body, area: n.area, channel: n.channel };
    }
    md = { mode: 'edit', kind, id, f, err: '' };
    renderModal(true);
  }
  function openDelete(kind, id) { md = { mode: 'delete', kind, id }; renderModal(true); }
  function closeModal() {
    const back = document.querySelector('.mback');
    md = null; $modal.innerHTML = '';
    if (closeModal.opener && document.contains(closeModal.opener)) closeModal.opener.focus();
    if (back) render(true);
  }

  function editBody() {
    const { kind, f } = md;
    const inp = (k, type, extra) => `<input class="fin n" data-mf="${k}" value="${esc(f[k])}" ${type ? `type="${type}"` : ''} ${extra || ''}>`;
    const seg = (k, vals, labels, sm) => `<div class="seg ${sm ? 'sm' : ''}">${vals.map((v, i) => `<button type="button" class="${String(f[k]) === String(v) ? 'on' : ''}" data-mfs="${k}:${v}">${labels ? labels[i] : v}</button>`).join('')}</div>`;
    const opts = (k, list) => `<div class="opts">${list.map(([v, l]) => `<button type="button" class="opt ${f[k] === v ? 'on' : ''}" data-mfs="${k}:${v}">${l}</button>`).join('')}</div>`;
    if (kind === 'ride') {
      const thr = Number(f.seats) > 0 && Number(f.cycle) > 0 ? Math.round(Number(f.seats) * 60 / Number(f.cycle)) : 0;
      return `<div class="mgrid">
        <div class="full"><div class="flabel b">アトラクション名</div>${inp('name', '', 'maxlength="60"')}</div>
        <div class="full"><div class="flabel b">エリア</div>${seg('zoneKey', P.ZONES.map(z => z.key), P.ZONES.map(z => z.name), true)}</div>
        <div class="full"><div class="flabel b">稼働状態</div>${seg('status', ['稼働中', '整備中', '休止中', '未開業'], null, true)}</div>
        <div><div class="flabel b">待機列の収容人数（人）</div>${inp('cap', 'number', 'min="1"')}</div>
        <div><div class="flabel b">1回あたりの座席数</div>${inp('seats', 'number', 'min="1"')}</div>
        <div><div class="flabel b">1回あたりの時間（分）</div>${inp('cycle', 'number', 'min="0.5" step="0.5"')}</div>
        <div><div class="flabel b">処理能力</div><div class="mcalc" id="mthr">${thr ? thr + ' 人／時' : '—'}</div></div>
        <div><div class="flabel b">レベル “やや混雑” （%）</div>${inp('thMid', 'number', 'min="1" max="99"')}</div>
        <div><div class="flabel b">レベル “混雑” （%）</div>${inp('thBusy', 'number', 'min="1" max="150"')}</div>
        <div class="full"><div class="flabel b">ゲストアプリ用の短い説明</div><textarea class="fin ta2" data-mf="desc" rows="2">${esc(f.desc)}</textarea></div>
      </div>`;
    }
    if (kind === 'cam') {
      const stList = CAM_STATUS_LABELS.includes(f.status) ? CAM_STATUS_LABELS : CAM_STATUS_LABELS.concat(f.status);
      return `<div class="mgrid">
        <div class="full"><div class="flabel b">エリア</div>${seg('zone', P.ZONES.map(z => z.key), P.ZONES.map(z => z.name), true)}</div>
        <div class="full"><div class="flabel b">機器モデル</div>${seg('model', P.CAM_MODELS, null, true)}</div>
        <div class="full"><div class="flabel b">状態</div>${seg('status', stList, null, true)}</div>
        <div><div class="flabel b">フレームレート（fps）</div>${inp('fps', 'number', 'min="1" max="60"')}</div>
      </div>`;
    }
    const n = P.notifications().find(x => x.id === md.id) || {};
    return `${n.status === 'sent' ? '<div class="mnote">送信済みの通知です。修正内容は履歴とアプリのお知らせ一覧に反映されます（再送信はされません）。</div>' : ''}
      <div class="mgrid">
        <div class="full"><div class="flabel b">通知の種類</div>${opts('type', Object.entries(P.NOTIF_TYPES).map(([k, v]) => [k, v.label]))}</div>
        <div class="full"><div class="flabel b">タイトル</div>${inp('title', '', 'maxlength="60"')}</div>
        <div class="full"><div class="flabel b">本文</div><textarea class="fin ta2" data-mf="body" rows="3" maxlength="200">${esc(f.body)}</textarea></div>
        <div class="full"><div class="flabel b">対象エリア</div>${opts('area', P.AREAS)}</div>
        <div class="full"><div class="flabel b">配信チャネル</div>${opts('channel', Object.entries(P.CHANNELS))}</div>
      </div>`;
  }
  function deleteText() {
    const { kind, id } = md;
    if (kind === 'ride') {
      const a = P.byId(id), cams = P.camerasForRide(id).map(c => c.code);
      return { title: 'アトラクションを削除しますか？', name: a ? a.name : id,
        body: 'ゲストアプリの一覧・マップ・AI提案からも表示されなくなります。' + (cams.length ? `割り当て中のカメラ（${cams.join('・')}）は削除されず、担当から外れます。` : '') };
    }
    if (kind === 'cam') {
      const c = P.cameras().find(x => x.code === id) || { place: '', covers: [] };
      const rides = c.covers.filter(v => v.att).map(v => (P.byId(v.att) || {}).name).filter(Boolean);
      return { title: 'カメラを取り外しますか？', name: `${id} ${c.place}`,
        body: rides.length ? `担当しているアトラクション（${rides.join('、')}）の計測は停止します。` : 'このカメラの計測データは今後記録されません。' };
    }
    const n = P.notifications().find(x => x.id === id) || {};
    return { title: '通知を削除しますか？', name: n.title || id,
      body: n.status === 'sent' ? '送信履歴から削除され、ゲストアプリのお知らせ一覧からも表示されなくなります。' : n.status === 'scheduled' ? '予約は取り消され、送信されません。' : '下書きを削除します。' };
  }
  function renderModal(focusFirst) {
    if (!md) { $modal.innerHTML = ''; return; }
    if (md.mode === 'toggle') {
      const a = P.byId(md.id), l = P.live(a);
      const closing = !l.closed;
      const from = closing ? '稼働中' : l.label, to = closing ? '休止中' : '稼働中';
      const cams = P.camerasForRide(a.id).length;
      const effects = closing
        ? [`ゲストアプリで「休止中」と表示され、待ち時間・経路案内・AI提案の対象から外れます。`,
           a.cfg.notifyGuest ? `周辺${P.nearRadius()}m以内のゲストに、AIが整備・休止のお知らせを自動送信します。` : 'ゲストへの自動通知はオフに設定されています。',
           l.people ? `現在、待機列に${l.people}人が並んでいます。スタッフによる案内をお願いします。` : '']
        : [`ゲストアプリで待ち時間の表示と経路案内を再開します。`,
           cams ? `割り当て済みのカメラ（${cams}台）で計測を再開します。` : 'カメラが未割当のため、待ち時間は「カメラ未設置」と表示されます。'];
      $modal.innerHTML = `<div class="mback" data-mback><div class="modal sm scIn" role="alertdialog" aria-modal="true" aria-labelledby="mt" aria-describedby="md">
        <div class="mbody confirm">
          <div class="cicon ${closing ? '' : 'ok'}">${icon(closing ? 'pause' : 'play', 18)}</div>
          <h2 id="mt">${closing ? '運行を休止しますか？' : '運行を再開しますか？'}</h2>
          <p id="md"><b>「${esc(a.name)}」</b></p>
          <div class="stchg"><span class="pill sm k-${closing ? 'free' : 'maint'}">${esc(from)}</span>${icon('arrowR', 14, '', 2.2)}<span class="pill sm k-${closing ? 'maint' : 'free'}">${to}</span></div>
          <ul class="effects">${effects.filter(Boolean).map(t => `<li>${esc(t)}</li>`).join('')}</ul>
        </div>
        <div class="mfoot"><button class="btn lg" data-mclose>キャンセル</button>
          <button class="btn lg ${closing ? 'danger' : 'acc'}" data-mtoggle>${closing ? '休止にする' : '再開する'}</button></div>
      </div></div>`;
      if (focusFirst) $modal.querySelector('[data-mclose]').focus();
      return;
    }
    if (md.mode === 'delete') {
      const t = deleteText();
      $modal.innerHTML = `<div class="mback" data-mback><div class="modal sm scIn" role="alertdialog" aria-modal="true" aria-labelledby="mt" aria-describedby="md">
        <div class="mbody confirm">
          <div class="cicon">${icon('trash', 20)}</div>
          <h2 id="mt">${t.title}</h2>
          <p id="md"><b class="${md.kind === 'notice' ? 'noi18n' : ''}">「${esc(t.name)}」</b><br>${esc(t.body)}この操作は取り消せません。</p>
        </div>
        <div class="mfoot"><button class="btn lg" data-mclose>キャンセル</button><button class="btn lg danger" data-mconfirm>削除する</button></div>
      </div></div>`;
      if (focusFirst) $modal.querySelector('[data-mclose]').focus();
      return;
    }
    const titles = { ride: 'アトラクションを編集', cam: 'カメラを編集', notice: '通知を編集' };
    const heading = md.kind === 'ride' ? (P.byId(md.id) || {}).name : md.kind === 'cam' ? md.id : md.id;
    $modal.innerHTML = `<div class="mback" data-mback><form class="modal scIn" role="dialog" aria-modal="true" aria-labelledby="mt" novalidate>
      <div class="mhead"><div><div class="eyebrow">${titles[md.kind]}</div><h2 id="mt">${esc(heading)}</h2></div>
        <button type="button" class="mx" data-mclose aria-label="閉じる">${icon('x', 18)}</button></div>
      <div class="mbody">${editBody()}${md.err ? `<div class="merr" role="alert">${esc(md.err)}</div>` : ''}</div>
      <div class="mfoot">
        <a class="btn lg ghost" href="${md.kind === 'ride' ? '#/rides/' + md.id + '/edit' : md.kind === 'cam' ? '#/cams/' + md.id + '/edit' : '#/notices/' + md.id}" data-mfull style="margin-right:auto">詳細な編集画面へ</a>
        <button type="button" class="btn lg" data-mclose>キャンセル</button><button type="submit" class="btn lg acc">保存</button>
      </div>
    </form></div>`;
    if (focusFirst) { const i = $modal.querySelector('input.fin'); if (i) i.focus(); }
  }
  function saveEdit() {
    const { kind, id, f } = md;
    if (kind === 'ride') {
      if (!String(f.name).trim()) return fail('アトラクション名を入力してください');
      if (!(Number(f.seats) > 0 && Number(f.cycle) > 0 && Number(f.cap) > 0)) return fail('収容人数・座席数・1回あたりの時間は1以上で入力してください');
      if (Number(f.thBusy) <= Number(f.thMid)) return fail('しきい値「混雑」は「やや混雑」より大きい必要があります');
      store.update('rideEdits', {}, e => {
        e[id] = Object.assign({}, e[id], { name: String(f.name).trim(), zoneKey: f.zoneKey, status: f.status, cap: +f.cap, seats: +f.seats, cycle: +f.cycle,
          thMid: +f.thMid, thBusy: +f.thBusy, desc: f.desc });
        return e;
      });
      P.addLog(`アトラクションを更新：${String(f.name).trim()}`);
    } else if (kind === 'cam') {
      const c = P.cameras().find(x => x.code === id);
      const rides = c.covers.filter(v => v.att).map(v => v.att);
      saveCamera(id, { place: camPlace(rides, keepPlace(f)), zone: f.zone, model: f.model, status: ST_OPTS[f.status] || 'ok', fps: Number(f.fps) || 25 });
      addCamLog(id, 'カメラ設定を更新');
      P.addLog(`カメラ設定を更新：${id}`);
    } else {
      if (!String(f.title).trim()) return fail('タイトルを入力してください');
      const n = P.notifications().find(x => x.id === id);
      P.saveNotification(Object.assign({}, n, { type: f.type, title: String(f.title).trim(), body: f.body, area: f.area, channel: f.channel }));
    }
    closeModal();
    toast('変更を保存しました');
  }
  function fail(msg) {
    md.err = msg;
    renderModal(false);
    const e = $modal.querySelector('.merr'); if (e) e.scrollIntoView({ block: 'nearest' });
  }
  function confirmDelete() {
    const { kind, id } = md;
    const t = deleteText();
    if (kind === 'ride') {
      const custom = store.get('ridesAdded', []).some(r => r.id === id);
      P.cameras().forEach(c => setCamCovers(c.code, id, false));
      if (custom) store.update('ridesAdded', [], l => l.filter(r => r.id !== id));
      else store.update('ridesRemoved', [], l => l.includes(id) ? l : l.concat(id));
      P.addLog(`アトラクションを削除：${t.name}`);
    } else if (kind === 'cam') {
      store.update('camerasRemoved', [], l => l.includes(id) ? l : l.concat(id));
      store.update('camerasAdded', [], l => l.filter(c => c.code !== id));
      P.addLog(`カメラを取り外し：${id}`);
    } else {
      store.update('notifications', [], l => l.filter(n => n.id !== id));
    }
    closeModal();
    toast(kind === 'cam' ? `${id} を取り外しました` : '削除しました');
  }
  $modal.addEventListener('input', e => {
    const k = e.target.dataset.mf;
    if (!k || !md) return;
    md.f[k] = e.target.value;
    if (md.kind === 'ride' && (k === 'seats' || k === 'cycle')) {
      const thr = Number(md.f.seats) > 0 && Number(md.f.cycle) > 0 ? Math.round(Number(md.f.seats) * 60 / Number(md.f.cycle)) : 0;
      const el = document.getElementById('mthr'); if (el) el.textContent = thr ? thr + ' 人／時' : '—';
    }
  });
  $modal.addEventListener('submit', e => { e.preventDefault(); if (md && md.mode === 'edit') saveEdit(); });
  $modal.addEventListener('mousedown', e => { if (e.target.hasAttribute('data-mback')) closeModal(); });
  // capture phase: row icons must not trigger the row's own navigation
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-medit],[data-mdel],[data-mclose],[data-mfs],[data-mconfirm],[data-mfull],[data-rtoggle],[data-mtoggle]');
    if (!el) return;
    const d = el.dataset;
    if (d.rtoggle) {                                                      // 運行状態 switch → confirm first
      e.preventDefault(); e.stopPropagation();
      closeModal.opener = el;
      md = { mode: 'toggle', kind: 'ride', id: d.rtoggle };
      renderModal(true);
      return;
    }
    if ('mtoggle' in d) {
      e.preventDefault(); e.stopPropagation();
      const a = P.byId(md.id), closed = !!P.closedReason(a);
      store.update('rideEdits', {}, x => { x[a.id] = Object.assign({}, x[a.id], { status: closed ? '稼働中' : '休止中' }); return x; });
      P.addLog(`${closed ? '運行再開' : '運行停止'}：${a.name}`);
      closeModal();
      toast(closed ? `${a.name}の運行を再開しました` : `${a.name}を休止にしました`);
      return;
    }
    if ('mfull' in d) { md = null; $modal.innerHTML = ''; return; }        // let the link navigate
    e.preventDefault(); e.stopPropagation();
    if (d.medit || d.mdel) { closeModal.opener = el; const [k, id] = splitKey(d.medit || d.mdel); d.medit ? openEdit(k, id) : openDelete(k, id); return; }
    if ('mclose' in d) { closeModal(); return; }
    if ('mconfirm' in d) { confirmDelete(); return; }
    if (d.mfs && md) { const [k, v] = splitKey(d.mfs); md.f[k] = v; renderModal(false); const b = $modal.querySelector(`[data-mfs="${CSS.escape(d.mfs)}"]`); if (b) b.focus(); }
  }, true);
  document.addEventListener('keydown', e => {
    if (!md) return;
    if (e.key === 'Escape') { e.preventDefault(); closeModal(); return; }
    if (e.key === 'Tab') {                                     // keep focus inside the dialog
      const f = [...$modal.querySelectorAll('button, [href], input, textarea')].filter(x => !x.disabled);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });

  /* =================== routing =================== */
  const NAV = [['dash', 'dash', '概況'], ['rides', 'tlist', 'アトラクション'], ['cams', 'cam', 'AIカメラ'], ['notices', 'tbell', '通知']];
  function route() {
    const h = location.hash.replace(/^#\/?/, '').split('?')[0];
    const [name, arg, sub] = h.split('/');
    return { name: name || 'dash', arg, sub };
  }
  function resolve(r) {
    if (r.name === 'rides') {
      if (r.arg === 'new') return ['アトラクションを追加', () => pageRideForm('new')];
      if (r.arg && r.sub === 'edit') return ['アトラクションを編集', () => pageRideForm(r.arg)];
      if (r.arg) return ['アトラクション詳細', () => pageRide(r.arg)];
      return ['アトラクション一覧', pageRides];
    }
    if (r.name === 'cams') {
      if (r.arg === 'new') return ['カメラを追加', () => pageCamForm('new')];
      if (r.arg && r.sub === 'edit') return ['カメラを編集', () => pageCamForm(r.arg)];
      if (r.arg) return ['カメラ詳細', () => pageCam(r.arg)];
      return ['AIカメラの状態', pageCams];
    }
    if (r.name === 'notices') {
      if (r.arg) return [r.arg === 'new' ? '通知の作成' : '通知の編集', () => pageNoticeForm(r.arg)];
      return ['ゲストへの通知', pageNotices];
    }
    return ['リアルタイム概況', pageDash];
  }
  function render(keepScroll) {
    const r = route();
    const y = window.scrollY;
    const [title, fn] = resolve(r);
    document.getElementById('title').textContent = title;
    document.title = title + '｜パルパル AIカメラ運用';
    const focus = document.activeElement && document.activeElement.id === 'rq' ? document.activeElement.selectionStart : null;
    $page.innerHTML = fn();
    if (focus != null) { const q = document.getElementById('rq'); if (q) { q.focus(); q.setSelectionRange(focus, focus); } }
    const active = ['rides', 'cams', 'notices'].includes(r.name) ? r.name : 'dash';
    document.getElementById('nav').innerHTML = NAV.map(([k, ic, label]) =>
      `<a href="#/${k}" class="${active === k ? 'on' : ''}">${icon(ic, 17)}<span>${label}</span></a>`).join('');
    document.getElementById('date').textContent = P.dateLabel(P.simNow());
    if (keepScroll) window.scrollTo(0, y);
  }
  window.addEventListener('hashchange', () => {
    const r = route();
    if (!(r.name === 'rides' && (r.arg === 'new' || r.sub === 'edit'))) rf = null;
    if (!(r.name === 'cams' && (r.arg === 'new' || r.sub === 'edit'))) cf = null;
    if (!(r.name === 'notices' && r.arg)) nf = null;
    if (cd.replay) stopReplay(true);
    render(false); window.scrollTo(0, 0);
  });

  /* =================== interactions =================== */
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-go],[data-act],[data-skip],[data-rfil],[data-rfreset],[data-cmreset],[data-ntreset],[data-rp],[data-cz],[data-cs],[data-ca],[data-cp],[data-export],[data-staff],[data-notify],[data-rfstep],[data-rfs],[data-rfcam],[data-rft],[data-rfsave],[data-rfdraft],[data-rfstop],[data-cfstep],[data-cfs],[data-cfride],[data-cft],[data-cfsave],[data-cftest],[data-cfremove],[data-pause],[data-zone],[data-replay],[data-reconnect],[data-ticket],[data-nt],[data-np],[data-nsort],[data-nf],[data-nfauto],[data-nfsched],[data-nfsave],[data-nfdel],[data-toast]');
    if (!el) return;
    const d = el.dataset;
    const closeDD = () => { const dd = el.closest('details'); if (dd) dd.open = false; };
    if (d.go) { location.hash = d.go; return; }
    if (d.toast) { toast(d.toast); return; }
    if (d.act || d.skip) {
      const key = d.act || d.skip;
      const al = alerts(P.simNow()).find(a => a.key === key);
      store.update('dismissed', {}, m => { m[key] = P.simNow().getTime(); return m; });
      if (d.act && al) { P.addLog(al.action); toast(al.code ? '保守チームへ点検を依頼しました' : 'スタッフ配置を記録しました'); }
      return;
    }
    // ride list
    if ('ntreset' in d) { Object.assign(ntSt, { q: '', type: 'all', area: 'all', status: 'all', page: 0 }); Object.assign(ntDraft, { q: '', type: 'all', area: 'all', status: 'all' }); render(true); return; }
    if ('cmreset' in d) { Object.assign(camSt, { q: '', zone: 'all', status: 'all', att: 'all', page: 0 }); Object.assign(camDraft, { q: '', zone: 'all', status: 'all', att: 'all' }); render(true); return; }
    if ('rfreset' in d) { Object.assign(rideSt, { zone: 'all', crowd: 'all', op: 'all', q: '', page: 0 }); Object.assign(rideDraft, { zone: 'all', crowd: 'all', op: 'all', q: '' }); render(true); return; }
    if (d.rp) { rideSt.page = +d.rp; render(true); return; }
    if (d.staff) { const a = P.byId(d.staff); P.addLog(`${a.zone}から${a.name}入口へスタッフ2名を配置`); toast('スタッフ配置を記録しました'); return; }
    if (d.notify) {
      const a = P.byId(d.notify), l = P.live(a), alt = P.alternatives(a, 1)[0];
      store.set('noticePrefill', { type: 'crowd', area: a.zoneKey, channel: 'both', title: `${a.name}が混雑しています`,
        body: `待ち時間は${l.wait}分です。` + (alt ? `空いている${alt.a.name}はいかがですか。` : '') });
      location.hash = '#/notices/new'; return;
    }
    // ride form
    if (d.rfstep) { rf.step = d.rfstep; render(true); return; }
    if (d.rfs) { const [k, v] = d.rfs.split(':'); rf[k] = v; render(true); return; }
    if (d.rfcam) { rf.cams = rf.cams.includes(d.rfcam) ? rf.cams.filter(x => x !== d.rfcam) : rf.cams.concat(d.rfcam); render(true); return; }
    if (d.rft) { rf[d.rft] = !rf[d.rft]; render(true); return; }
    if ('rfsave' in d) { saveRideForm(); return; }
    if ('rfdraft' in d) {
      if (rf.rideId) { toast('下書きを保存しました（公開内容は変わりません）'); store.update('rideDrafts', {}, x => { x[rf.rideId] = Object.assign({}, rf); return x; }); }
      else { store.set('rideDraft', Object.assign({}, rf, { _for: undefined })); toast('下書きを保存しました'); }
      return;
    }
    if ('rfstop' in d) {
      const a = P.byId(rf.rideId);
      store.update('rideEdits', {}, x => { x[a.id] = Object.assign({}, x[a.id], { status: '休止中' }); return x; });
      P.addLog(`運行停止：${a.name}`); toast(`${a.name}を運行停止にしました`);
      rf = null; location.hash = '#/rides/' + a.id; return;
    }
    // cameras
    if (d.cz) { camSt.zone = d.cz; camSt.page = 0; render(true); return; }
    if (d.cs) { camSt.status = d.cs; camSt.page = 0; render(true); return; }
    if (d.ca) { closeDD(); camSt.att = d.ca; camSt.page = 0; render(true); return; }
    if (d.cp) { camSt.page = +d.cp; render(true); return; }
    if ('export' in d) {
      const now = P.simNow();
      const rows = [['カメラコード', 'アトラクション', 'エリア', '状態', '計測人数', '計測精度', '機器モデル', '担当']].concat(P.cameras().map(c => {
        const n = P.cameraCount(c, now);
        return [c.code, c.covers.filter(v => v.att && P.byId(v.att)).map(v => P.byId(v.att).name).join('・') || c.place, P.zoneByKey[c.zone].name, P.CAM_STATUS[c.status].label, n == null ? '' : n, c.acc != null ? c.acc + '%' : '', c.model,
          c.covers.map(v => v.att ? (P.byId(v.att) || {}).name : v.name).join(' / ')];
      }));
      download(`camera-report-${P.hhmm(now).replace(':', '')}.csv`, rows.map(r => r.map(csv).join(',')).join('\r\n'));
      toast('カメラレポートを出力しました'); return;
    }
    if ('pause' in d) {
      const c = P.cameras().find(x => x.code === cd.code);
      const paused = store.update('pausedCams', {}, m => { if (m[c.code] != null) delete m[c.code]; else m[c.code] = P.cameraCount(c); return m; })[c.code] != null;
      addCamLog(c.code, paused ? 'オペレーターが計測を一時停止' : '計測を再開'); return;
    }
    if (d.zone) {
      const zones = store.get('camZones', {});
      if (d.zone === 'edit') { cd.editZone = true; cd.draft = (zones[cd.code] || DEFAULT_ZONE).map(p => p.slice()); }
      if (d.zone === 'reset') cd.draft = DEFAULT_ZONE.map(p => p.slice());
      if (d.zone === 'cancel') { cd.editZone = false; cd.draft = null; }
      if (d.zone === 'save') {
        const draft = cd.draft; cd.editZone = false; cd.draft = null;
        store.update('camZones', {}, z => { z[cd.code] = draft.map(p => p.map(v => Math.round(v * 10) / 10)); return z; });
        addCamLog(cd.code, '計測エリアを手動で調整'); toast('計測エリアを保存しました');
      }
      render(true); return;
    }
    if ('replay' in d) { if (cd.replay) stopReplay(); else startReplay(); return; }
    if ('reconnect' in d) {
      const code = cd.code;
      toast('再接続を試行中…');
      setTimeout(() => { saveCamera(code, { status: 'ok' }); addCamLog(code, '再接続に成功・計測を再開'); P.addLog(`${code} を再接続`); toast(`${code} を再接続しました`); }, 1200);
      return;
    }
    if ('ticket' in d) { const no = 'MT-' + (1000 + Math.floor(P.hash(cd.code + Date.now()) * 9000)); addCamLog(cd.code, `整備チケット ${no} を作成`); toast(`整備チケット ${no} を作成しました`); return; }
    // camera form
    if (d.cfstep) { cf.step = d.cfstep; render(true); return; }
    if (d.cfs) { const i = d.cfs.indexOf(':'); cf[d.cfs.slice(0, i)] = d.cfs.slice(i + 1); render(true); return; }
    if (d.cfride) { cf.rides = cf.rides.includes(d.cfride) ? cf.rides.filter(x => x !== d.cfride) : cf.rides.concat(d.cfride); render(true); return; }
    if (d.cft) { cf[d.cft] = !cf[d.cft]; render(true); return; }
    if ('cfsave' in d) { saveCamForm(); return; }
    if ('cftest' in d) {
      toast('接続テスト中…');
      const c = P.cameras().find(x => x.code === cf.camId);
      setTimeout(() => toast(c && c.status === 'lost' ? `接続失敗：${cf.code} から応答がありません` : `接続OK：${cf.code}・遅延 1.2 s・${cf.fps} fps`), 1000);
      return;
    }
    if ('cfremove' in d) {
      if (!confirm(`${cf.code} を取り外しますか？担当アトラクションの計測は停止します。`)) return;
      const code = cf.camId;
      store.update('camerasRemoved', [], l => l.concat(code));
      store.update('camerasAdded', [], l => l.filter(c => c.code !== code));
      P.addLog(`カメラを取り外し：${code}`); toast(`${code} を取り外しました`);
      cf = null; location.hash = '#/cams'; return;
    }
    // notices
    if (d.nt) { ntSt.type = d.nt; ntSt.page = 0; render(true); return; }
    if (d.np) { ntSt.page = +d.np; render(true); return; }
    if ('nsort' in d) { ntSt.asc = !ntSt.asc; render(true); return; }
    if (d.nf) { const [k, v] = d.nf.split(':'); nf[k] = v; nf._saved = false; render(true); return; }
    if ('nfauto' in d) { nf.auto = !nf.auto; render(true); return; }
    if ('nfsched' in d) {
      nf.status = nf.status === 'scheduled' ? (nf.id ? 'draft' : 'new') : 'scheduled';
      if (nf.status === 'scheduled' && !nf.scheduledAt) nf.scheduledAt = P.atHour(P.simNow(), 19.5).getTime();
      render(true); return;
    }
    if (d.nfsave) { saveNotice(d.nfsave); return; }
    if ('nfdel' in d) {
      store.update('notifications', [], l => l.filter(n => n.id !== nf.id));
      toast('通知を削除しました'); nf = null; location.hash = '#/notices';
    }
  });
  document.addEventListener('submit', e => {
    if (e.target.id === 'ntFilter') {
      e.preventDefault();
      Object.assign(ntSt, ntDraft, { page: 0 });
      ntSt.q = ntSt.q.trim();
      render(true);
      return;
    }
    if (e.target.id === 'camFilter') {
      e.preventDefault();
      Object.assign(camSt, camDraft, { page: 0 });
      camSt.q = camSt.q.trim();
      render(true);
      return;
    }
    if (e.target.id !== 'rideFilter') return;
    e.preventDefault();
    Object.assign(rideSt, rideDraft, { page: 0 });
    rideSt.q = rideSt.q.trim();
    render(true);
  });
  document.addEventListener('input', e => {
    const t = e.target, d = t.dataset;
    if (d.rdraft) { rideDraft[d.rdraft] = t.value; const r = document.querySelector('[data-rfreset]'); if (r) r.disabled = false; return; }
    if (d.cmdraft) { camDraft[d.cmdraft] = t.value; const r = document.querySelector('[data-cmreset]'); if (r) r.disabled = false; return; }
    if (d.ntdraft) { ntDraft[d.ntdraft] = t.value; const r = document.querySelector('[data-ntreset]'); if (r) r.disabled = false; return; }
    if (d.rfshare && rf) { rf.shares = Object.assign({}, rf.shares, { [d.rfshare]: t.value }); softRender(); return; }
    if (d.rf && rf) { rf[d.rf] = t.value; if (['seats', 'cycle', 'cap', 'thMid', 'thBusy'].includes(d.rf) || d.rf === 'name') softRender(); return; }
    if (d.cf && cf) { cf[d.cf] = t.value; if (d.cf === 'sens' || d.cf === 'code' || d.cf === 'role' || d.cf === 'interval' || d.cf === 'minConf') softRender(); return; }
    if (d.nfin && nf) {
      if (d.nfin === 'time') { nf._time = t.value; return; }
      nf[d.nfin] = t.value; nf._saved = false;
      const pv = document.getElementById(d.nfin === 'title' ? 'pv-t' : 'pv-b');
      if (pv) pv.textContent = t.value || (d.nfin === 'title' ? '通知のタイトルがここに表示されます' : 'ゲストへ送る本文。');
    }
  });
  // re-render forms after typing without losing focus/caret
  function softRender() {
    clearTimeout(softRender.t);
    softRender.t = setTimeout(() => {
      const a = document.activeElement;
      const sel = a && a.dataset ? (a.dataset.rf ? `[data-rf="${a.dataset.rf}"]` : a.dataset.rfshare ? `[data-rfshare="${a.dataset.rfshare}"]` : a.dataset.cf ? `[data-cf="${a.dataset.cf}"]` : null) : null;
      const pos = a && typeof a.selectionStart === 'number' ? a.selectionStart : null;
      render(true);
      if (sel) { const n = document.querySelector(sel); if (n) { n.focus(); if (pos != null && n.setSelectionRange && n.type !== 'number' && n.type !== 'range') n.setSelectionRange(pos, pos); } }
    }, 350);
  }

  /* zone handle dragging */
  let drag = null;
  document.addEventListener('pointerdown', e => {
    const h = e.target.closest('.hdl');
    if (!h) return;
    drag = { i: +h.dataset.h, box: document.getElementById('feed').getBoundingClientRect() };
    h.setPointerCapture(e.pointerId); e.preventDefault();
  });
  document.addEventListener('pointermove', e => {
    if (!drag || !cd.draft) return;
    const x = Math.max(0, Math.min(100, (e.clientX - drag.box.left) / drag.box.width * 100));
    const y = Math.max(0, Math.min(100, (e.clientY - drag.box.top) / drag.box.height * 100));
    cd.draft[drag.i] = [x, y];
    const h = document.querySelector(`.hdl[data-h="${drag.i}"]`);
    if (h) { h.style.left = x + '%'; h.style.top = y + '%'; }
    const poly = document.querySelector('.feedbig polygon');
    if (poly) poly.setAttribute('points', cd.draft.map(p => p.join(',')).join(' '));
  });
  document.addEventListener('pointerup', () => { drag = null; });

  /* 30-minute replay */
  function startReplay() {
    const c = P.cameras().find(x => x.code === cd.code);
    const end = P.simNow().getTime(), start = end - 30 * 60e3, dur = 7000, t0 = performance.now();
    cd.replay = { raf: 0 };
    render(true);
    const step = t => {
      if (!cd.replay) return;
      const k = Math.min(1, (t - t0) / dur), at = new Date(start + (end - start) * k);
      const n = P.deadCam(c) ? 0 : P.cameraCountAt(c, at, false);
      const bar = document.getElementById('rbar'), lbl = document.getElementById('rlbl'), live = document.getElementById('livelbl');
      if (bar) bar.style.width = k * 100 + '%';
      if (lbl) lbl.textContent = '再生中 ' + P.hhmm(at);
      if (live) live.textContent = `記録 ${n} 人（${P.hhmm(at)}）`;
      document.querySelectorAll('[data-live-n]').forEach(x => { x.textContent = n; });
      if (k < 1) cd.replay.raf = requestAnimationFrame(step);
      else { stopReplay(); toast('直近30分の再生が終了しました'); }
    };
    cd.replay.raf = requestAnimationFrame(step);
  }
  function stopReplay(silent) { if (cd.replay) cancelAnimationFrame(cd.replay.raf); cd.replay = null; if (!silent && route().name === 'cams') render(true); }

  /* global search */
  const $q = document.getElementById('q'), $res = document.getElementById('qres');
  function searchItems(q) {
    q = q.trim().toLowerCase();
    if (!q) return [];
    const out = [];
    P.ZONES.forEach(z => { if ((z.name + z.short).toLowerCase().includes(q)) out.push({ label: z.name, sub: 'エリア', href: `#/rides?zone=${z.key}` }); });
    P.rides().forEach(a => { if ((a.name + (a.number || '')).toLowerCase().includes(q)) out.push({ label: `${a.number || ''}. ${a.name}`, sub: 'アトラクション', href: `#/rides/${a.id}` }); });
    P.cameras().forEach(c => { if ((c.code + c.place).toLowerCase().includes(q)) out.push({ label: `${c.code} ${c.place}`, sub: P.CAM_STATUS[c.status].label, href: `#/cams/${c.code}` }); });
    P.notifications().forEach(n => { if (n.title.toLowerCase().includes(q)) out.push({ label: n.title, raw: true, sub: '通知', href: `#/notices/${n.id}` }); });
    return out.slice(0, 10);
  }
  let sel = 0;
  function showRes() {
    const items = searchItems($q.value);
    $res.hidden = !$q.value.trim();
    $res.innerHTML = items.map((it, i) => `<a href="${it.href}" class="${i === sel ? 'sel' : ''}"><span class="${it.raw ? 'noi18n' : ''}">${esc(it.label)}</span><small>${esc(it.sub)}</small></a>`).join('') || '<div class="none">該当なし</div>';
    return items;
  }
  $q.addEventListener('input', () => { sel = 0; showRes(); });
  $q.addEventListener('keydown', e => {
    const items = searchItems($q.value);
    if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); showRes(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); showRes(); e.preventDefault(); }
    if (e.key === 'Enter' && items[sel]) { location.hash = items[sel].href; $q.value = ''; $res.hidden = true; $q.blur(); }
    if (e.key === 'Escape') { $q.value = ''; $res.hidden = true; }
  });
  $res.addEventListener('click', () => { $q.value = ''; $res.hidden = true; });
  document.addEventListener('click', e => { if (!e.target.closest('.gsearch')) $res.hidden = true; });

  /* =================== live updates =================== */
  function liveRender() {
    const r = route();
    if (rf || cf || nf || md) return;                             // never clobber forms / open dialogs
    if (r.name === 'cams' && r.arg && (cd.editZone || cd.replay)) return;
    if (document.querySelector('details[open]')) return;
    if (document.activeElement && (document.activeElement.closest('.fpanel') || document.activeElement.tagName === 'SELECT')) return;
    render(true);
  }
  /* AI通知の範囲 (radius around each ride within which guests receive AI notices) */
  document.addEventListener('change', e => {
    if (!e.target.matches || !e.target.matches('[data-radius]')) return;
    const m = Number(e.target.value);
    if (!m || m === P.nearRadius()) return;
    store.set('nearRadius', m);
    P.addLog(`AI通知の範囲を半径${m}mに変更`);
    e.target.blur();
    render(true);
    toast(`AI通知は各アトラクションから半径${m}m以内のゲストに表示されます`);
  });
  window.addEventListener('pp:psize', e => {
    const st = { ride: rideSt, cam: camSt, notice: ntSt }[e.detail.list];
    if (!st) return;
    st.per = e.detail.per; st.page = 0; render(true);
  });
  store.on(key => {
    if (['notifications', 'nearRadius', 'rideEdits', 'ridesAdded', 'ridesRemoved', 'logs', 'dismissed', 'cameraEdits', 'camerasAdded', 'camerasRemoved', 'pausedCams', 'camZones', 'camLogs'].includes(key)) {
      clearTimeout(liveRender.t); liveRender.t = setTimeout(liveRender, 30);
    }
  });
  render(false);
  /* フレーム過負荷 is computed from AI load; log each change of it */
  const camSeen = {};
  function camWatch() {
    P.cameras().forEach(c => {
      const was = camSeen[c.code];
      camSeen[c.code] = c.status;
      if (was == null || was === c.status || ![was, c.status].every(s => s === 'ok' || s === 'overload')) return;
      const pf = P.camPerf(c);
      const text = c.status === 'overload'
        ? `処理負荷 ${pct(pf.load)}：フレーム過負荷（${pf.fps} fps に間引き）`
        : `処理負荷 ${pct(pf.load)}：稼働中に復帰（${pf.fps} fps）`;
      addCamLog(c.code, text);
      P.addLog(`${c.code}（${c.place}）${text}`);
    });
  }
  camWatch();
  setInterval(() => { P.autoSendCheck(); camWatch(); liveRender(); document.getElementById('date').textContent = P.dateLabel(P.simNow()); }, 5000);
})();

/* filter dropdowns: only one open at a time, close on outside click */
(function () {
  document.addEventListener('toggle', e => {
    const d = e.target;
    if (d.tagName !== 'DETAILS' || !d.open) return;
    document.querySelectorAll('details.dd[open]').forEach(x => { if (x !== d) x.open = false; });
  }, true);
  document.addEventListener('click', e => {
    if (e.target.closest('details.dd')) return;
    document.querySelectorAll('details.dd[open]').forEach(x => { x.open = false; });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.querySelectorAll('details.dd[open]').forEach(x => { x.open = false; x.querySelector('summary').focus(); });
  });
})();

/* page-size selector in table footers */
document.addEventListener('change', e => {
  const k = e.target.dataset && e.target.dataset.psize;
  if (!k) return;
  window.dispatchEvent(new CustomEvent('pp:psize', { detail: { list: k, per: Number(e.target.value) } }));
});
