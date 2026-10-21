// AIN Cost 클라우드 v2: 구글 로그인 + 실시간 동기화 (Firebase Auth + Firestore) — AIN Todo와 같은 방식
//  - 클라우드 위치: users/{uid} 문서(유형, 결제수단, 매달 나가는 돈, 설정) + users/{uid}/records/{기록 id} 문서 하나씩
//  - 기록을 하나씩 따로 저장해서, 폰과 PC에서 서로 다른 기록을 고쳐도 덮어쓰지 않음
//  - 다른 기기에서 바꾸면 onSnapshot으로 바로 받아서 화면을 다시 그림
//  - 인터넷이 끊겨도 Firestore가 기기에 저장해 뒀다가 연결되면 올림
//  - 누가 쓸 수 있는지는 Firebase 관리 화면의 Firestore "규칙"에서 정함 (firestore.rules 참고)

// Firebase 관리 화면 → 프로젝트 설정 → 내 앱(웹)에서 복사해 넣는 값
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyD6VXp4-IpxHOAoowUZ35lxhj5xG7WS-cw',
  authDomain: 'ain-cost.firebaseapp.com',
  projectId: 'ain-cost',
  storageBucket: 'ain-cost.firebasestorage.app',
  messagingSenderId: '487335484273',
  appId: '1:487335484273:web:5ac594d33471395b46b4d0'
};

const UID_KEY = 'ainCost.uid';          // 이 기기에 마지막으로 로그인한 사람
const LOCAL_ONLY_SETTINGS = ['theme'];  // 기기마다 따로 두는 설정 (AIN Todo와 같게)

const loginEl = document.getElementById('login');
const loginError = document.getElementById('loginError');

const cloud = {
  auth: null,
  db: null,
  user: null,
  ready: false,            // 첫 내려받기가 끝났는지 (끝나기 전에는 올리지 않음)
  gotUser: false,
  gotRecords: false,
  unsubs: [],
  shadowRecords: new Map(), // 클라우드에 있는 기록 (id → 글자) — 바뀐 것만 올리려고
  shadowUser: ''
};

// 키 순서와 상관없이 같은 내용인지 비교하려고 키를 정렬해서 글자로 만듦
function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

function userPayload() {
  const settings = { ...state.settings };
  LOCAL_ONLY_SETTINGS.forEach(k => delete settings[k]);
  return { categories: state.categories, methods: state.methods, recurring: state.recurring, settings };
}

// ---------- 로그인 화면 ----------
function showLogin(msg) {
  loginError.textContent = msg || '';
  loginError.hidden = !msg;
  loginEl.hidden = false;
}
function hideLogin() {
  loginEl.hidden = true;
}
function showLoginError(err) {
  console.warn(err);
  showLogin('로그인하지 못했어요. 잠시 뒤 다시 해 주세요.' + (err && err.code ? ` (${err.code})` : ''));
}

// ---------- 시작 ----------
function initCloud() {
  if (!window.firebase) {
    // 인터넷이 없어 Firebase를 못 불러온 경우: 전에 로그인했으면 기기에 저장된 내용으로 계속
    if (!localStorage.getItem(UID_KEY)) showLogin('인터넷 연결을 확인해 주세요.');
    return;
  }
  if (!FIREBASE_CONFIG.apiKey) {
    showLogin('Firebase 설정이 아직 없어요.');
    return;
  }
  firebase.initializeApp(FIREBASE_CONFIG);
  cloud.auth = firebase.auth();
  cloud.db = firebase.firestore();
  cloud.db.settings({ ignoreUndefinedProperties: true });
  cloud.db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

  cloud.auth.getRedirectResult().catch(showLoginError);
  cloud.auth.onAuthStateChanged(user => {
    if (user) startSync(user);
    else {
      stopSync();
      showLogin();
    }
  });
  // 전에 로그인한 적이 없으면 확인을 기다리지 않고 바로 로그인 화면
  if (!localStorage.getItem(UID_KEY)) showLogin();
}

function signIn() {
  if (!cloud.auth) return;
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  cloud.auth.signInWithPopup(provider).catch(err => {
    // 팝업이 막힌 환경(홈 화면 앱 등)이면 페이지 이동 방식으로 다시
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment') {
      return cloud.auth.signInWithRedirect(provider).catch(showLoginError);
    }
    if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') showLoginError(err);
  });
}

// ---------- 동기화 ----------
function userRef() {
  return cloud.db.collection('users').doc(cloud.user.uid);
}

function startSync(user) {
  stopSync();
  cloud.user = user;

  // 이 기기에 다른 사람이 쓰던 내용이 있으면 비움
  if (localStorage.getItem(UID_KEY) !== user.uid) {
    resetLocalState();
    try { localStorage.setItem(UID_KEY, user.uid); } catch (e) {}
  }

  const ref = userRef();
  // 허용된 계정인지 확인하면서, 처음 쓰는 사람이면 기본 유형·결제수단을 만들어 둠
  ref.get().then(snap => {
    if (!snap.exists) {
      return ref.set({ ...userPayload(), createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    }
  }).then(subscribe, err => {
    if (err.code === 'permission-denied') return denyAccount();
    subscribe(); // 인터넷이 없을 때 등: 기기에 저장된 내용으로 계속
  });
}

function subscribe() {
  if (!cloud.user) return;
  hideLogin();
  const ref = userRef();
  cloud.unsubs.push(ref.onSnapshot(onUserSnap, onCloudError));
  cloud.unsubs.push(ref.collection('records').onSnapshot(onRecordsSnap, onCloudError));
}

function onUserSnap(snap) {
  if (snap.exists) {
    const d = snap.data();
    state.categories = d.categories && d.categories.length ? d.categories : DEFAULT_CATEGORIES;
    state.methods = d.methods && d.methods.length ? d.methods : DEFAULT_METHODS;
    state.recurring = d.recurring || [];
    const local = {};
    LOCAL_ONLY_SETTINGS.forEach(k => { local[k] = state.settings[k]; });
    state.settings = { ...state.settings, ...(d.settings || {}), ...local };
    cloud.shadowUser = stableStringify(userPayload());
    applyTheme(); // 다른 기기에서 테마 색을 바꿨으면 바로 반영
  }
  cloud.gotUser = true;
  afterSnapshot();
}

function onRecordsSnap(snap) {
  const records = [];
  cloud.shadowRecords = new Map();
  snap.forEach(doc => {
    const r = { ...doc.data(), id: doc.id };
    records.push(r);
    cloud.shadowRecords.set(r.id, stableStringify(r));
  });
  state.records = records;
  cloud.gotRecords = true;
  afterSnapshot();
}

function afterSnapshot() {
  const first = !cloud.ready && cloud.gotUser && cloud.gotRecords;
  if (cloud.gotUser && cloud.gotRecords) cloud.ready = true;
  saveLocal();
  // 처음 받은 뒤 그달 매달 나가는 돈을 채움 (기록 id가 달마다 정해져 있어서 두 기기가 동시에 채워도 겹치지 않음)
  if (first && fillRecurring()) saveState();
  refreshViews();
}

// 다른 기기에서 바뀐 내용을 화면에 반영 (입력 중인 곳은 건드리지 않음)
function refreshViews() {
  renderAll();
  if (!statsOverlay.hidden) renderStats();
  const typing = document.activeElement && settingsOverlay.contains(document.activeElement) && document.activeElement.matches('input, select');
  if (!settingsOverlay.hidden && !typing) renderSettings();
}

// saveState()가 부름: 바뀐 기록만 골라서 올림
function cloudSave() {
  if (!cloud.user || !cloud.ready) return;
  const ref = userRef();
  const ops = [];
  const now = new Map(state.records.map(r => [r.id, r]));

  now.forEach((r, id) => {
    const json = stableStringify(r);
    if (cloud.shadowRecords.get(id) === json) return;
    const { id: _, ...data } = r;
    ops.push(b => b.set(ref.collection('records').doc(id), data));
    cloud.shadowRecords.set(id, json);
  });
  cloud.shadowRecords.forEach((_, id) => {
    if (now.has(id)) return;
    ops.push(b => b.delete(ref.collection('records').doc(id)));
    cloud.shadowRecords.delete(id);
  });
  const u = stableStringify(userPayload());
  if (u !== cloud.shadowUser) {
    ops.push(b => b.set(ref, userPayload(), { merge: true }));
    cloud.shadowUser = u;
  }

  // 한 번에 보낼 수 있는 개수(500)를 넘지 않게 나눠서
  for (let i = 0; i < ops.length; i += 400) {
    const batch = cloud.db.batch();
    ops.slice(i, i + 400).forEach(f => f(batch));
    batch.commit().catch(onCloudError);
  }
}

function onCloudError(err) {
  console.warn(err);
  if (err && err.code === 'permission-denied') denyAccount();
}

function stopSync() {
  cloud.unsubs.forEach(u => u());
  cloud.unsubs = [];
  cloud.user = null;
  cloud.ready = cloud.gotUser = cloud.gotRecords = false;
  cloud.shadowRecords = new Map();
  cloud.shadowUser = '';
}

// 허용 목록에 없는 계정
function denyAccount() {
  stopSync();
  try { localStorage.removeItem(UID_KEY); } catch (e) {}
  resetLocalState();
  cloud.auth.signOut();
  showLogin('이 계정은 사용할 수 없어요. 가족 계정으로 로그인해 주세요.');
}

// 기기에 저장된 기록·유형을 비움 (화면 모드는 남김)
function resetLocalState() {
  state.records = [];
  state.recurring = [];
  state.categories = DEFAULT_CATEGORIES;
  state.methods = DEFAULT_METHODS;
  state.settings = { theme: state.settings.theme };
  saveLocal();
  renderAll();
}

function confirmSignOut() {
  showActions('로그아웃하면 이 기기에서 기록이 보이지 않아요. 다시 로그인하면 그대로 돌아와요.', [
    { label: '로그아웃', danger: true, fn: () => {
      stopSync();
      try { localStorage.removeItem(UID_KEY); } catch (e) {}
      resetLocalState();
      hideOverlay(settingsOverlay);
      cloud.auth.signOut();
    } }
  ]);
}

document.getElementById('loginBtn').addEventListener('click', signIn);
