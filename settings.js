// AIN Cost 설정 v4: 화면 모드, 테마 색, 유형 관리(묶음·색·순서), 결제수단 관리, 매달 나가는 돈 목록, 계정, 지난 기록 불러오기

const settingsOverlay = document.getElementById('settingsOverlay');
const sCats = document.getElementById('sCats');
const sMethods = document.getElementById('sMethods');
const sRecur = document.getElementById('sRecur');
const COLOR_KEYS = ['blue', 'green', 'orange', 'red', 'purple', 'pink', 'teal', 'brown'];
const DRAG_SVG = '<svg viewBox="0 0 24 24"><path d="M4 8h16M4 12h16M4 16h16"/></svg>';

let openId = null; // 고치는 중인 줄 (유형·결제수단·매달 나가는 돈 중 하나)

function openSettings() {
  openId = null;
  renderSettings();
  showOverlay(settingsOverlay);
}

function renderSettings() {
  document.getElementById('sTheme').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === state.settings.theme));
  document.getElementById('sAccent').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === (state.settings.accent || 'blue')));
  document.getElementById('accountEmail').textContent = (cloud.user && cloud.user.email) || '';
  renderSettingsCats();
  renderSettingsMethods();
  renderSettingsRecur();
}

function countRecords(fn) {
  return state.records.filter(fn).length;
}

// ---------- 유형 ----------
function renderSettingsCats() {
  sCats.innerHTML = state.categories.map(c => {
    const open = c.id === openId;
    return `<div class="cat-row${open ? ' open' : ''}" data-id="${c.id}">
      <div class="cat-line">
        <span class="drag" aria-label="순서 바꾸기">${DRAG_SVG}</span>
        <button class="cat-main" type="button" aria-expanded="${open}">
          <i style="background:var(--c-${c.color})"></i>
          <span class="cat-name">${escapeHtml(c.name)}</span>
          <span class="tag">${c.group === 'must' ? '필수' : '선택'}</span>
          <span class="cat-count num">${countRecords(r => r.categoryId === c.id)}건</span>
        </button>
      </div>
      ${open ? `<div class="cat-edit">
        <input class="cat-name-input" type="text" value="${escapeHtml(c.name)}" maxlength="10" enterkeyhint="done" autocomplete="off" aria-label="유형 이름">
        <div class="row"><span>묶음</span>
          <div class="seg" data-act="group">
            <button type="button" data-v="must" class="${c.group === 'must' ? 'on' : ''}">필수</button>
            <button type="button" data-v="free" class="${c.group === 'free' ? 'on' : ''}">선택</button>
          </div>
        </div>
        <div class="color-dots">${COLOR_KEYS.map(k =>
          `<button type="button" class="color-dot${k === c.color ? ' on' : ''}" data-color="${k}" aria-label="${k}"><i style="background:var(--c-${k})"></i></button>`).join('')}</div>
        <button class="row danger" type="button" data-act="del">유형 삭제</button>
      </div>` : ''}
    </div>`;
  }).join('') +
    `<button class="row link add-row" type="button" data-act="add">+ 유형 추가</button>`;
}

sCats.addEventListener('click', e => {
  if (e.target.closest('[data-act="add"]')) {
    const used = state.categories.map(c => c.color);
    const cat = { id: 'cat_' + Date.now().toString(36), name: '새 유형', color: COLOR_KEYS.find(k => !used.includes(k)) || 'blue', group: 'free' };
    state.categories.push(cat);
    saveState();
    openId = cat.id;
    renderSettingsCats();
    focusNameInput(sCats);
    return;
  }
  const row = e.target.closest('.cat-row');
  if (!row) return;
  const cat = findCat(row.dataset.id);
  if (e.target.closest('.cat-main')) return toggleOpen(cat.id);
  const g = e.target.closest('[data-act="group"] button');
  if (g) { cat.group = g.dataset.v; return changed(); }
  const dot = e.target.closest('.color-dot');
  if (dot) { cat.color = dot.dataset.color; return changed(); }
  if (e.target.closest('[data-act="del"]')) deleteCategory(cat);
});

// 그 유형의 기록이 있으면 다른 유형으로 옮긴 뒤 삭제
function deleteCategory(cat) {
  if (state.categories.length === 1) {
    showActions('유형이 하나뿐이라 지울 수 없어요', []);
    return;
  }
  const remove = targetId => {
    if (targetId) {
      state.records.forEach(r => { if (r.categoryId === cat.id) r.categoryId = targetId; });
      state.recurring.forEach(t => { if (t.categoryId === cat.id) t.categoryId = targetId; });
    }
    state.categories = state.categories.filter(c => c.id !== cat.id);
    if (state.settings.lastCategory === cat.id) delete state.settings.lastCategory;
    openId = null;
    changed();
  };
  const count = countRecords(r => r.categoryId === cat.id) + state.recurring.filter(t => t.categoryId === cat.id).length;
  if (!count) {
    showActions(`'${cat.name}' 유형을 삭제할까요?`, [{ label: '유형 삭제', danger: true, fn: () => remove(null) }]);
    return;
  }
  showActions(`'${cat.name}'의 기록 ${countRecords(r => r.categoryId === cat.id)}개를 어느 유형으로 옮길까요? 옮긴 뒤 이 유형은 삭제돼요.`,
    state.categories.filter(c => c.id !== cat.id).map(c => ({
      label: `<i class="a-dot" style="background:var(--c-${c.color})"></i>${escapeHtml(c.name)}`,
      fn: () => remove(c.id)
    })));
}

// ---------- 결제수단 ----------
function renderSettingsMethods() {
  sMethods.innerHTML = state.methods.map(m => {
    const open = m.id === openId;
    return `<div class="cat-row${open ? ' open' : ''}" data-id="${m.id}">
      <div class="cat-line">
        <span class="drag" aria-label="순서 바꾸기">${DRAG_SVG}</span>
        <button class="cat-main" type="button" aria-expanded="${open}">
          <span class="cat-name">${escapeHtml(m.name)}</span>
          ${m.installment ? '<span class="tag">할부 기능</span>' : ''}
          <span class="cat-count num">${countRecords(r => r.methodId === m.id)}건</span>
        </button>
      </div>
      ${open ? `<div class="cat-edit">
        <input class="cat-name-input" type="text" value="${escapeHtml(m.name)}" maxlength="8" enterkeyhint="done" autocomplete="off" aria-label="결제수단 이름">
        ${m.installment ? '<p class="row-note">할부 기능과 연결돼 있어서 이름만 바꿀 수 있어요.</p>' : '<button class="row danger" type="button" data-act="del">결제수단 삭제</button>'}
      </div>` : ''}
    </div>`;
  }).join('') +
    `<button class="row link add-row" type="button" data-act="add">+ 결제수단 추가</button>`;
}

sMethods.addEventListener('click', e => {
  if (e.target.closest('[data-act="add"]')) {
    const m = { id: 'pay_' + Date.now().toString(36), name: '새 결제수단' };
    // 할부보다 앞에 넣음
    const at = state.methods.findIndex(x => x.installment);
    state.methods.splice(at < 0 ? state.methods.length : at, 0, m);
    saveState();
    openId = m.id;
    renderSettingsMethods();
    focusNameInput(sMethods);
    return;
  }
  const row = e.target.closest('.cat-row');
  if (!row) return;
  const m = findMethod(row.dataset.id);
  if (e.target.closest('.cat-main')) return toggleOpen(m.id);
  if (e.target.closest('[data-act="del"]')) deleteMethod(m);
});

function deleteMethod(m) {
  const others = state.methods.filter(x => x.id !== m.id && !x.installment);
  if (!others.length) {
    showActions('결제수단이 하나뿐이라 지울 수 없어요', []);
    return;
  }
  const remove = targetId => {
    if (targetId) {
      state.records.forEach(r => { if (r.methodId === m.id) r.methodId = targetId; });
      state.recurring.forEach(t => { if (t.methodId === m.id) t.methodId = targetId; });
    }
    state.methods = state.methods.filter(x => x.id !== m.id);
    if (state.settings.lastMethod === m.id) delete state.settings.lastMethod;
    openId = null;
    changed();
  };
  const count = countRecords(r => r.methodId === m.id) + state.recurring.filter(t => t.methodId === m.id).length;
  if (!count) {
    showActions(`'${m.name}'을(를) 삭제할까요?`, [{ label: '결제수단 삭제', danger: true, fn: () => remove(null) }]);
    return;
  }
  showActions(`'${m.name}' 기록 ${countRecords(r => r.methodId === m.id)}개를 어느 결제수단으로 옮길까요? 옮긴 뒤 이 결제수단은 삭제돼요.`,
    others.map(x => ({ label: escapeHtml(x.name), fn: () => remove(x.id) })));
}

// ---------- 매달 나가는 돈 ----------
function renderSettingsRecur() {
  const list = [...state.recurring].sort((a, b) => (b.active - a.active) || (a.day - b.day));
  if (!list.length) {
    sRecur.innerHTML = '<p class="row-note pad">아직 없어요. 지출을 적을 때 "매달 나가는 돈으로 등록"을 켜면 여기에 생겨요.</p>';
    return;
  }
  sRecur.innerHTML = list.map(t => {
    const open = t.id === openId;
    const sub = t.active ? `매달 ${t.day}일${t.endMonth ? ` · ${Number(t.endMonth.slice(0, 4))}년 ${Number(t.endMonth.slice(5))}월까지` : ''}` : '그만 나감';
    return `<div class="cat-row${open ? ' open' : ''}${t.active ? '' : ' off'}" data-id="${t.id}">
      <button class="cat-main rc-main" type="button" aria-expanded="${open}">
        <i style="background:${catColor(t.categoryId)}"></i>
        <span class="rc-text"><span class="cat-name">${escapeHtml(t.title)}</span><span class="rc-sub">${sub}</span></span>
        <span class="rc-amt num">${won(t.amount)}</span>
      </button>
      ${open ? `<div class="cat-edit">
        <input class="cat-name-input" type="text" value="${escapeHtml(t.title)}" maxlength="20" enterkeyhint="done" autocomplete="off" aria-label="내역">
        <label class="row"><span>금액</span><span class="rc-amount-box"><input class="rc-amount num" type="text" inputmode="numeric" value="${t.amount.toLocaleString('ko-KR')}" aria-label="금액">원</span></label>
        <label class="row"><span>매달 며칠</span><select class="f-date rc-day" aria-label="매달 며칠">${Array.from({ length: 31 }, (_, i) =>
          `<option value="${i + 1}"${i + 1 === t.day ? ' selected' : ''}>${i + 1}일${i + 1 >= 29 ? ' (없으면 말일)' : ''}</option>`).join('')}</select></label>
        <label class="row"><span>끝나는 달 <em class="opt">(선택)</em></span><input class="f-date rc-end" type="month" value="${t.endMonth || ''}"></label>
        <label class="row"><span>매달 들어오기</span><input class="switch rc-on" type="checkbox"${t.active ? ' checked' : ''}></label>
        <p class="row-note">바꾼 내용은 다음 달부터 들어오는 기록에 적용돼요. 이미 들어온 기록은 그대로예요.</p>
        <button class="row danger" type="button" data-act="del">목록에서 삭제</button>
      </div>` : ''}
    </div>`;
  }).join('');
}

sRecur.addEventListener('click', e => {
  const row = e.target.closest('.cat-row');
  if (!row) return;
  const t = findRecurring(row.dataset.id);
  if (e.target.closest('.rc-main')) return toggleOpen(t.id);
  if (e.target.closest('[data-act="del"]')) {
    showActions(`'${t.title}'을(를) 매달 나가는 돈 목록에서 지울까요? 이미 들어온 기록은 남아요.`, [{ label: '목록에서 삭제', danger: true, fn: () => {
      state.recurring = state.recurring.filter(x => x.id !== t.id);
      state.records.forEach(r => { if (r.recurringId === t.id) delete r.recurringId; });
      openId = null;
      changed();
    } }]);
  }
});

sRecur.addEventListener('change', e => {
  const row = e.target.closest('.cat-row');
  if (!row) return;
  const t = findRecurring(row.dataset.id);
  if (e.target.matches('.rc-day')) t.day = Number(e.target.value);
  if (e.target.matches('.rc-end')) t.endMonth = e.target.value || null;
  if (e.target.matches('.rc-on')) {
    if (e.target.checked && !t.active) { t.active = true; t.lastMonth = monthOf(ui.today); } // 다시 켜면 다음 달부터
    if (!e.target.checked) t.active = false;
  }
  changed();
});

sRecur.addEventListener('input', e => {
  if (!e.target.matches('.rc-amount')) return;
  const t = findRecurring(e.target.closest('.cat-row').dataset.id);
  const digits = e.target.value.replace(/[^0-9]/g, '').replace(/^0+/, '').slice(0, 12);
  e.target.value = digits ? Number(digits).toLocaleString('ko-KR') : '';
  if (!digits) return;
  t.amount = Number(digits);
  e.target.closest('.cat-row').querySelector('.rc-amt').textContent = won(t.amount);
  saveState();
});

// ---------- 공통: 펼치기, 이름 고치기, 저장 ----------
function toggleOpen(id) {
  openId = openId === id ? null : id;
  renderSettings();
}

function changed() {
  saveState();
  renderSettings();
  renderAll();
}

function focusNameInput(container) {
  const input = container.querySelector('.cat-name-input');
  if (!input) return;
  input.focus();
  input.select();
}

// 이름은 입력하는 대로 저장 (빈 이름은 저장하지 않음)
[sCats, sMethods, sRecur].forEach(box => {
  box.addEventListener('input', e => {
    if (!e.target.matches('.cat-name-input')) return;
    const row = e.target.closest('.cat-row');
    const item = box === sCats ? findCat(row.dataset.id) : box === sMethods ? findMethod(row.dataset.id) : findRecurring(row.dataset.id);
    const name = e.target.value.trim();
    if (!name) return;
    if (box === sRecur) item.title = name;
    else item.name = name;
    row.querySelector('.cat-name').textContent = name;
    saveState();
  });
  box.addEventListener('keydown', e => {
    if (e.target.matches('input[type="text"]') && e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) e.target.blur();
  });
  // 고치기를 마치면 화면 전체에 반영
  box.addEventListener('focusout', e => { if (e.target.matches('input[type="text"]')) renderAll(); });
});

// ---------- 끌어서 순서 바꾸기 (유형, 결제수단) ----------
let drag = null;

[[sCats, () => state.categories, v => { state.categories = v; }], [sMethods, () => state.methods, v => { state.methods = v; }]].forEach(([box, get, set]) => {
  box.addEventListener('pointerdown', e => {
    const handle = e.target.closest('.drag');
    if (!handle) return;
    e.preventDefault();
    if (openId) { openId = null; renderSettings(); return; } // 고치는 중인 칸이 있으면 먼저 닫기
    const row = handle.closest('.cat-row');
    const rows = [...box.querySelectorAll('.cat-row')];
    drag = { box, get, set, row, rows, from: rows.indexOf(row), to: rows.indexOf(row), y: e.clientY, h: row.offsetHeight };
    handle.setPointerCapture(e.pointerId);
    row.classList.add('dragging');
  });
  box.addEventListener('pointermove', e => {
    if (!drag || drag.box !== box) return;
    const dy = e.clientY - drag.y;
    drag.to = Math.max(0, Math.min(drag.rows.length - 1, drag.from + Math.round(dy / drag.h)));
    drag.row.style.transform = `translateY(${dy}px)`;
    drag.rows.forEach((r, i) => {
      if (r === drag.row) return;
      let shift = 0;
      if (drag.from < drag.to && i > drag.from && i <= drag.to) shift = -drag.h;
      if (drag.from > drag.to && i < drag.from && i >= drag.to) shift = drag.h;
      r.style.transform = shift ? `translateY(${shift}px)` : '';
    });
  });
  const end = () => {
    if (!drag || drag.box !== box) return;
    const { from, to, get: g, set: s } = drag;
    drag = null;
    if (from !== to) {
      const list = [...g()];
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved);
      s(list);
      saveState();
      renderAll();
    }
    renderSettings();
  };
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', end);
});

// ---------- 화면 모드 ----------
document.getElementById('sTheme').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  state.settings.theme = b.dataset.v;
  saveState();
  applyTheme();
  renderSettings();
});

// ---------- 지난 기록 불러오기 (한 번만 쓰는 기능: 구글 시트에서 옮긴 기록) ----------
const importFile = document.getElementById('importFile');
importFile.addEventListener('change', () => {
  const file = importFile.files[0];
  importFile.value = '';
  if (!file) return;
  file.text().then(text => {
    const data = JSON.parse(text);
    if (data.app !== 'AIN Cost' || !Array.isArray(data.records)) throw new Error('format');
    const have = new Set(state.records.map(r => r.id));
    const add = data.records.filter(r => r.id && !have.has(r.id));
    if (!add.length) { showActions('새로 불러올 기록이 없어요. 이미 다 들어와 있어요.', []); return; }
    const months = add.map(r => monthOf(r.date)).sort();
    const range = m => `${m.slice(0, 4)}년 ${Number(m.slice(5))}월`;
    showActions(`${range(months[0])} ~ ${range(months[months.length - 1])} 기록 ${add.length.toLocaleString('ko-KR')}건을 불러올까요? (합계 ${won(add.reduce((s, r) => s + r.amount, 0))})`, [
      { label: '불러오기', fn: () => {
        state.records.push(...add);
        saveState();
        renderSettings();
        renderAll();
        showActions(`${add.length.toLocaleString('ko-KR')}건을 불러왔어요.`, []);
      } }
    ]);
  }).catch(() => showActions('이 파일은 불러올 수 없어요. Claude가 만들어 준 지난 기록 파일인지 확인해 주세요.', []));
});

document.getElementById('logoutBtn').addEventListener('click', () => confirmSignOut());
// ---------- 테마 색 ----------
document.getElementById('sAccent').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  state.settings.accent = b.dataset.v;
  saveState();
  applyTheme();
  renderSettings();
});

document.getElementById('settingsClose').addEventListener('click', () => hideOverlay(settingsOverlay));
settingsOverlay.addEventListener('click', e => { if (e.target === settingsOverlay) hideOverlay(settingsOverlay); });
