// AIN Cost 시작 v5: 달 이동, 전체 그리기, 매달 나가는 돈 채우기, 통계·설정 열기, 시작 화면, 로그인

const monthTitle = document.getElementById('monthTitle');
const todayBtn = document.getElementById('todayBtn');

function renderHeader() {
  const [y, m] = ui.month.split('-').map(Number);
  monthTitle.textContent = `${y}년 ${m}월`;
  todayBtn.hidden = ui.month === monthOf(ui.today);
}

function renderAll() {
  renderHeader();
  renderSummary();
  renderRecords();
}

function moveMonth(n) {
  ui.month = addMonths(ui.month, n);
  renderAll();
  window.scrollTo(0, 0);
}

document.getElementById('prevBtn').addEventListener('click', () => moveMonth(-1));
document.getElementById('nextBtn').addEventListener('click', () => moveMonth(1));
todayBtn.addEventListener('click', () => { ui.month = monthOf(ui.today); renderAll(); });
document.getElementById('addBtn').addEventListener('click', () => openSheet());
document.getElementById('statsBtn').addEventListener('click', openStats);
document.getElementById('settingsBtn').addEventListener('click', openSettings);

// 앱을 켜 둔 채 날짜가 바뀌면 '오늘'을 새로 계산
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const now = todayStr();
  if (now === ui.today) return;
  if (ui.month === monthOf(ui.today)) ui.month = monthOf(now);
  ui.today = now;
  if (cloud.ready && fillRecurring()) saveState(); // 달이 바뀌었으면 그달 것을 넣음
  renderAll();
});

// 시작 화면: 애니메이션(약 1.5초)이 끝나면 잠깐 두었다가 사라짐 (페이지를 연 때부터 1.8초)
setTimeout(() => {
  const splash = document.getElementById('splash');
  splash.classList.add('hide');
  setTimeout(() => splash.remove(), 400);
}, Math.max(1800 - performance.now(), 200));

loadState(); // 기기에 저장된 내용으로 먼저 보여 주고, 클라우드에서 최신 내용을 받으면 다시 그림
applyTheme();
renderAll();
initCloud();
