// AIN Cost 지출 화면 v3: 이번 달 요약(유형별 펼치기), 날짜별 기록(할부 회차·매달 표시, 앞으로 나갈 돈 접기), 눌러서 수정

const sumTotal = document.getElementById('sumTotal');
const sumBar = document.getElementById('sumBar');
const sumGroups = document.getElementById('sumGroups');
const sumCompare = document.getElementById('sumCompare');
const sumCats = document.getElementById('sumCats');
const sumToggle = document.getElementById('sumToggle');
const sumToggleText = document.getElementById('sumToggleText');
const recordsEl = document.getElementById('records');

const ARROW_DOWN = '<svg viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6"/></svg>';
const ARROW_UP = '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';

function renderSummary() {
  const recs = monthRecords(ui.month);
  const total = sumBy(recs, () => true);
  const free = sumBy(recs, isFree);
  const must = total - free;
  sumTotal.textContent = won(total);

  // 필수(회색) / 선택(파랑) 막대
  if (total > 0) {
    const mp = must / total * 100;
    sumBar.innerHTML = `<span style="width:${mp}%;background:var(--must)"></span><span style="width:${100 - mp}%;background:var(--primary)"></span>`;
    sumBar.setAttribute('aria-label', `필수 ${Math.round(mp)}%, 선택 ${Math.round(100 - mp)}%`);
  } else {
    sumBar.innerHTML = '';
    sumBar.setAttribute('aria-label', '이번 달 기록 없음');
  }
  sumGroups.innerHTML =
    `<span><i class="g-dot" style="background:var(--must)"></i>필수 <b>${won(must)}</b></span>` +
    `<span><i class="g-dot" style="background:var(--primary)"></i>선택 <b>${won(free)}</b></span>`;

  // 선택 지출: 작년 같은 달과 비교
  const lastMonth = addMonths(ui.month, -12);
  const lastRecs = monthRecords(lastMonth);
  const m = Number(ui.month.slice(5));
  if (!lastRecs.length) {
    sumCompare.innerHTML = `<span>작년 ${m}월 기록이 없어요</span>`;
  } else {
    const diff = free - sumBy(lastRecs, isFree);
    if (diff === 0) sumCompare.innerHTML = `<span>선택 지출이 작년 ${m}월과 <b>같아요</b></span>`;
    else sumCompare.innerHTML = `<span class="${diff < 0 ? 'down' : 'up'}">${diff < 0 ? ARROW_DOWN : ARROW_UP}</span>` +
      `<span>선택 지출이 작년 ${m}월보다 <b>${won(Math.abs(diff))} ${diff < 0 ? '줄었어요' : '늘었어요'}</b></span>`;
  }

  // 유형별 (펼쳤을 때만)
  sumCats.hidden = !ui.catsOpen;
  sumToggle.setAttribute('aria-expanded', ui.catsOpen);
  sumToggleText.textContent = ui.catsOpen ? '접기' : '유형별 보기';
  if (ui.catsOpen) {
    const amounts = state.categories.map(c => sumBy(recs, r => r.categoryId === c.id));
    const max = Math.max(...amounts, 1);
    let html = '';
    ['must', 'free'].forEach(g => {
      html += `<div class="sc-head">${g === 'must' ? '필수' : '선택'}</div>`;
      state.categories.forEach((c, i) => {
        if (c.group !== g) return;
        const w = amounts[i] ? Math.max(amounts[i] / max * 100, 1.5) : 0;
        html += `<div class="sc-row"><i class="g-dot" style="background:var(--c-${c.color})"></i>` +
          `<span class="sc-name">${escapeHtml(c.name)}</span>` +
          `<span class="sc-track"><i style="width:${w}%;background:var(--c-${c.color})"></i></span>` +
          `<span class="sc-amt">${won(amounts[i])}</span></div>`;
      });
    });
    sumCats.innerHTML = html;
  }
}

function dayTitle(date) {
  const d = parseYmd(date);
  return `${d.getDate()}일 ${WEEK_NAMES[d.getDay()]}요일${date === ui.today ? ' · 오늘' : ''}`;
}

function dayGroups(recs) {
  // 최근 날짜가 위로, 같은 날은 적은 순서대로
  const byDay = {};
  recs.forEach(r => { (byDay[r.date] = byDay[r.date] || []).push(r); });
  return Object.keys(byDay).sort().reverse().map(date => {
    const list = byDay[date];
    const rows = list.map(r => {
      const cat = findCat(r.categoryId);
      const method = findMethod(r.methodId);
      const pay = r.inst ? `할부 ${r.inst.k}/${r.inst.n}` : method ? method.name : '';
      const meta = [cat ? cat.name : '', pay, r.recurringId ? '매달' : '', r.memo || ''].filter(Boolean).join(' · ');
      return `<button class="rec" type="button" data-id="${r.id}">
        <i class="r-dot" style="background:${catColor(r.categoryId)}"></i>
        <span class="r-body"><span class="r-title">${escapeHtml(r.title)}</span><span class="r-meta">${escapeHtml(meta)}</span></span>
        <span class="r-amt">${won(r.amount)}</span>
      </button>`;
    }).join('');
    return `<div class="day-head"><h3>${dayTitle(date)}</h3><span>${won(sumBy(list, () => true))}</span></div>
      <div class="list">${rows}</div>`;
  }).join('');
}

function renderRecords() {
  const recs = monthRecords(ui.month);
  if (!recs.length) {
    recordsEl.innerHTML = '<p class="empty">이 달에 적은 지출이 없어요</p>';
    return;
  }
  // 이번 달이면 내일 이후 기록(매달 나가는 돈, 할부, 미리 적은 것)은 한 줄로 접어서 오늘이 바로 보이게
  const future = monthOf(ui.today) === ui.month ? recs.filter(r => r.date > ui.today) : [];
  if (!future.length) {
    recordsEl.innerHTML = dayGroups(recs);
    return;
  }
  const days = future.map(r => Number(r.date.slice(8)));
  const from = Math.min(...days), to = Math.max(...days);
  recordsEl.innerHTML = `<div class="future">
      <button class="future-row" type="button" id="futureToggle" aria-expanded="${ui.futureOpen}">
        <span class="fu-body"><span class="fu-title">앞으로 나갈 돈</span><span class="r-meta">${future.length}건 · ${from === to ? from + '일' : `${from}일~${to}일`}</span></span>
        <span class="fu-amt">${won(sumBy(future, () => true))}</span>
        <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      ${ui.futureOpen ? `<div class="future-days">${dayGroups(future)}</div>` : ''}
    </div>` + dayGroups(recs.filter(r => r.date <= ui.today));
}

function findRecord(id) {
  return state.records.find(r => r.id === id);
}

sumToggle.addEventListener('click', () => {
  ui.catsOpen = !ui.catsOpen;
  renderSummary();
});

recordsEl.addEventListener('click', e => {
  if (e.target.closest('#futureToggle')) {
    ui.futureOpen = !ui.futureOpen;
    renderRecords();
    return;
  }
  const row = e.target.closest('.rec');
  if (row) openSheet(row.dataset.id);
});
