// utils/auth.js - Google OAuth2 via chrome.identity.launchWebAuthFlow

const OAUTH_AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth';
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE           = 'https://www.googleapis.com/auth/spreadsheets';
const TOKENS_KEY      = 'googleTokens';

// ─── Redirect URI ─────────────────────────────────────────────────────────────
// Google Cloud Console > 사용자 인증 정보 > 리디렉션 URI에 이 값을 등록해야 합니다.
function getRedirectUri() {
  return `https://${chrome.runtime.id}.chromiumapp.org/`;
}

// ─── Token storage ────────────────────────────────────────────────────────────
async function getTokens() {
  return new Promise(r =>
    chrome.storage.local.get(TOKENS_KEY, d => r(d[TOKENS_KEY] || null))
  );
}

async function saveTokens(t) {
  return new Promise(r => chrome.storage.local.set({ [TOKENS_KEY]: t }, r));
}

async function clearTokens() {
  return new Promise(r => chrome.storage.local.remove(TOKENS_KEY, r));
}

// ─── Credential helpers ───────────────────────────────────────────────────────
async function getCredentials() {
  return new Promise(r =>
    chrome.storage.local.get(['clientId', 'clientSecret'], d => r({
      clientId:     d.clientId     || null,
      clientSecret: d.clientSecret || null
    }))
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Launch OAuth2 consent screen and save tokens.
 * Throws if Client ID / Secret are missing.
 */
async function connectGoogleAccount() {
  const { clientId } = await getCredentials();
  if (!clientId) throw new Error('Client ID를 먼저 입력하고 저장하세요.');

  const redirectUri = getRedirectUri();
  const authUrl = OAUTH_AUTH_URL + '?' + new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         SCOPE,
    access_type:   'offline',
    prompt:        'consent'
  });

  const redirectUrl = await new Promise((resolve, reject) =>
    chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, url => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!url) return reject(new Error('인증이 취소되었습니다.'));
      resolve(url);
    })
  );

  const code = new URL(redirectUrl).searchParams.get('code');
  if (!code) throw new Error('인증 코드를 받지 못했습니다.');

  await _exchangeCode(code, redirectUri);
}

/**
 * Returns a valid access token, refreshing automatically if expired.
 */
async function getAccessToken() {
  const tokens = await getTokens();
  if (!tokens?.refresh_token) {
    throw new Error('Google 계정이 연결되지 않았습니다. ⚙️ 설정에서 연결해주세요.');
  }

  // 5분 버퍼를 두고 갱신
  if (tokens.expires_at && Date.now() < tokens.expires_at - 300_000) {
    return tokens.access_token;
  }

  return _refreshToken(tokens);
}

/**
 * Returns true if a refresh token exists.
 */
async function isConnected() {
  const t = await getTokens();
  return !!(t?.refresh_token);
}

/**
 * Remove stored tokens (disconnect).
 */
async function disconnectGoogleAccount() {
  return clearTokens();
}

// ─── Internal ─────────────────────────────────────────────────────────────────
async function _exchangeCode(code, redirectUri) {
  const { clientId, clientSecret } = await getCredentials();
  if (!clientSecret) throw new Error('Client Secret을 먼저 입력하고 저장하세요.');

  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: clientId, client_secret: clientSecret,
      redirect_uri: redirectUri, grant_type: 'authorization_code'
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(`토큰 발급 실패: ${data.error_description || data.error}`);

  await saveTokens({
    access_token:  data.access_token,
    refresh_token: data.refresh_token,
    expires_at:    Date.now() + data.expires_in * 1000
  });
}

async function _refreshToken(tokens) {
  const { clientId, clientSecret } = await getCredentials();

  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: tokens.refresh_token,
      client_id: clientId, client_secret: clientSecret,
      grant_type: 'refresh_token'
    })
  });
  const data = await res.json();
  if (data.error) {
    await clearTokens(); // 갱신 실패 시 재인증 유도
    throw new Error(`토큰 갱신 실패: ${data.error_description || data.error}\n다시 연결해주세요.`);
  }

  const updated = { ...tokens, access_token: data.access_token, expires_at: Date.now() + data.expires_in * 1000 };
  await saveTokens(updated);
  return updated.access_token;
}

if (typeof module !== 'undefined') {
  module.exports = { getRedirectUri, connectGoogleAccount, getAccessToken, isConnected, disconnectGoogleAccount };
}
