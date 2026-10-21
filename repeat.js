// AIN Cost 할부·매달 나가는 돈 v2: 회차 나누기, 말일 규칙, 그달 것 만들기

// 그달에 그 날짜가 없으면(29~31일) 그달 말일로
function dateIn(month, day) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return month + '-' + String(Math.min(day, last)).padStart(2, '0');
}

// 나눠 떨어지지 않는 돈은 마지막 회차에서 맞춤 (예: 500,000 ÷ 3 → 166,667 / 166,667 / 166,666)
function splitAmounts(total, n) {
  const per = Math.ceil(total / n);
  return Array.from({ length: n }, (_, i) => (i < n - 1 ? per : total - per * (n - 1)));
}

// ---------- 할부 ----------
// 첫 회차 날짜부터 매달 같은 날에 한 회차씩. 끝이 정해져 있어서 한 번에 다 만든다
function createInstallments(fields, total, n) {
  const installId = 'i_' + newId();
  const day = Number(fields.date.slice(8));
  const amounts = splitAmounts(total, n);
  amounts.forEach((amount, i) => {
    state.records.push({
      ...fields,
      id: newId(),
      date: dateIn(addMonths(monthOf(fields.date), i), day),
      amount,
      installId,
      inst: { k: i + 1, n }
    });
  });
}

function installSeries(installId) {
  return state.records.filter(r => r.installId === installId).sort((a, b) => a.inst.k - b.inst.k);
}

// ---------- 매달 나가는 돈 ----------
// 틀: { id, title, amount, day, categoryId, methodId, memo, endMonth(선택), active, lastMonth(마지막으로 만든 달) }
function findRecurring(id) {
  return (state.recurring || []).find(t => t.id === id);
}

// 지난번에 만든 달 다음 달부터 이번 달까지, 그달 것을 넣는다 (미래 달은 만들지 않음)
function fillRecurring() {
  const now = monthOf(ui.today);
  let added = 0;
  (state.recurring || []).forEach(t => {
    if (!t.active) return;
    for (let m = addMonths(t.lastMonth, 1); m <= now; m = addMonths(m, 1)) {
      if (t.endMonth && m > t.endMonth) { t.active = false; break; }
      // 기록 id를 '틀 + 달'로 정해 두면 폰과 PC가 동시에 채워도 한 건만 생김
      const id = 'rc_' + t.id + '_' + m;
      if (!state.records.some(r => r.id === id)) state.records.push({
        id,
        date: dateIn(m, t.day),
        title: t.title,
        amount: t.amount,
        categoryId: t.categoryId,
        methodId: t.methodId,
        memo: t.memo || '',
        recurringId: t.id
      });
      t.lastMonth = m;
      added++;
    }
    if (t.endMonth && t.lastMonth >= t.endMonth) t.active = false;
  });
  return added;
}
