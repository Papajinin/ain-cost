// AIN Cost 통계 v6: 월(유형별, 선택 지출 안에서, 할부) / 연(월별 흐름, 작년과 비교 — 둘 다 전체·필수·선택·유형), 카드 접기·펼치기, 좌우로 밀어서 넘기기

const statsOverlay = document.getElementById('statsOverlay');
const statsPeriod = document.getElementById('statsPeriod');
const statsTitle = document.getElementById('statsTitle');
const statsBody = document.getElementById('statsBody');

// 카드를 펼쳐 둔 상태는 이 기기에만 기억 (기기마다 보는 습관이 달라서)
const OPEN_KEY = 'ainCost.statsOpen';
let statsOpen = { cat: true, sel: false, inst: false, flow: true, table: false };
try { statsOpen = { ...statsOpen, ...JSON.parse(localStorage.getItem(OPEN_KEY) || '{}') }; } catch (e) {}

const st = {
  period: 'month',  // month | year
  month: ui.month,
  year: Number(ui.month.slice(0, 4)),
  mode: 'all',      // all | must | free | cat
  catId: null,
  unit: 'amt',      // amt | pct
  pick: 0,          // 연 그래프에서 고른 달 (0~11)
  table: 'all',     // all | must | free | cat
  tableCat: null    // 작년과 비교 표에서 고른 유형 (월별 흐름과 따로 고름)
};

// ---------- 열기·닫기 ----------
function openStats() {
  st.month = ui.month;
  st.year = Number(ui.month.slice(0, 4));
  st.pick = Number(ui.month.slice(5)) - 1;
  if (!state.categories.some(c => c.id === st.catId)) st.catId = state.categories[0].id;
  if (!state.categories.some(c => c.id === st.tableCat)) st.tableCat = state.categories[0].id;
  renderStats();
  showOverlay(statsOverlay);
}

// ---------- 계산 ----------
function yearMonths(year) {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
}

// 한 달의 총액·필수·선택·유형별
function monthTotals(month) {
  const recs = monthRecords(month);
  const total = sumBy(recs, () => true);
  const free = sumBy(recs, isFree);
  const byCat = {};
  state.categories.forEach(c => { byCat[c.id] = sumBy(recs, r => r.categoryId === c.id); });
  return { total, free, must: total - free, byCat, count: recs.length };
}

function isInstallRecord(r) {
  return !!r.inst || !!(findMethod(r.methodId) || {}).installment;
}

// 그래프 한 칸에 보일 값 (금액 또는 그달 총액 중 비율)
function flowValue(t, mode, unit) {
  if (mode === 'all') return unit === 'pct' ? (t.total ? 100 : 0) : t.total;
  const v = mode === 'must' ? t.must : mode === 'free' ? t.free : t.byCat[st.catId] || 0;
  return unit === 'pct' ? (t.total ? v / t.total * 100 : 0) : v;
}

// 작년과 차이: 더 쓰면 +, 덜 쓰면 − (같으면 0)
function signed(d) {
  if (!d) return '0';
  return (d > 0 ? '+' : '−') + Math.abs(d).toLocaleString('ko-KR');
}
// 더 쓰면 빨강, 덜 쓰면 초록 (첫 화면 요약 화살표와 같은 색)
function diffClass(d) {
  return d > 0 ? ' class="up"' : d < 0 ? ' class="down"' : '';
}

function shortWon(v) {
  if (v >= 100000000) return (v / 100000000).toFixed(1).replace(/\.0$/, '') + '억';
  if (v >= 10000) return Math.round(v / 10000).toLocaleString('ko-KR') + '만';
  return v.toLocaleString('ko-KR');
}

// 눈금: 최댓값을 보기 좋은 숫자로 올림
function niceMax(v, pct) {
  if (pct) return Math.min(100, Math.max(10, Math.ceil(v / 10) * 10));
  if (v <= 0) return 10000;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const steps = [1, 2, 2.5, 5, 10];
  return steps.map(s => s * p).find(s => s >= v);
}

// ---------- 그리기 ----------
const CHEVRON = '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>';

function card(id, title, hint, body) {
  const open = !!statsOpen[id];
  return `<section class="st-card">
    <button class="st-head" type="button" data-card="${id}" aria-expanded="${open}">
      <span class="st-title">${title}</span><span class="st-hint num">${hint}</span>${CHEVRON}
    </button>
    ${open ? `<div class="st-body">${body}</div>` : ''}
  </section>`;
}

function seg(name, list, value, small) {
  return `<div class="seg${small ? ' small' : ' wide'}" data-seg="${name}">` +
    list.map(([v, label]) => `<button type="button" data-v="${v}" class="${v === value ? 'on' : ''}" aria-pressed="${v === value}">${label}</button>`).join('') +
    '</div>';
}

// 유형 고르기 칩 (월별 흐름: data-cat, 작년과 비교: data-tcat)
function statCatChips(sel, attr) {
  return '<div class="cat-chips wrap st-cats">' + state.categories.map(c =>
    `<button type="button" class="cat-chip small${c.id === sel ? ' on' : ''}" data-${attr}="${c.id}" aria-pressed="${c.id === sel}"><i style="background:var(--c-${c.color})"></i>${escapeHtml(c.name)}</button>`).join('') + '</div>';
}

function renderStats() {
  statsPeriod.innerHTML = seg('period', [['month', '월'], ['year', '연']], st.period);
  if (st.period === 'month') {
    const [y, m] = st.month.split('-').map(Number);
    statsTitle.textContent = `${y}년 ${m}월`;
    statsBody.innerHTML = renderMonthCards();
  } else {
    statsTitle.textContent = `${st.year}년`;
    statsBody.innerHTML = renderYearCards();
  }
}

function renderMonthCards() {
  const t = monthTotals(st.month);
  if (!t.count) return '<p class="empty">이 달에 적은 지출이 없어요</p>';

  // 유형별
  const max = Math.max(...Object.values(t.byCat), 1);
  let cat = '';
  ['must', 'free'].forEach(g => {
    cat += `<div class="sc-head">${g === 'must' ? '필수' : '선택'} · <span class="num">${won(g === 'must' ? t.must : t.free)}</span></div>`;
    state.categories.filter(c => c.group === g).forEach(c => {
      const v = t.byCat[c.id];
      cat += `<div class="st-cat">
        <div class="st-cat-line"><i class="g-dot" style="background:var(--c-${c.color})"></i><span class="st-cat-name">${escapeHtml(c.name)}</span>
        <b class="num">${won(v)}</b><span class="st-pct num">${(t.total ? v / t.total * 100 : 0).toFixed(1)}%</span></div>
        <span class="sc-track"><i style="width:${v ? Math.max(v / max * 100, 1.5) : 0}%;background:var(--c-${c.color})"></i></span>
      </div>`;
    });
  });

  // 선택 지출 안에서
  const frees = state.categories.filter(c => c.group === 'free');
  let sel;
  if (!t.free) sel = '<p class="st-note">이 달에는 선택 지출이 없어요</p>';
  else {
    const parts = frees.filter(c => t.byCat[c.id] > 0);
    sel = `<div class="st-stack" role="img" aria-label="${parts.map(c => `${c.name} ${Math.round(t.byCat[c.id] / t.free * 100)}%`).join(', ')}">` +
      parts.map(c => `<span style="width:${t.byCat[c.id] / t.free * 100}%;background:var(--c-${c.color})"></span>`).join('') + '</div>' +
      '<div class="st-grid">' + frees.map(c => `<div><span class="st-grid-label"><i class="g-dot" style="background:var(--c-${c.color})"></i>${escapeHtml(c.name)} ${Math.round(t.byCat[c.id] / t.free * 100)}%</span><b class="num">${won(t.byCat[c.id])}</b></div>`).join('') + '</div>';
  }

  // 할부: 이번 달 합계, 앞으로 남은 금액, 항목별 회차
  const recs = monthRecords(st.month).filter(isInstallRecord);
  const instNow = sumBy(recs, () => true);
  const later = sumBy(state.records.filter(r => r.installId && monthOf(r.date) > st.month), () => true);
  let inst = `<div class="st-grid"><div><span class="st-grid-label">이번 달 할부</span><b class="num">${won(instNow)}</b></div>` +
    `<div><span class="st-grid-label">앞으로 남은 할부</span><b class="num">${won(later)}</b></div></div>`;
  if (recs.length) {
    inst += '<div class="st-inst">' + recs.map(r => {
      const steps = r.inst ? Array.from({ length: r.inst.n }, (_, i) => `<span class="${i < r.inst.k ? 'on' : ''}"></span>`).join('') : '';
      return `<div class="st-inst-row"><i class="g-dot" style="background:${catColor(r.categoryId)}"></i>
        <div class="st-inst-body"><div class="st-inst-line"><span>${escapeHtml(r.title)}</span><b class="num">${won(r.amount)}</b></div>
        ${r.inst ? `<div class="st-inst-line"><span class="st-steps">${steps}</span><span class="st-pct num">${r.inst.k} / ${r.inst.n}</span></div>` : ''}</div></div>`;
    }).join('') + '</div>';
  }

  return card('cat', '유형별', won(t.total), cat) +
    card('sel', '선택 지출 안에서', won(t.free), sel) +
    card('inst', '할부', won(instNow), inst);
}

function renderYearCards() {
  const months = yearMonths(st.year);
  const now = yearMonths(st.year).map(monthTotals);
  const last = yearMonths(st.year - 1).map(monthTotals);
  if (!now.some(t => t.count) && !last.some(t => t.count)) return '<p class="empty">이 해에 적은 지출이 없어요</p>';

  // 올해 기록이 있는 마지막 달까지만 작년과 견줌 (같은 기간끼리)
  let lastIdx = -1;
  now.forEach((t, i) => { if (t.count) lastIdx = i; });
  const range = lastIdx >= 0 ? `1~${lastIdx + 1}월` : '';

  // ----- 월별 흐름 -----
  const pct = st.unit === 'pct';
  const vals = now.map(t => flowValue(t, st.mode, st.unit));
  const prev = last.map(t => flowValue(t, st.mode, st.unit));
  const top = niceMax(Math.max(...vals, ...prev), pct);
  const allMode = st.mode === 'all';
  const barColor = st.mode === 'must' ? 'var(--must)' : st.mode === 'cat' ? catColor(st.catId) : 'var(--primary)';
  const bars = now.map((t, i) => {
    let inner;
    if (allMode && !pct) {
      inner = `<span style="height:${t.free / top * 100}%;background:var(--primary)"></span><span class="base" style="height:${t.must / top * 100}%;background:var(--must)"></span>`;
    } else if (allMode && pct) {
      inner = t.total ? `<span style="height:${t.free / t.total * 100}%;background:var(--primary)"></span><span class="base" style="height:${t.must / t.total * 100}%;background:var(--must)"></span>` : '';
    } else {
      inner = `<span class="base solo" style="height:${vals[i] / top * 100}%;background:${barColor}"></span>`;
    }
    return `<button type="button" class="fl-bar${st.pick === i ? ' on' : ''}" data-i="${i}" aria-label="${i + 1}월">${inner}</button>`;
  }).join('');
  // 작년 선: '전체·비율'에서는 작년 선택 지출 비율
  const prevLine = last.map(t => (allMode && pct ? (t.total ? t.free / t.total * 100 : 0) : flowValue(t, st.mode, st.unit)));
  const lineTop = allMode && pct ? 100 : top;
  const hasPrev = last.some(t => t.count);
  const pts = prevLine.map((v, i) => `${(i + 0.5) / 12 * 1200},${(1 - v / lineTop) * 300}`).join(' ');
  const dots = prevLine.map((v, i) => `<i style="left:${(i + 0.5) / 12 * 100}%;top:${(1 - v / lineTop) * 100}%"></i>`).join('');
  const ticks = [1, 0.5, 0].map(f => `<span class="fl-tick num" style="top:${(1 - f) * 100}%">${pct ? Math.round(lineTop * f) + '%' : shortWon(top * f)}</span>`).join('');
  const grid = [1, 0.5, 0].map(f => `<i style="top:${(1 - f) * 100}%"></i>`).join('');

  const catLabel = (findCat(st.catId) || {}).name || '';
  const label = { all: '전체', must: '필수', free: '선택', cat: catLabel }[st.mode];
  const legend = allMode
    ? '<span><i style="background:var(--must)"></i>필수</span><span><i style="background:var(--primary)"></i>선택</span>'
    : `<span><i style="background:${barColor}"></i>${escapeHtml(label)}</span>`;
  const p = st.pick, tp = now[p], lp = last[p];
  const fmt = v => (pct ? v.toFixed(1) + '%' : won(v));
  let detail;
  if (allMode && pct) detail = `올해 선택 ${tp.total ? fmt(tp.free / tp.total * 100) : '기록 없음'} · 작년 선택 ${lp.total ? fmt(lp.free / lp.total * 100) : '기록 없음'}`;
  else detail = `올해 ${tp.count ? fmt(vals[p]) : '기록 없음'} · 작년 ${lp.count ? fmt(prev[p]) : '기록 없음'}`;

  const flow = seg('mode', [['all', '전체'], ['must', '필수'], ['free', '선택'], ['cat', '유형']], st.mode) +
    (st.mode === 'cat' ? statCatChips(st.catId, 'cat') : '') +
    `<div class="fl-top"><div class="fl-legend">${legend}${hasPrev ? '<span><i class="line"></i>작년</span>' : ''}</div>${seg('unit', [['amt', '금액'], ['pct', '비율']], st.unit, true)}</div>
    <div class="fl-chart">
      <div class="fl-ticks">${ticks}</div>
      <div class="fl-plot">
        <div class="fl-grid" aria-hidden="true">${grid}</div>
        <div class="fl-bars">${bars}</div>
        ${hasPrev ? `<svg class="fl-line" viewBox="0 0 1200 300" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" vector-effect="non-scaling-stroke"/></svg><div class="fl-dots" aria-hidden="true">${dots}</div>` : ''}
      </div>
    </div>
    <div class="fl-months num">${months.map((m, i) => `<span class="${st.pick === i ? 'on' : ''}">${i + 1}</span>`).join('')}</div>
    <div class="fl-detail"><b>${p + 1}월 · ${escapeHtml(label)}${pct ? ' (전체 중 비율)' : ''}</b><span class="num">${detail}</span></div>`;

  // ----- 작년과 비교 표 -----
  const pickV = t => (st.table === 'free' ? t.free : st.table === 'must' ? t.must : st.table === 'cat' ? t.byCat[st.tableCat] || 0 : t.total);
  let sa = 0, sb = 0;
  const rows = now.map((t, i) => {
    const has = t.count > 0;
    if (has) { sa += pickV(t); sb += pickV(last[i]); }
    const d = pickV(t) - pickV(last[i]);
    const show = has && last[i].count;
    return `<tr><th scope="row">${i + 1}월</th><td>${has ? pickV(t).toLocaleString('ko-KR') : '—'}</td><td class="sub">${last[i].count ? pickV(last[i]).toLocaleString('ko-KR') : '—'}</td><td${show ? diffClass(d) : ''}>${show ? signed(d) : ''}</td></tr>`;
  }).join('');
  const td = sa - sb;
  const sumRow = lastIdx >= 0 && last.some(t => t.count)
    ? `<tr class="sum"><th scope="row">${range}</th><td>${sa.toLocaleString('ko-KR')}</td><td class="sub">${sb.toLocaleString('ko-KR')}</td><td${diffClass(td)}>${signed(td)}</td></tr>` : '';
  const table = `<div class="st-table-top">${seg('table', [['all', '전체'], ['must', '필수'], ['free', '선택'], ['cat', '유형']], st.table, true)}</div>
    ${st.table === 'cat' ? statCatChips(st.tableCat, 'tcat') : ''}
    <div class="st-table-wrap"><table class="st-table num"><thead><tr><th>월</th><th>${st.year}년</th><th>${st.year - 1}년</th><th>작년보다</th></tr></thead><tbody>${rows}${sumRow}</tbody></table></div>
    <p class="st-note">−는 작년보다 덜 쓴 금액, +는 더 쓴 금액이에요.</p>`;

  let tableHint = '';
  if (sumRow) {
    // 표에서 고른 것(전체·필수·선택·유형)에 맞춰 요약
    const name = { all: '전체', must: '필수', free: '선택', cat: (findCat(st.tableCat) || {}).name || '' }[st.table] + ' 지출';
    const fd = sa - sb;
    tableHint = fd === 0 ? `${name} 작년과 같아요` : `${name} ${shortWon(Math.abs(fd))}원 ${fd > 0 ? '늘었어요' : '줄었어요'}`;
  }
  return card('flow', '월별 흐름', '', flow) +
    card('table', '작년과 비교', tableHint, table);
}

// ---------- 누르기 ----------
statsOverlay.addEventListener('click', e => {
  if (e.target === statsOverlay) return hideOverlay(statsOverlay);
  const head = e.target.closest('.st-head');
  if (head) {
    const id = head.dataset.card;
    statsOpen[id] = !statsOpen[id];
    try { localStorage.setItem(OPEN_KEY, JSON.stringify(statsOpen)); } catch (err) {}
    return renderStats();
  }
  const b = e.target.closest('[data-seg] button');
  if (b) {
    st[b.parentElement.dataset.seg] = b.dataset.v;
    return renderStats();
  }
  const chip = e.target.closest('[data-cat]');
  if (chip) { st.catId = chip.dataset.cat; return renderStats(); }
  const tchip = e.target.closest('[data-tcat]');
  if (tchip) { st.tableCat = tchip.dataset.tcat; return renderStats(); }
  const bar = e.target.closest('.fl-bar');
  if (bar) { st.pick = Number(bar.dataset.i); return renderStats(); }
});

// 넘기기: 내용이 밀린 쪽으로 살짝 사라졌다가 반대쪽에서 들어옴 (움직임 줄이기 설정이면 바로 바뀜)
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let statsMoving = false;
function moveStats(n) {
  if (statsMoving) return;
  const step = () => {
    if (st.period === 'month') st.month = addMonths(st.month, n);
    else st.year += n;
    renderStats();
  };
  if (reduceMotion.matches) return step();
  statsMoving = true;
  statsBody.classList.add(n > 0 ? 'out-l' : 'out-r');
  setTimeout(() => {
    step();
    statsBody.className = 'st-cards st-slide ' + (n > 0 ? 'in-l' : 'in-r');
    statsBody.offsetWidth; // 들어오는 움직임을 다음 장면에 시작
    statsBody.className = 'st-cards st-slide show';
    setTimeout(() => { statsBody.className = 'st-cards st-slide'; statsMoving = false; }, 180);
  }, 140);
}

// 좌우로 밀기: 가로로 50px 넘게, 세로보다 확실히 가로로 밀었을 때만 (옆으로 스크롤되는 칸 안에서 민 것은 제외)
const statsScroll = statsOverlay.querySelector('.sheet-scroll');
let swipe = null;
function inSideScroller(el) {
  for (; el && el !== statsScroll; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(el).overflowX)) return true;
  }
  return false;
}
statsScroll.addEventListener('pointerdown', e => {
  swipe = e.pointerType === 'mouse' || inSideScroller(e.target) ? null : { x: e.clientX, y: e.clientY };
});
statsScroll.addEventListener('pointerup', e => {
  if (!swipe) return;
  const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
  swipe = null;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) moveStats(dx < 0 ? 1 : -1);
});
statsScroll.addEventListener('pointercancel', () => { swipe = null; });
document.getElementById('statsPrev').addEventListener('click', () => moveStats(-1));
document.getElementById('statsNext').addEventListener('click', () => moveStats(1));
document.getElementById('statsClose').addEventListener('click', () => hideOverlay(statsOverlay));
