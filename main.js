// AIN Cost 시작 v8: 달 이동, 전체 그리기, 매달 나가는 돈 채우기, 통계·설정 열기, 시작 화면, 로그인

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

// 시작 화면: 첫 화면을 다 그린 뒤에 움직이기 시작 → 약 1.8초 움직이고 잠깐 두었다가 사라짐 (세 앱 공통)
// 클라우드 연결(기록 수천 건 받기)은 움직임이 거의 끝난 뒤에 시작해서 끊기지 않게
let splashStarted = false;
function startSplash() {
  if (splashStarted) return;
  splashStarted = true;
  const splash = document.getElementById('splash');
  splash.classList.add('go');
  setTimeout(initCloud, 1700);
  setTimeout(() => {
    splash.classList.add('hide');
    setTimeout(() => splash.remove(), 400);
    lockStart(); // 잠금이 켜져 있으면 Face ID·지문 확인 창을 저절로 띄움
  }, 2000);
}

loadState(); // 기기에 저장된 내용으로 먼저 보여 주고, 클라우드에서 최신 내용을 받으면 다시 그림
applyTheme();
renderAll();
requestAnimationFrame(() => requestAnimationFrame(startSplash)); // 첫 화면이 그려진 다음 장면부터
setTimeout(startSplash, 1000); // 화면 그리기 신호가 오지 않는 경우(백그라운드에서 열림 등) 대비
