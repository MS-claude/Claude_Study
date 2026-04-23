// utils/sheets.js - Google Sheets API v4 via OAuth2

const SHEETS_BASE    = 'https://sheets.googleapis.com/v4/spreadsheets';
const SOURCING_SHEET = '소싱포지션';
const ANALYSIS_SHEET = '분석현황';

// 0-based column index → A1 letter(s)
function colLetter(i) {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    s = String.fromCharCode(65 + (n - 1) % 26) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// Row array → { 'header': 0-based col index }
function makeHeaderMap(row) {
  const map = {};
  (row || []).forEach((h, i) => { if (h) map[String(h).trim()] = i; });
  return map;
}

function encRange(sheet, range) {
  return encodeURIComponent(`'${sheet}'!${range}`);
}

async function apiGet(path) {
  const token = await getAccessToken();
  const res = await fetch(`${SHEETS_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Sheets API 오류 (${res.status})`);
  }
  return res.json();
}

async function apiPost(path, body) {
  const token = await getAccessToken();
  const res = await fetch(`${SHEETS_BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Sheets API 오류 (${res.status})`);
  }
  return res.json();
}

async function apiPut(path, body) {
  const token = await getAccessToken();
  const res = await fetch(`${SHEETS_BASE}${path}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Sheets API 오류 (${res.status})`);
  }
  return res.json();
}

/**
 * 소싱포지션 탭에서 포지션 목록 조회
 * @returns {Promise<Array<{searchCode, positionName, jd, preference}>>}
 */
async function fetchPositions() {
  const id = await getSpreadsheetId();
  if (!id) throw new Error('⚙️ 설정에서 Spreadsheet ID를 입력하세요.');

  const data = await apiGet(`/${id}/values/${encRange(SOURCING_SHEET, 'A5:Z500')}`);
  const rows = data.values || [];
  if (rows.length === 0) return [];

  const hdr = makeHeaderMap(rows[0]);
  const SEARCH_CODE_IDX = 2; // C열 고정 (0-based)

  return rows.slice(1)
    .filter(r => r[SEARCH_CODE_IDX])
    .map(r => ({
      searchCode:   String(r[SEARCH_CODE_IDX] || ''),
      positionName: hdr['포지션명']  != null ? String(r[hdr['포지션명']]  || '') : '',
      jd:           hdr['JD']        != null ? String(r[hdr['JD']]        || '') : '',
      preference:   hdr['선호 조건'] != null ? String(r[hdr['선호 조건']] || '') : ''
    }));
}

/**
 * 분석현황 탭에서 특정 포지션의 후보자 목록 조회
 * @param {string} searchCode
 * @returns {Promise<Array<{rowIndex, name, date, career, analysis, result}>>}
 */
async function fetchCandidates(searchCode) {
  if (!searchCode) return [];
  const id = await getSpreadsheetId();
  if (!id) throw new Error('⚙️ 설정에서 Spreadsheet ID를 입력하세요.');

  const data = await apiGet(`/${id}/values/${encRange(ANALYSIS_SHEET, 'A1:Z1000')}`);
  const rows = data.values || [];
  if (rows.length < 2) return [];

  const hdr = makeHeaderMap(rows[0]);
  const sc  = String(searchCode);

  return rows.slice(1)
    .map((r, i) => ({ r, rowIndex: i + 2 }))
    .filter(({ r }) => String(r[hdr['서칭코드']] || '') === sc)
    .map(({ r, rowIndex }) => ({
      rowIndex,
      name:     String(r[hdr['이름']]     || ''),
      date:     String(r[hdr['서칭일']]   || ''),
      career:   String(r[hdr['주요경력']] || ''),
      analysis: String(r[hdr['분석내용']] || ''),
      result:   String(r[hdr['검토결과']] || '')
    }));
}

/**
 * 분석현황 탭에 새 후보자 기록 추가
 * @param {Object} data - { searchCode, name, date, career, analysis, result }
 * @returns {Promise<{rowIndex: number}>}
 */
async function addCandidateRecord(data) {
  const id = await getSpreadsheetId();
  if (!id) throw new Error('⚙️ 설정에서 Spreadsheet ID를 입력하세요.');

  let parsed = {};
  try { parsed = JSON.parse(data.analysis || '{}'); } catch {}

  const fmtPeriod = s => (s || '').split('.').map(t => t.trim()).filter(Boolean).join('\n');
  const fmtArray  = a => Array.isArray(a) ? a.join('\n') : String(a || '');
  const fmtCareer = career => {
    const entries = (career || '').split(',').map(t => t.trim()).filter(Boolean);
    if (entries.length === 0) return '';
    let totalMonths = 0;
    for (const e of entries) {
      const y = e.match(/(\d+)\s*년/);
      const m = e.match(/(\d+)\s*개월/);
      totalMonths += (y ? parseInt(y[1]) : 0) * 12 + (m ? parseInt(m[1]) : 0);
    }
    const yr = Math.floor(totalMonths / 12);
    const mo = totalMonths % 12;
    const total = yr > 0 && mo > 0 ? `${yr}년 ${mo}개월`
                : yr > 0           ? `${yr}년`
                : mo > 0           ? `${mo}개월` : '';
    return (total ? `총 경력 : ${total}\n` : '') + entries.join('\n');
  };

  // A~I열 고정 구조
  const row = [
    data.searchCode || '',       // A: 서칭코드
    data.name       || '',       // B: 이름
    data.date       || '',       // C: 서칭일
    fmtCareer(data.career),      // D: 주요경력
    fmtPeriod(parsed.summary),   // E: 종합평가
    fmtArray(parsed.strengths),  // F: 강점
    fmtArray(parsed.weaknesses), // G: 약점
    data.result     || '',       // H: 검토결과
    data.analysis   || '',       // I: 분석내용
  ];

  const res = await apiPost(
    `/${id}/values/${encRange(ANALYSIS_SHEET, 'A:I')}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { values: [row] }
  );

  // Parse row number from updatedRange like "'분석현황'!A10:J10"
  const updatedRange = res.updates?.updatedRange || '';
  const match = updatedRange.match(/:([A-Z]+)(\d+)$/);
  const rowIndex = match ? parseInt(match[2]) : null;

  return { rowIndex };
}

/**
 * 분석현황 탭의 검토결과 컬럼 업데이트
 * @param {number} rowIndex
 * @param {string} result - "합격 - 사유: ..." | "불합격 - 사유: ..."
 */
async function updateCandidateResult(rowIndex, result) {
  const id = await getSpreadsheetId();
  if (!id) throw new Error('⚙️ 설정에서 Spreadsheet ID를 입력하세요.');

  const hdrData = await apiGet(`/${id}/values/${encRange(ANALYSIS_SHEET, 'A1:Z1')}`);
  const hdrRow  = (hdrData.values || [[]])[0] || [];
  const hdr     = makeHeaderMap(hdrRow);

  const col = hdr['검토결과'];
  if (col == null) throw new Error("'검토결과' 컬럼을 찾을 수 없습니다.");

  const cellRange = encRange(ANALYSIS_SHEET, `${colLetter(col)}${rowIndex}`);
  await apiPut(
    `/${id}/values/${cellRange}?valueInputOption=USER_ENTERED`,
    { values: [[result]] }
  );
}

if (typeof module !== 'undefined') {
  module.exports = { fetchPositions, fetchCandidates, addCandidateRecord, updateCandidateResult };
}
