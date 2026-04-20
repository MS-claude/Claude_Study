// utils/sheets.js - Apps Script web app wrapper

const APPS_SCRIPT_KEY = 'appsScriptUrl';

async function getAppsScriptUrl() {
  return new Promise(resolve =>
    chrome.storage.local.get(APPS_SCRIPT_KEY, r => resolve(r[APPS_SCRIPT_KEY] || null))
  );
}

async function saveAppsScriptUrl(url) {
  return new Promise(resolve =>
    chrome.storage.local.set({ [APPS_SCRIPT_KEY]: url }, resolve)
  );
}

async function sheetsGet(action, params = {}) {
  const url = await getAppsScriptUrl();
  if (!url) throw new Error('⚙️ 설정에서 Apps Script URL을 입력하세요.');

  const qs = new URLSearchParams({ action, ...params }).toString();
  const res = await fetch(`${url}?${qs}`, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Sheets 연결 오류 (${res.status})`);

  const data = await res.json();
  if (data.error) throw new Error('Sheets: ' + data.error);
  return data;
}

async function sheetsPost(action, payload = {}) {
  const url = await getAppsScriptUrl();
  if (!url) throw new Error('⚙️ 설정에서 Apps Script URL을 입력하세요.');

  const res = await fetch(url, {
    method: 'POST',
    redirect: 'follow',
    body: JSON.stringify({ action, ...payload })
  });
  if (!res.ok) throw new Error(`Sheets 연결 오류 (${res.status})`);

  const data = await res.json();
  if (data.error) throw new Error('Sheets: ' + data.error);
  return data;
}

/**
 * 소싱포지션 탭에서 포지션 목록 조회
 * @returns {Promise<Array<{searchCode, positionName, jd, preference}>>}
 */
async function fetchPositions() {
  const { positions } = await sheetsGet('getPositions');
  return positions || [];
}

/**
 * 분석현황 탭에서 특정 포지션의 후보자 목록 조회
 * @param {string} searchCode
 * @returns {Promise<Array<{rowIndex, name, date, career, analysis, result}>>}
 */
async function fetchCandidates(searchCode) {
  const { candidates } = await sheetsGet('getCandidates', { searchCode });
  return candidates || [];
}

/**
 * 분석현황 탭에 새 후보자 기록 추가
 * @param {Object} data - { searchCode, name, date, career, analysis, result }
 * @returns {Promise<{rowIndex: number}>}
 */
async function addCandidateRecord(data) {
  return sheetsPost('addCandidate', { data });
}

/**
 * 분析현황 탭의 검토결과 컬럼 업데이트
 * @param {number} rowIndex
 * @param {string} result - "합격 - 사유: ..." | "불합격 - 사유: ..."
 */
async function updateCandidateResult(rowIndex, result) {
  return sheetsPost('updateResult', { rowIndex, result });
}

if (typeof module !== 'undefined') {
  module.exports = { getAppsScriptUrl, saveAppsScriptUrl, fetchPositions, fetchCandidates, addCandidateRecord, updateCandidateResult };
}
