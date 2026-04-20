/**
 * Resume Analyzer - Google Apps Script
 *
 * 설치 방법:
 * 1. Google 스프레드시트 열기
 * 2. 확장 프로그램 > Apps Script
 * 3. 아래 코드 전체를 붙여넣기
 * 4. 저장 후 배포 > 새 배포 > 웹 앱
 *    - 실행 계정: 나
 *    - 액세스 권한: 모든 사용자
 * 5. 배포 URL을 확장 프로그램 설정에 입력
 */

const SOURCING_SHEET  = '소싱포지션';
const ANALYSIS_SHEET  = '분석현황';
const POSITION_HDR_ROW = 5;   // 소싱포지션 헤더 행
const SEARCH_CODE_COL  = 3;   // 서칭코드 = C열 (고정)

// ─── Router ──────────────────────────────────────────────────────────────────

function doGet(e) {
  try {
    const action = (e.parameter.action || '').trim();
    let result;
    if      (action === 'getPositions')  result = getPositions();
    else if (action === 'getCandidates') result = getCandidates(e.parameter.searchCode);
    else result = { error: '알 수 없는 action: ' + action };
    return json(result);
  } catch (err) {
    return json({ error: err.message });
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action  = payload.action || '';
    let result;
    if      (action === 'addCandidate') result = addCandidate(payload.data);
    else if (action === 'updateResult') result = updateResult(payload.rowIndex, payload.result);
    else result = { error: '알 수 없는 action: ' + action };
    return json(result);
  } catch (err) {
    return json({ error: err.message });
  }
}

function json(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * 지정 행의 헤더를 { 헤더명: 1-based 열번호 } 맵으로 반환
 */
function headerMap(sheet, row) {
  const vals = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = {};
  vals.forEach((v, i) => { if (v) map[String(v).trim()] = i + 1; });
  return map;
}

function getSheet(name) {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!s) throw new Error(`'${name}' 시트를 찾을 수 없습니다.`);
  return s;
}

function getRows(sheet, startRow) {
  const last = sheet.getLastRow();
  if (last < startRow) return [];
  const cols = sheet.getLastColumn();
  return sheet.getRange(startRow, 1, last - startRow + 1, cols).getValues();
}

// ─── getPositions ─────────────────────────────────────────────────────────────

function getPositions() {
  const sheet  = getSheet(SOURCING_SHEET);
  const hdr    = headerMap(sheet, POSITION_HDR_ROW);
  const rows   = getRows(sheet, POSITION_HDR_ROW + 1);

  const positions = rows
    .filter(r => r[SEARCH_CODE_COL - 1])
    .map(r => ({
      searchCode:   String(r[SEARCH_CODE_COL - 1]),
      positionName: hdr['포지션명']  ? String(r[hdr['포지션명']  - 1] || '') : '',
      jd:           hdr['JD']        ? String(r[hdr['JD']        - 1] || '') : '',
      preference:   hdr['선호 조건'] ? String(r[hdr['선호 조건'] - 1] || '') : ''
    }));

  return { positions };
}

// ─── getCandidates ───────────────────────────────────────────────────────────

function getCandidates(searchCode) {
  if (!searchCode) return { candidates: [] };
  const sheet = getSheet(ANALYSIS_SHEET);
  const hdr   = headerMap(sheet, 1);
  const rows  = getRows(sheet, 2);

  const sc = String(searchCode);
  const candidates = rows
    .map((r, i) => ({ r, row: i + 2 }))
    .filter(({ r }) => String(r[hdr['서칭코드'] - 1] || '') === sc)
    .map(({ r, row }) => ({
      rowIndex:   row,
      searchCode: String(r[hdr['서칭코드']  - 1] || ''),
      name:       String(r[hdr['이름']      - 1] || ''),
      date:       String(r[hdr['서칭일']    - 1] || ''),
      career:     String(r[hdr['주요경력']  - 1] || ''),
      analysis:   String(r[hdr['분석내용']  - 1] || ''),
      result:     String(r[hdr['검토결과']  - 1] || '')
    }));

  return { candidates };
}

// ─── addCandidate ─────────────────────────────────────────────────────────────

function addCandidate(data) {
  const sheet   = getSheet(ANALYSIS_SHEET);
  const hdr     = headerMap(sheet, 1);
  const lastCol = Math.max(...Object.values(hdr));
  const row     = new Array(lastCol).fill('');

  const set = (key, val) => { if (hdr[key]) row[hdr[key] - 1] = val || ''; };
  set('서칭코드', data.searchCode);
  set('이름',     data.name);
  set('서칭일',   data.date);
  set('주요경력', data.career);
  set('분석내용', data.analysis);
  set('검토결과', data.result || '');

  const newRow = sheet.getLastRow() + 1;
  sheet.getRange(newRow, 1, 1, lastCol).setValues([row]);
  return { success: true, rowIndex: newRow };
}

// ─── updateResult ─────────────────────────────────────────────────────────────

function updateResult(rowIndex, result) {
  const sheet = getSheet(ANALYSIS_SHEET);
  const hdr   = headerMap(sheet, 1);
  const col   = hdr['검토결과'];
  if (!col) throw new Error("'검토결과' 컬럼을 찾을 수 없습니다.");
  sheet.getRange(rowIndex, col).setValue(result);
  return { success: true };
}
