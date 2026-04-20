// utils/auth.js - Google OAuth2 via chrome.identity.getAuthToken
// Client ID는 manifest.json "oauth2" → "client_id" 에 입력 후 확장 프로그램을 재로드하세요.

/**
 * 유효한 액세스 토큰을 반환합니다.
 * Chrome이 토큰 캐싱 및 갱신을 자동으로 처리합니다.
 */
async function getAccessToken() {
  return new Promise((resolve, reject) =>
    chrome.identity.getAuthToken({ interactive: true }, token => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!token) return reject(new Error('인증 토큰을 가져올 수 없습니다.'));
      resolve(token);
    })
  );
}

/**
 * 사용자 동의 없이 캐시된 토큰이 있으면 true를 반환합니다.
 */
async function isConnected() {
  return new Promise(resolve =>
    chrome.identity.getAuthToken({ interactive: false }, token => {
      resolve(!chrome.runtime.lastError && !!token);
    })
  );
}

/**
 * 동의 화면을 표시하고 토큰을 발급받습니다.
 */
async function connectGoogleAccount() {
  return new Promise((resolve, reject) =>
    chrome.identity.getAuthToken({ interactive: true }, token => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!token) return reject(new Error('인증에 실패했습니다.'));
      resolve(token);
    })
  );
}

/**
 * 캐시된 토큰을 제거하고 Google에서 권한을 취소합니다.
 */
async function disconnectGoogleAccount() {
  return new Promise(resolve =>
    chrome.identity.getAuthToken({ interactive: false }, token => {
      if (chrome.runtime.lastError || !token) return resolve();
      chrome.identity.removeCachedAuthToken({ token }, () => {
        fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`).catch(() => {});
        resolve();
      });
    })
  );
}

if (typeof module !== 'undefined') {
  module.exports = { getAccessToken, isConnected, connectGoogleAccount, disconnectGoogleAccount };
}
