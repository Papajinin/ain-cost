// AIN Cost 입력 창 v6: 지출 적기·고치기·지우기, 할부(회차 나누기), 매달 나가는 돈, 내역 자동완성(꾹 눌러 이름 바꾸기)

const sheetOverlay = document.getElementById('sheetOverlay');
const sheetTitle = document.getElementById('sheetTitle');
const sheetSave = document.getElementById('sheetSave');
const amountLabel = document.getElementById('amountLabel');
const fAmount = document.getElementById('fAmount');
const fTitle = document.getElementById('fTitle');
const titleSuggest = document.getElementById('titleSuggest');
const catChips = document.getElementById('catChips');
const fMethod = document.getElementById('fMethod');
const instGroup = document.getElementById('instGroup');
const monthsText = document.getElementById('monthsText');
const monthsDown = document.getElementById('monthsDown');
const monthsUp = document.getElementById('monthsUp');
const splitLabel = document.getElementById('splitLabel');
const splitGrid = document.getElementById('splitGrid');
const instInfo = document.getElementById('instInfo');
const instInfoText = document.getElementById('instInfoText');
const recurGroup = document.getElementById('recurGroup');
const fRecur = document.getElementById('fRecur');
const recurDesc = document.getElementById('recurDesc');
const rowEndMonth = document.getElementById('rowEndMonth');
const fEndMonth = document.getElementById('fEndMonth');
const fDate = document.getElementById('fDate');
const fMemo = document.getElementById('fMemo');
const fError = document.getElementById('fError');
const deleteGroup = document.getElementById('deleteGroup');
const actionOverlay = document.getElementById('actionOverlay');
const actionMsg = document.getElementById('actionMsg');
const actionBtns = document.getElementById('actionBtns');

const MIN_MONTHS = 2;
const MAX_MONTHS = 36;

let form = null;      // 입력 중인 값
let original = null;  // 고치는 기록 (새로 적을 때는 null)
// kind: new(새로) | plain(보통 기록) | inst(할부 회차) | recur(매달 나가는 돈으로 들어온 기록)
let kind = 'new';
let titleIndex = []; // 지난 내역 이름: [{ title, count, last(가장 최근 기록) }] 많이 쓴 순

// ---------- 열기·닫기 ----------
function defaultDate() {
  if (monthOf(ui.today) === ui.month) return ui.today;
  return ui.month + '-01';
}

function isInstallMethod(id) {
  const m = findMethod(id);
  return !!m && !!m.installment;
}

function openSheet(recordId) {
  const r = recordId ? findRecord(recordId) : null;
  original = r ? { ...r } : null;
  kind = !r ? 'new' : r.installId ? 'inst' : r.recurringId && findRecurring(r.recurringId) ? 'recur' : 'plain';
  const s = state.settings;
  const cat = state.categories.some(c => c.id === s.lastCategory) ? s.lastCategory : state.categories[0].id;
  const plainMethods = state.methods.filter(m => !m.installment);
  const method = plainMethods.some(m => m.id === s.lastMethod) ? s.lastMethod : plainMethods[0].id;
  const tpl = kind === 'recur' ? findRecurring(r.recurringId) : null;
  form = {
    date: r ? r.date : defaultDate(),
    categoryId: r ? r.categoryId : cat,
    methodId: r ? r.methodId : method,
    months: 3,
    recurOn: tpl ? tpl.active : false,
    endMonth: tpl ? tpl.endMonth || '' : ''
  };
  fAmount.value = r ? r.amount.toLocaleString('ko-KR') : '';
  fTitle.value = r ? r.title : '';
  fMemo.value = r ? r.memo || '' : '';
  sheetTitle.textContent = r ? '지출 고치기' : '새 지출';
  buildTitleIndex();
  hideSuggest();
  deleteGroup.hidden = !r;
  showError('');
  renderForm();

  sheetOverlay.hidden = false;
  document.body.classList.add('locked');
  if (!r) { fAmount.focus({ preventScroll: true }); settleCaret(fAmount); } // 새로 적을 때만 바로 숫자 키패드
  requestAnimationFrame(() => sheetOverlay.classList.add('show'));
}

// 아이폰 Safari: 올라오는 중인 칸에 커서를 넣으면 깜빡이는 커서가 처음 자리(창 뒤)에 남을 때가 있어서,
// 창이 다 올라온 뒤 커서 위치를 한 번 더 잡아 줌 (키보드는 누르는 순간 넣어야 열리므로 그때 한 번, 지금 한 번)
// 처음 열 때 아이폰이 키보드를 띄우며 화면 전체를 밀어 버리면, 키보드가 다 올라온 뒤 원래 보던 위치로 되돌림
let caretHold = null; // { el, y }
function settleCaret(el) {
  caretHold = { el, y: window.scrollY };
  setTimeout(() => {
    if (document.activeElement !== el) return;
    const n = el.value.length;
    try { el.setSelectionRange(n, n); } catch (e) {}
    holdScroll();
  }, 320);
  setTimeout(() => { if (caretHold && caretHold.el === el) caretHold = null; }, 1000);
}
function holdScroll() {
  if (!caretHold || document.activeElement !== caretHold.el) return;
  if (window.scrollY !== caretHold.y) window.scrollTo(window.scrollX, caretHold.y);
}

function closeSheet() {
  document.activeElement && document.activeElement.blur();
  sheetOverlay.classList.remove('show');
  document.body.classList.remove('locked');
  setTimeout(() => { if (!sheetOverlay.classList.contains('show')) sheetOverlay.hidden = true; }, 300);
}

// ---------- 화면에 값 채우기 ----------
function renderForm() {
  fDate.value = form.date;
  catChips.innerHTML = state.categories.map(c =>
    `<button type="button" class="cat-chip${c.id === form.categoryId ? ' on' : ''}" data-id="${c.id}" aria-pressed="${c.id === form.categoryId}"><i style="background:var(--c-${c.color})"></i>${escapeHtml(c.name)}</button>`
  ).join('');

  // 할부 회차는 결제수단을 바꾸지 않음. 매달 나가는 돈은 할부로 바꿀 수 없음
  const methods = kind === 'recur' ? state.methods.filter(m => !m.installment) : state.methods;
  fMethod.hidden = kind === 'inst';
  fMethod.innerHTML = methods.map(m =>
    `<button type="button" data-id="${m.id}" class="${m.id === form.methodId ? 'on' : ''}" aria-pressed="${m.id === form.methodId}">${escapeHtml(m.name)}</button>`
  ).join('');

  const inst = kind !== 'inst' && isInstallMethod(form.methodId);
  amountLabel.textContent = kind === 'inst' ? '이번 회차 금액' : inst ? '총액' : '금액';
  instGroup.hidden = !inst;
  if (inst) renderSplit();

  instInfo.hidden = kind !== 'inst';
  if (kind === 'inst') {
    const series = installSeries(original.installId);
    const total = series.reduce((s, r) => s + r.amount, 0);
    instInfoText.textContent = `${original.inst.k} / ${original.inst.n} · 총액 ${won(total)}`;
  }

  recurGroup.hidden = inst || kind === 'inst';
  fRecur.checked = form.recurOn;
  rowEndMonth.hidden = !form.recurOn;
  fEndMonth.value = form.endMonth;
  fEndMonth.min = monthOf(form.date);
  recurDesc.hidden = !form.recurOn && kind !== 'recur';
  if (form.recurOn) {
    const day = Number(form.date.slice(8));
    recurDesc.textContent = `매달 ${day}일에 자동으로 들어가요${day >= 29 ? ' (그 날이 없는 달은 말일)' : ''}`;
  } else if (kind === 'recur') {
    recurDesc.textContent = '다음 달부터는 들어오지 않아요';
  }
}

// 할부: 몇 개월, 나눠진 금액 미리 보기
function renderSplit() {
  monthsText.textContent = form.months + '개월';
  monthsDown.disabled = form.months <= MIN_MONTHS;
  monthsUp.disabled = form.months >= MAX_MONTHS;
  const total = amountValue();
  if (!total) {
    splitLabel.textContent = '총액을 넣으면 나눠진 금액이 보여요';
    splitGrid.innerHTML = '';
    return;
  }
  splitLabel.textContent = '이렇게 나눠서 들어가요';
  const day = Number(form.date.slice(8));
  const amounts = splitAmounts(total, form.months);
  splitGrid.innerHTML = amounts.map((a, i) => {
    const d = dateIn(addMonths(monthOf(form.date), i), day);
    const [y, m] = d.split('-').map(Number);
    const label = (y !== Number(form.date.slice(0, 4)) ? `${String(y).slice(2)}년 ` : '') + `${m}월 · ${i + 1}/${form.months}`;
    return `<div><small>${label}</small><b>${won(a)}</b></div>`;
  }).join('');
}

function showError(msg) {
  fError.textContent = msg;
  fError.hidden = !msg;
}

function amountValue() {
  return Number(fAmount.value.replace(/[^0-9]/g, '')) || 0;
}

// ---------- 입력 반응 ----------
// 숫자만 받고 세 자리마다 쉼표
fAmount.addEventListener('input', () => {
  const digits = fAmount.value.replace(/[^0-9]/g, '').replace(/^0+/, '').slice(0, 12);
  fAmount.value = digits ? Number(digits).toLocaleString('ko-KR') : '';
  showError('');
  if (!instGroup.hidden) renderSplit();
});

[fTitle, fMemo].forEach(el => el.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
    e.preventDefault();
    trySave();
  }
}));

fDate.addEventListener('change', () => {
  if (!fDate.value) { fDate.value = form.date; return; }
  form.date = fDate.value;
  renderForm();
});

catChips.addEventListener('click', e => {
  const b = e.target.closest('.cat-chip');
  if (!b) return;
  form.categoryId = b.dataset.id;
  renderForm();
});

fMethod.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  form.methodId = b.dataset.id;
  if (isInstallMethod(form.methodId)) form.recurOn = false;
  showError('');
  renderForm();
});

monthsDown.addEventListener('click', () => { form.months = Math.max(MIN_MONTHS, form.months - 1); renderSplit(); });
monthsUp.addEventListener('click', () => { form.months = Math.min(MAX_MONTHS, form.months + 1); renderSplit(); });

fRecur.addEventListener('change', () => { form.recurOn = fRecur.checked; renderForm(); });
fEndMonth.addEventListener('change', () => { form.endMonth = fEndMonth.value; showError(''); });

// ---------- 내역 자동완성 ----------
// 창을 열 때 한 번 모아 둠 (같은 이름이면 많이 쓴 순, 횟수가 같으면 최근에 쓴 순)
function buildTitleIndex() {
  const map = new Map();
  state.records.forEach(r => {
    const t = (r.title || '').trim();
    if (!t) return;
    const e = map.get(t);
    if (!e) map.set(t, { title: t, count: 1, last: r });
    else {
      e.count++;
      if (r.date >= e.last.date) e.last = r;
    }
  });
  titleIndex = [...map.values()].sort((a, b) => b.count - a.count || (b.last.date > a.last.date ? 1 : -1));
}

function hideSuggest() {
  titleSuggest.hidden = true;
  titleSuggest.innerHTML = '';
}

// 친 글자가 들어간 이름을 최대 8개 (똑같이 적었으면 보이지 않음)
function renderSuggest() {
  const q = fTitle.value.trim();
  const hits = q ? titleIndex.filter(e => e.title !== q && e.title.includes(q)).slice(0, 8) : [];
  if (!hits.length) return hideSuggest();
  titleSuggest.innerHTML = hits.map((e, i) => {
    const at = e.title.indexOf(q);
    const name = escapeHtml(e.title.slice(0, at)) + '<mark>' + escapeHtml(q) + '</mark>' + escapeHtml(e.title.slice(at + q.length));
    return `<button class="sg" type="button" data-i="${i}"><span>${name}</span><small>${e.count}</small></button>`;
  }).join('');
  titleSuggest.hits = hits;
  titleSuggest.hidden = false;
  titleSuggest.scrollLeft = 0;
}

fTitle.addEventListener('input', renderSuggest);
fTitle.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== fTitle) hideSuggest(); }, 150));
// 추천을 누를 때 내역 칸의 키보드가 내려가지 않게. 꾹(0.5초) 누르면 이름 바꾸기
let sgPress = null;
let sgSkipClick = false;
titleSuggest.addEventListener('pointerdown', e => {
  const b = e.target.closest('.sg');
  if (!b) return;
  e.preventDefault();
  sgPress = { b, x: e.clientX, y: e.clientY };
  b.classList.add('pressing');
  sgPress.timer = setTimeout(() => {
    b.classList.remove('pressing');
    sgSkipClick = true;
    sgPress = null;
    openRename(titleSuggest.hits[Number(b.dataset.i)]);
  }, 500);
});
// 손가락이 움직이면(추천 줄을 옆으로 미는 중) 꾹 누르기 취소
function cancelSgPress(e) {
  if (!sgPress) return;
  if (e && e.type === 'pointermove' && Math.abs(e.clientX - sgPress.x) < 8 && Math.abs(e.clientY - sgPress.y) < 8) return;
  clearTimeout(sgPress.timer);
  sgPress.b.classList.remove('pressing');
  sgPress = null;
}
document.addEventListener('pointermove', cancelSgPress);
document.addEventListener('pointerup', () => cancelSgPress());
document.addEventListener('pointercancel', () => cancelSgPress());
titleSuggest.addEventListener('click', e => {
  if (sgSkipClick) { sgSkipClick = false; return; }
  const b = e.target.closest('.sg');
  if (!b) return;
  const pick = titleSuggest.hits[Number(b.dataset.i)];
  fTitle.value = pick.title;
  hideSuggest();
  // 새로 적을 때만: 그 이름을 가장 최근에 쓴 기록의 유형·결제수단을 미리 골라 둠 (바꿀 수 있음)
  if (kind === 'new') {
    const last = pick.last;
    if (state.categories.some(c => c.id === last.categoryId)) form.categoryId = last.categoryId;
    // 할부·매달 나가는 돈은 그때만의 설정이라 결제수단은 보통 수단일 때만 따라감
    const m = findMethod(last.methodId);
    if (m && !m.installment) form.methodId = last.methodId;
    showError('');
    renderForm();
  }
});

// ---------- 내역 이름 바꾸기 ----------
// 그 이름으로 적은 지난 기록(과 매달 나가는 돈)의 내역만 바꿈. 유형·금액·날짜는 그대로
// 이미 있는 이름으로 바꾸면 둘이 하나로 합쳐짐
const renameOverlay = document.getElementById('renameOverlay');
const renameInput = document.getElementById('renameInput');
const renameHint = document.getElementById('renameHint');
const renameSave = document.getElementById('renameSave');
let renameFrom = null; // { title, count }

function openRename(entry) {
  renameFrom = { title: entry.title, count: entry.count };
  renameInput.value = entry.title;
  updateRename();
  showOverlay(renameOverlay);
  setTimeout(() => { renameInput.focus(); renameInput.select(); }, 320);
}
function renameTarget() {
  const to = renameInput.value.trim();
  return to && to !== renameFrom.title ? to : '';
}
function updateRename() {
  const to = renameTarget();
  renameSave.disabled = !to;
  const other = to && titleIndex.find(e => e.title === to);
  renameHint.textContent = other
    ? `'${to}'(${other.count}건)과 합쳐져서 ${other.count + renameFrom.count}건이 돼요.`
    : `'${renameFrom.title}'로 적은 기록 ${renameFrom.count}건이 모두 새 이름으로 바뀌어요.`;
}
function closeRename() {
  renameInput.blur();
  hideOverlay(renameOverlay);
  document.body.classList.add('locked'); // 아래 입력 창은 아직 열려 있음
  setTimeout(() => fTitle.focus(), 320);
}
// '로'/'으로': 마지막 글자에 받침이 없거나 ㄹ이면 '로'
function josaRo(word) {
  const c = word.charCodeAt(word.length - 1) - 0xAC00;
  if (c < 0 || c > 11171) return '(으)로';
  const jong = c % 28;
  return jong === 0 || jong === 8 ? '로' : '으로';
}
function askRename() {
  const to = renameTarget();
  if (!to) return;
  const from = renameFrom.title;
  renameInput.blur();
  showActions(`'${from}' ${renameFrom.count}건을 '${to}'${josaRo(to)} 바꿀까요? 되돌릴 수 없어요.`, [
    { label: '바꾸기', danger: true, fn: () => {
      state.records.forEach(r => { if ((r.title || '').trim() === from) r.title = to; });
      state.recurring.forEach(t => { if ((t.title || '').trim() === from) t.title = to; });
      if (fTitle.value.trim() === from) fTitle.value = to;
      saveState();
      buildTitleIndex();
      renderAll();
      closeRename();
      renderSuggest();
    } }
  ]);
}
renameInput.addEventListener('input', updateRename);
renameInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); askRename(); } });
renameSave.addEventListener('click', askRename);
document.getElementById('renameCancel').addEventListener('click', closeRename);
renameOverlay.addEventListener('click', e => { if (e.target === renameOverlay) closeRename(); });

// ---------- 저장 ----------
function validate() {
  const amount = amountValue();
  if (!amount) { fAmount.focus(); return '금액을 입력해 주세요'; }
  if (!fTitle.value.trim()) { fTitle.focus(); return '내역을 입력해 주세요'; }
  if (kind !== 'inst' && isInstallMethod(form.methodId) && amount < form.months) return '총액이 개월 수보다 작아요';
  if (form.recurOn && form.endMonth && form.endMonth < monthOf(form.date)) return '끝나는 달은 날짜와 같은 달이거나 그 뒤여야 해요';
  return '';
}

function fields() {
  return {
    date: form.date,
    title: fTitle.value.trim(),
    amount: amountValue(),
    categoryId: form.categoryId,
    methodId: form.methodId,
    memo: fMemo.value.trim()
  };
}

// 이 기록부터 매달 나가는 돈으로 (다음 달부터 자동)
function startRecurring(rec) {
  const tpl = {
    id: 'p_' + newId(),
    title: rec.title, amount: rec.amount, day: Number(rec.date.slice(8)),
    categoryId: rec.categoryId, methodId: rec.methodId, memo: rec.memo,
    endMonth: form.endMonth || null, active: true, lastMonth: monthOf(rec.date)
  };
  state.recurring.push(tpl);
  rec.recurringId = tpl.id;
  fillRecurring(); // 지난달 날짜로 등록했으면 이번 달 것까지 채움
}

function finishSave() {
  state.settings.lastCategory = form.categoryId;
  if (!isInstallMethod(form.methodId)) state.settings.lastMethod = form.methodId;
  ui.month = monthOf(form.date); // 다른 달로 적었으면 그 달을 보여 줌
  saveState();
  closeSheet();
  renderAll();
}

function trySave() {
  const err = validate();
  showError(err);
  if (err) return;
  const f = fields();

  if (kind === 'new' || kind === 'plain') {
    if (isInstallMethod(f.methodId)) {
      if (original) state.records = state.records.filter(r => r.id !== original.id);
      createInstallments(f, f.amount, form.months);
      return finishSave();
    }
    let rec;
    if (original) rec = Object.assign(findRecord(original.id), f);
    else { rec = { id: newId(), ...f }; state.records.push(rec); }
    if (form.recurOn) startRecurring(rec);
    return finishSave();
  }

  if (kind === 'inst') return saveInstallment(f);
  return saveRecurringRecord(f);
}

// 할부 회차 고치기: 이 회차만 / 남은 회차 모두
function saveInstallment(f) {
  const rec = findRecord(original.id);
  showActions('할부 기록이에요', [
    { label: '이 회차만 바꾸기', fn: () => { Object.assign(rec, f); finishSave(); } },
    { label: '남은 회차 모두 바꾸기', fn: () => {
      const day = Number(f.date.slice(8));
      const dayChanged = f.date !== original.date;
      installSeries(original.installId).forEach(r => {
        if (r.inst.k < original.inst.k) return;
        Object.assign(r, { title: f.title, categoryId: f.categoryId, memo: f.memo });
        if (f.amount !== original.amount) r.amount = f.amount;
        if (r.id === rec.id) r.date = f.date;
        else if (dayChanged) r.date = dateIn(monthOf(r.date), day);
      });
      finishSave();
    } }
  ]);
}

// 매달 나가는 돈으로 들어온 기록 고치기: 이번 달만 / 다음 달부터도
function saveRecurringRecord(f) {
  const rec = findRecord(original.id);
  const tpl = findRecurring(original.recurringId);
  // 켜기·끄기, 끝나는 달은 어느 쪽을 골라도 적용
  const applyTpl = () => {
    tpl.endMonth = form.endMonth || null;
    if (!form.recurOn) tpl.active = false;
    else if (!tpl.active) { tpl.active = true; tpl.lastMonth = monthOf(ui.today); } // 다시 켜면 빠진 달은 채우지 않음
  };

  const changed = ['date', 'title', 'amount', 'categoryId', 'methodId', 'memo'].some(k => (original[k] || '') !== (f[k] || ''));
  if (!changed || !form.recurOn) { applyTpl(); Object.assign(rec, f); return finishSave(); }

  showActions('매달 나가는 돈이에요', [
    { label: '이번 달만 바꾸기', fn: () => { applyTpl(); Object.assign(rec, f); finishSave(); } },
    { label: '다음 달부터도 이렇게', fn: () => {
      applyTpl();
      Object.assign(rec, f);
      Object.assign(tpl, { title: f.title, amount: f.amount, day: Number(f.date.slice(8)), categoryId: f.categoryId, methodId: f.methodId, memo: f.memo });
      finishSave();
    } }
  ]);
}

// ---------- 지우기 ----------
function tryDelete() {
  if (!original) return;
  const remove = fn => {
    state.records = state.records.filter(r => !fn(r));
    saveState();
    closeSheet();
    renderAll();
  };
  if (kind === 'inst') {
    showActions('할부 기록이에요', [
      { label: '이 회차만 삭제', danger: true, fn: () => remove(r => r.id === original.id) },
      { label: '남은 회차 모두 삭제', danger: true, fn: () => remove(r => r.installId === original.installId && r.inst.k >= original.inst.k) }
    ]);
    return;
  }
  if (kind === 'recur') {
    const tpl = findRecurring(original.recurringId);
    showActions('매달 나가는 돈이에요', [
      { label: '이번 달만 삭제', danger: true, fn: () => remove(r => r.id === original.id) },
      { label: '삭제하고 다음 달부터 그만', danger: true, fn: () => { tpl.active = false; remove(r => r.id === original.id); } }
    ]);
    return;
  }
  showActions('', [{ label: '지출 삭제', danger: true, fn: () => remove(r => r.id === original.id) }]);
}

// ---------- 선택 창 ----------
let actionList = [];

function showActions(msg, list) {
  actionList = list;
  actionMsg.textContent = msg;
  actionBtns.innerHTML = list.map((a, i) =>
    `<button type="button" class="action-btn${a.danger ? ' danger' : ''}" data-i="${i}">${a.label}</button>`
  ).join('');
  document.activeElement && document.activeElement.blur();
  actionOverlay.hidden = false;
  requestAnimationFrame(() => actionOverlay.classList.add('show'));
}

function hideActions() {
  actionOverlay.classList.remove('show');
  setTimeout(() => { if (!actionOverlay.classList.contains('show')) actionOverlay.hidden = true; }, 260);
}

actionBtns.addEventListener('click', e => {
  const b = e.target.closest('.action-btn');
  if (!b) return;
  const a = actionList[Number(b.dataset.i)];
  hideActions();
  a.fn();
});

document.getElementById('actionCancel').addEventListener('click', hideActions);
actionOverlay.addEventListener('click', e => { if (e.target === actionOverlay) hideActions(); });

document.getElementById('sheetCancel').addEventListener('click', closeSheet);
sheetSave.addEventListener('click', trySave);
document.getElementById('sheetDelete').addEventListener('click', tryDelete);
sheetOverlay.addEventListener('click', e => { if (e.target === sheetOverlay) closeSheet(); });

// 입력 칸이 키보드에 가리지 않게: 그 칸이 속한 묶음을 창 맨 위쪽으로 올림 (AIN Todo와 같은 방법)
function revealFocused() {
  const el = document.activeElement;
  if (!el || !el.matches('input[type="text"]') || !el.closest('.sheet-scroll')) return;
  // 창 안에서만 스크롤 (scrollIntoView는 화면 전체까지 밀어 버려서 쓰지 않음)
  const block = el.closest('.group') || el;
  const box = el.closest('.sheet-scroll');
  box.scrollTo({ top: box.scrollTop + block.getBoundingClientRect().top - box.getBoundingClientRect().top, behavior: 'smooth' });
}
document.addEventListener('focusin', e => {
  if (!e.target.closest('.sheet-scroll') || !e.target.matches('input[type="text"]')) return;
  setTimeout(revealFocused, 350); // 키보드가 다 올라온 뒤
});

// 아이폰 키보드가 올라오면 입력 창도 키보드 위로 올림
if (window.visualViewport) {
  const vv = window.visualViewport;
  const fit = () => {
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--kb', kb + 'px');
    revealFocused();
    holdScroll();
  };
  vv.addEventListener('resize', fit);
  vv.addEventListener('scroll', fit);
}
