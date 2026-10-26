// AIN Cost 잠금 v2: Face ID·지문으로 앱 열기 (네 앱 공통 방식)
//  - 아이폰의 "패스키"(WebAuthn) 기능을 빌려서, 얼굴·지문 확인이 통과했는지만 봄
//  - 여러 번 실패하면 아이폰이 알아서 아이폰 암호를 물어봄 (앱 비밀번호는 따로 없음)
//  - 켜기/끄기는 이 기기에만 저장 (지문은 기기마다 다르니까). 클라우드에는 올리지 않음
//  - 진짜 금고는 구글 로그인 + Firestore 규칙. 이 잠금은 폰이 열린 채로 남이 앱을 켜는 걸 막는 가림막

const LOCK_KEY = 'ainCost.lock';  // 이 기기에서 등록한 열쇠 번호 (없으면 잠금 꺼짐)
const LOCK_AFTER = 60 * 1000;     // 내려 둔 지 1분이 지나면 다시 물어봄
const LOCK_NAME = 'AIN Cost 잠금'; // 아이폰 패스키 창과 "암호" 목록에 보이는 이름

const lockEl = document.getElementById('appLock');
const lockError = document.getElementById('lockError');
const sLockSeg = document.getElementById('sLockSeg');
const lockHint = document.getElementById('lockHint');
const lockUi = { busy: false, hiddenAt: 0, canUse: false };

function lockId() {
  try { return localStorage.getItem(LOCK_KEY) || ''; } catch (e) { return ''; }
}
function toB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}
function randomBytes(n) { return crypto.getRandomValues(new Uint8Array(n)); }

// 잠금 화면 보이기·숨기기
function showLock() {
  document.activeElement && document.activeElement.blur();
  lockError.hidden = true;
  lockEl.hidden = false;
}
function hideLock() { lockEl.hidden = true; }

// 얼굴·지문 확인. 저절로(auto) 부를 때 아이폰이 막으면 조용히 "잠금 풀기" 버튼을 기다림
async function unlock(auto) {
  if (lockUi.busy || lockEl.hidden) return;
  lockUi.busy = true;
  lockError.hidden = true;
  try {
    const cred = await navigator.credentials.get({ publicKey: {
      challenge: randomBytes(32),
      rpId: location.hostname,
      allowCredentials: [{ type: 'public-key', id: fromB64(lockId()) }],
      userVerification: 'required',
      timeout: 60000
    } });
    // 얼굴·지문(또는 아이폰 암호)으로 확인했다는 표시(UV)가 있어야 통과
    const flags = new Uint8Array(cred.response.authenticatorData)[32];
    if (!(flags & 4)) throw new Error('not verified');
    hideLock();
  } catch (err) {
    console.warn(err);
    if (!auto) lockError.hidden = false;
  }
  lockUi.busy = false;
}

// 설정에서 켜기: 이 기기에 열쇠를 하나 만듦 (이때 아이폰이 얼굴·지문을 한 번 확인)
async function turnLockOn() {
  if (lockUi.busy) return;
  lockUi.busy = true;
  try {
    const cred = await navigator.credentials.create({ publicKey: {
      challenge: randomBytes(32),
      rp: { name: LOCK_NAME, id: location.hostname },
      user: { id: randomBytes(16), name: LOCK_NAME, displayName: LOCK_NAME },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      timeout: 60000
    } });
    localStorage.setItem(LOCK_KEY, toB64(cred.rawId));
  } catch (err) {
    console.warn(err);
    lockNote('켜지 못했어요. 다시 눌러 주세요.');
  }
  lockUi.busy = false;
  renderLockSetting();
}
function turnLockOff() {
  try { localStorage.removeItem(LOCK_KEY); } catch (e) {}
  renderLockSetting();
}

const LOCK_HINT = '켜면 앱을 열 때, 그리고 1분 넘게 내려 두었다 돌아올 때 Face ID·지문을 물어봐요. 이 기기에만 적용돼요. 켤 때 아이폰이 패스키 저장을 물으면 지문이나 얼굴로 확인해 주세요.';
function lockNote(msg) {
  lockHint.textContent = msg;
  lockHint.classList.add('f-error');
  setTimeout(() => { lockHint.textContent = LOCK_HINT; lockHint.classList.remove('f-error'); }, 4000);
}
function renderLockSetting() {
  sLockSeg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === (lockId() ? 'on' : 'off')));
  sLockSeg.querySelector('[data-v="on"]').disabled = !lockUi.canUse && !lockId();
  if (!lockUi.canUse && !lockId()) lockHint.textContent = '이 기기에서는 Face ID·지문을 쓸 수 없어요.';
}

sLockSeg.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  if (b.dataset.v === 'on' && !lockId()) turnLockOn();
  if (b.dataset.v === 'off' && lockId()) turnLockOff();
});
document.getElementById('unlockBtn').addEventListener('click', () => unlock(false));

// 못 풀 때: 로그아웃하고 잠금도 끔 → 구글 로그인을 다시 하면 기록이 그대로 돌아옴
document.getElementById('lockRelogin').addEventListener('click', () => {
  turnLockOff();
  hideLock();
  if (typeof cloud !== 'undefined' && cloud.auth) {
    stopSync();
    try { localStorage.removeItem(UID_KEY); } catch (e) {}
    resetLocalState();
    cloud.auth.signOut();
    showLogin();
  }
});

// 내려 두었다가 돌아오면: 1분이 지났으면 다시 잠금
document.addEventListener('visibilitychange', () => {
  if (!lockId()) return;
  if (document.visibilityState === 'hidden') {
    if (lockEl.hidden && !lockUi.busy) lockUi.hiddenAt = Date.now();
    return;
  }
  if (lockEl.hidden && lockUi.hiddenAt && Date.now() - lockUi.hiddenAt > LOCK_AFTER) {
    showLock();
    unlock(true);
  }
  lockUi.hiddenAt = 0;
});

// 이 기기가 얼굴·지문을 쓸 수 있는지 (안 되면 설정의 "켜기"를 막음)
if (window.PublicKeyCredential && PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) {
  PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
    .then(ok => { lockUi.canUse = ok; renderLockSetting(); })
    .catch(() => renderLockSetting());
} else renderLockSetting();

// 앱을 켤 때: 잠금이 켜져 있으면 처음부터 가려 둠 (시작 화면이 끝나면 main.js가 lockStart를 부름)
if (lockId()) showLock();
function lockStart() {
  if (!lockEl.hidden) unlock(true);
}
