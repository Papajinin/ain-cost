// AIN Cost 입력 창 v2: 지출 적기·고치기·지우기, 할부(회차 나누기), 매달 나가는 돈

const sheetOverlay = document.getElementById('sheetOverlay');
const sheetTitle = document.getElementById('sheetTitle');
const sheetSave = document.getElementById('sheetSave');
const amountLabel = document.getElementById('amountLabel');
const fAmount = document.getElementById('fAmount');
const fTitle = document.getElementById('fTitle');
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
  deleteGroup.hidden = !r;
  showError('');
  renderForm();

  sheetOverlay.hidden = false;
  document.body.classList.add('locked');
  if (!r) fAmount.focus(); // 새로 적을 때만 바로 숫자 키패드
  requestAnimationFrame(() => sheetOverlay.classList.add('show'));
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
  const block = el.closest('.group') || el;
  block.scrollIntoView({ block: 'start', behavior: 'smooth' });
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
  };
  vv.addEventListener('resize', fit);
  vv.addEventListener('scroll', fit);
}
