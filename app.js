// AIN Cost 공통 v8: 날짜·금액 도우미, 저장소, 상태, 화면 모드·테마 색, 아래에서 올라오는 창

const STORE_KEY = 'ainCost';
const WEEK_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

// ---------- 날짜 ('YYYY-MM-DD' 문자열, 달은 'YYYY-MM') ----------
function ymd(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function parseYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function todayStr() {
  return ymd(new Date());
}
function monthOf(dateStr) {
  return dateStr.slice(0, 7);
}
function addMonths(month, n) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// ---------- 금액 ----------
function won(n) {
  return Math.round(n).toLocaleString('ko-KR') + '원';
}

// ---------- 상태 ----------
// 묶음: must(필수) / free(선택). 색은 AIN Todo 카테고리 색 순서대로
const DEFAULT_CATEGORIES = [
  { id: 'cat_regular', name: '정기', color: 'blue', group: 'must' },
  { id: 'cat_irregular', name: '변동', color: 'green', group: 'must' },
  { id: 'cat_loan', name: '대출', color: 'orange', group: 'must' },
  { id: 'cat_family', name: '가족', color: 'red', group: 'free' },
  { id: 'cat_social', name: '사회', color: 'purple', group: 'free' },
  { id: 'cat_dining', name: '외식', color: 'pink', group: 'free' },
  { id: 'cat_spend', name: '소비', color: 'teal', group: 'free' }
];
// 할부(installment)는 3단계의 할부 기능과 연결
const DEFAULT_METHODS = [
  { id: 'pay_cash', name: '현금' },
  { id: 'pay_card', name: '카드' },
  { id: 'pay_coupon', name: '쿠폰' },
  { id: 'pay_install', name: '할부', installment: true }
];

let state = {
  categories: DEFAULT_CATEGORIES,
  methods: DEFAULT_METHODS,
  records: [],
  recurring: [], // 매달 나가는 돈 (repeat.js)
  // theme: light | dark | auto (기기마다), accent: blue | green | red | yellow (계정마다)
  settings: { theme: 'auto', accent: 'blue' }
};

// 저장하지 않는 화면 상태
const ui = {
  today: todayStr(),
  month: monthOf(todayStr()),
  catsOpen: false,
  futureOpen: false // 이번 달의 내일 이후 기록 펼침
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    state = {
      categories: saved.categories || DEFAULT_CATEGORIES,
      methods: saved.methods || DEFAULT_METHODS,
      records: saved.records || [],
      recurring: saved.recurring || [],
      settings: { ...state.settings, ...(saved.settings || {}) }
    };
    return true;
  } catch (e) {
    return false;
  }
}

// 이 기기에만 저장 (클라우드에서 받은 내용을 저장할 때)
function saveLocal() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) {}
}

// 내가 바꾼 내용 저장: 기기 + 클라우드 (6단계 sync.js)
function saveState() {
  saveLocal();
  if (typeof cloudSave === 'function') cloudSave();
}

// 화면 모드('자동'이면 아이폰 설정을 따름)와 테마 색
function applyTheme() {
  const { theme: mode, accent } = state.settings;
  const root = document.documentElement;
  if (mode === 'light' || mode === 'dark') root.setAttribute('data-theme', mode);
  else root.removeAttribute('data-theme');
  if (accent === 'green' || accent === 'red' || accent === 'yellow') root.setAttribute('data-accent', accent);
  else root.removeAttribute('data-accent');
}

// 아래에서 올라오는 창 열기·닫기 (통계, 설정)
function showOverlay(el) {
  el.hidden = false;
  document.body.classList.add('locked');
  requestAnimationFrame(() => el.classList.add('show'));
}
function hideOverlay(el) {
  el.classList.remove('show');
  document.body.classList.remove('locked');
  setTimeout(() => { if (!el.classList.contains('show')) el.hidden = true; }, 380); // 닫히는 움직임(0.35초)이 끝난 뒤
}

function newId() {
  return 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function findCat(id) {
  return state.categories.find(c => c.id === id);
}
function findMethod(id) {
  return state.methods.find(m => m.id === id);
}
function catColor(categoryId) {
  const c = findCat(categoryId);
  return c ? `var(--c-${c.color})` : 'var(--sub)';
}

// 한 달 기록과 묶음별 합계
function monthRecords(month) {
  return state.records.filter(r => monthOf(r.date) === month);
}
function sumBy(records, fn) {
  return records.reduce((s, r) => (fn(r) ? s + r.amount : s), 0);
}
function isFree(r) {
  const c = findCat(r.categoryId);
  return !!c && c.group === 'free';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// 선택 버튼 묶음(.seg): 고른 칸 표시가 옆으로 미끄러짐 (네 앱 공통 방식)
// 어느 칸을 골랐는지는 화면마다 .on으로 정하고, 여기서는 그 칸을 따라가기만 함
const segPos = new Map(); // 묶음을 다시 그려도 지난 자리에서 미끄러지게
function segKey(seg) { return seg.id || seg.dataset.seg || seg.getAttribute('aria-label') || ''; }
function moveSegThumb(thumb, pos, animate) {
  if (!animate) thumb.style.transition = 'none';
  thumb.style.width = pos.w + 'px';
  thumb.style.transform = `translateX(${pos.x}px)`;
  if (!animate) { void thumb.offsetWidth; thumb.style.transition = ''; }
}
function placeSegThumb(seg, animate) {
  let thumb = seg.querySelector(':scope > .seg-thumb');
  if (!thumb) {
    thumb = document.createElement('span');
    thumb.className = 'seg-thumb';
    seg.prepend(thumb);
    seg.classList.add('has-thumb');
    segResize.observe(seg);
    const last = segPos.get(segKey(seg));
    if (last) { moveSegThumb(thumb, last, false); thumb.dataset.ready = '1'; } else animate = false;
  }
  const on = seg.querySelector(':scope > button.on');
  thumb.hidden = !on;
  if (!on || !on.offsetWidth) return; // 닫힌 창 안: 보일 때 segResize가 다시 부름
  const pos = { x: on.offsetLeft, w: on.offsetWidth };
  moveSegThumb(thumb, pos, animate && thumb.dataset.ready === '1');
  thumb.dataset.ready = '1';
  if (segKey(seg)) segPos.set(segKey(seg), pos);
}
const segResize = new ResizeObserver(list => list.forEach(e => placeSegThumb(e.target, true)));
new MutationObserver(list => {
  const segs = new Set();
  for (const m of list) {
    if (m.type === 'attributes') {
      const p = m.target.parentElement;
      if (p && p.classList.contains('seg')) segs.add(p);
      continue;
    }
    if (m.target.classList && m.target.classList.contains('seg')) segs.add(m.target);
    m.addedNodes.forEach(n => {
      if (n.nodeType !== 1) return;
      if (n.classList.contains('seg')) segs.add(n);
      n.querySelectorAll('.seg').forEach(s => segs.add(s));
    });
  }
  segs.forEach(s => placeSegThumb(s, true));
}).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
document.querySelectorAll('.seg').forEach(s => placeSegThumb(s, false));
// 아이폰 사파리는 이게 있어야 누르는 동안(:active) 모양이 바뀜
document.addEventListener('touchstart', () => {}, { passive: true });
