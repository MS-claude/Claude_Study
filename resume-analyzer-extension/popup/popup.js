// popup.js

const state = {
  positions:         [],   // [{ searchCode, positionName, jd, preference }]
  candidates:        [],   // [{ rowIndex, name, date, career, analysis, result }]
  selectedPosition:  null,
  selectedCandidate: null, // null = new candidate
  captures:          [],
  selectedText:      '',
  selectionModeActive: false,
  activeTab:         'capture',
  currentAnalysis:   null,
  currentRowIndex:   null  // row in 분析현황 after save
};

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  await loadSettings();
  await loadPositions();
  bindEvents();
  listenForMessages();
}

async function loadSettings() {
  const [key, model, clientId, clientSecret, spreadsheetId] = await Promise.all([
    getApiKey(), getModelName(), getClientId(), getClientSecret(), getSpreadsheetId()
  ]);
  if (key)           document.getElementById('apiKeyInput').value          = key;
  if (model)         document.getElementById('modelNameInput').value       = model;
  if (clientId)      document.getElementById('clientIdInput').value        = clientId;
  if (clientSecret)  document.getElementById('clientSecretInput').value    = clientSecret;
  if (spreadsheetId) document.getElementById('spreadsheetIdInput').value   = spreadsheetId;

  document.getElementById('redirectUriDisplay').value = getRedirectUri();
  await updateAuthStatus();
}

async function updateAuthStatus() {
  const connected     = await isConnected();
  const statusEl      = document.getElementById('authStatus');
  const connectBtn    = document.getElementById('connectGoogleBtn');
  const disconnectBtn = document.getElementById('disconnectGoogleBtn');

  if (connected) {
    statusEl.textContent = '✅ Google 계정 연결됨';
    statusEl.className   = 'auth-status auth-connected';
    connectBtn.classList.add('hidden');
    disconnectBtn.classList.remove('hidden');
  } else {
    statusEl.textContent = '❌ Google 계정 미연결';
    statusEl.className   = 'auth-status auth-disconnected';
    connectBtn.classList.remove('hidden');
    disconnectBtn.classList.add('hidden');
  }
}

async function loadPositions() {
  const select = document.getElementById('positionSelect');

  const connected = await isConnected();
  if (!connected) {
    select.innerHTML = '<option value="">-- 포지션을 선택하세요 --</option>';
    return;
  }

  select.innerHTML = '<option value="">로딩 중...</option>';
  try {
    state.positions = await fetchPositions();
    renderPositionDropdown();
  } catch (e) {
    select.innerHTML = '<option value="">-- 포지션을 선택하세요 --</option>';
    showGlobalError(e.message);
  }
}

function renderPositionDropdown() {
  const select = document.getElementById('positionSelect');
  select.innerHTML = '<option value="">-- 포지션을 선택하세요 --</option>';
  state.positions.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.searchCode;
    opt.textContent = `[${p.searchCode}] ${p.positionName}`;
    select.appendChild(opt);
  });
}

// ─── Message listener (from content script) ───────────────────────────────────
function listenForMessages() {
  chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === 'TEXT_SELECTED') {
      state.selectedText = msg.text;
      state.selectionModeActive = false;
      document.getElementById('selectionActive').classList.add('hidden');
      document.getElementById('selectionIdle').classList.remove('hidden');
      document.getElementById('selectionText').textContent = msg.text;
      document.getElementById('selectionPreview').classList.remove('hidden');
      updateAnalyzeButton();
    } else if (msg.type === 'SELECTION_CANCELLED') {
      state.selectionModeActive = false;
      document.getElementById('selectionActive').classList.add('hidden');
      document.getElementById('selectionIdle').classList.remove('hidden');
    }
  });
}

// ─── Event binding ────────────────────────────────────────────────────────────
function bindEvents() {
  // Header
  document.getElementById('settingsBtn').addEventListener('click', () => toggleSettings(true));
  document.getElementById('closeBtn').addEventListener('click', handleClose);

  // Settings
  document.getElementById('closeSettingsBtn').addEventListener('click', () => toggleSettings(false));
  document.getElementById('saveApiKeyBtn').addEventListener('click', async () => {
    const v = document.getElementById('apiKeyInput').value.trim();
    if (!v) return;
    await saveApiKey(v);
    showMessage(document.getElementById('settingsPanel'), 'API 키 저장됨', 'success');
    setTimeout(() => toggleSettings(false), 800);
  });
  document.getElementById('saveModelBtn').addEventListener('click', async () => {
    const v = document.getElementById('modelNameInput').value.trim();
    if (!v) return;
    await saveModelName(v);
    showMessage(document.getElementById('settingsPanel'), `모델: ${v}`, 'success');
  });
  document.getElementById('saveSpreadsheetIdBtn').addEventListener('click', async () => {
    const v = document.getElementById('spreadsheetIdInput').value.trim();
    if (!v) return;
    await saveSpreadsheetId(v);
    showMessage(document.getElementById('settingsPanel'), 'Spreadsheet ID 저장됨', 'success');
  });
  document.getElementById('saveClientIdBtn').addEventListener('click', async () => {
    const v = document.getElementById('clientIdInput').value.trim();
    if (!v) return;
    await saveClientId(v);
    showMessage(document.getElementById('settingsPanel'), 'Client ID 저장됨', 'success');
  });
  document.getElementById('saveClientSecretBtn').addEventListener('click', async () => {
    const v = document.getElementById('clientSecretInput').value.trim();
    if (!v) return;
    await saveClientSecret(v);
    showMessage(document.getElementById('settingsPanel'), 'Client Secret 저장됨', 'success');
  });
  document.getElementById('copyRedirectUriBtn').addEventListener('click', () => {
    const uri = document.getElementById('redirectUriDisplay').value;
    navigator.clipboard.writeText(uri).then(() => {
      showMessage(document.getElementById('settingsPanel'), 'URI 복사됨', 'success');
    }).catch(() => {
      document.getElementById('redirectUriDisplay').select();
    });
  });
  document.getElementById('connectGoogleBtn').addEventListener('click', async () => {
    const btn = document.getElementById('connectGoogleBtn');
    btn.textContent = '연결 중...';
    btn.disabled = true;
    try {
      await connectGoogleAccount();
      await updateAuthStatus();
      showMessage(document.getElementById('settingsPanel'), 'Google 계정 연결 완료!', 'success');
      setTimeout(() => loadPositions(), 500);
    } catch (e) {
      showMessage(document.getElementById('settingsPanel'), '연결 실패: ' + e.message, 'error');
    } finally {
      btn.textContent = '🔗 Google 계정 연결';
      btn.disabled = false;
    }
  });
  document.getElementById('disconnectGoogleBtn').addEventListener('click', async () => {
    await disconnectGoogleAccount();
    await updateAuthStatus();
    state.positions = [];
    renderPositionDropdown();
    showMessage(document.getElementById('settingsPanel'), 'Google 계정 연결이 해제되었습니다.', 'success');
  });

  // Position
  document.getElementById('positionSelect').addEventListener('change', handlePositionSelect);
  document.getElementById('refreshPositionsBtn').addEventListener('click', loadPositions);

  // Candidate
  document.getElementById('candidateSelect').addEventListener('change', handleCandidateSelect);

  // JD toggle
  document.getElementById('toggleJdBtn').addEventListener('click', () => {
    const content = document.getElementById('jdContent');
    const btn = document.getElementById('toggleJdBtn');
    const hidden = content.classList.toggle('hidden');
    btn.textContent = hidden ? '📋 JD 내용 보기 ▾' : '📋 JD 내용 접기 ▴';
  });

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn =>
    btn.addEventListener('click', () => switchTab(btn.dataset.tab))
  );

  // Capture
  document.getElementById('captureBtn').addEventListener('click', handleCapture);
  document.getElementById('scrollCaptureBtn').addEventListener('click', handleScrollCapture);
  document.getElementById('clearCaptureBtn').addEventListener('click', clearCaptures);

  // Selection
  document.getElementById('startSelectionBtn').addEventListener('click', handleStartSelection);
  document.getElementById('cancelSelectionBtn').addEventListener('click', handleCancelSelection);
  document.getElementById('clearSelectionBtn').addEventListener('click', clearSelection);

  // Paste
  document.getElementById('pasteTextInput').addEventListener('input', e => {
    document.getElementById('pasteCharCount').textContent = e.target.value.length + '자';
    updateAnalyzeButton();
  });
  document.getElementById('clearPasteBtn').addEventListener('click', () => {
    document.getElementById('pasteTextInput').value = '';
    document.getElementById('pasteCharCount').textContent = '0자';
    updateAnalyzeButton();
  });

  // Analyze
  document.getElementById('analyzeBtn').addEventListener('click', handleAnalyze);

  // Feedback
  document.getElementById('feedbackPassBtn').addEventListener('click', () => handleFeedback('합격'));
  document.getElementById('feedbackFailBtn').addEventListener('click', () => handleFeedback('불합격'));

  // Candidate name input
  document.getElementById('candidateNameInput').addEventListener('input', updateAnalyzeButton);
}

// ─── Settings / Close ─────────────────────────────────────────────────────────
function toggleSettings(show) {
  document.getElementById('settingsPanel').classList.toggle('hidden', !show);
  if (show) updateAuthStatus();
}

function handleClose() {
  if (state.selectionModeActive) handleCancelSelection();
  window.close();
}

// ─── Position ─────────────────────────────────────────────────────────────────
async function handlePositionSelect() {
  const code = document.getElementById('positionSelect').value;
  state.selectedPosition = state.positions.find(p => p.searchCode === code) || null;
  state.candidates = [];
  state.selectedCandidate = null;
  state.currentAnalysis = null;
  state.currentRowIndex = null;

  // Reset UI
  document.getElementById('candidateRow').classList.add('hidden');
  document.getElementById('newCandidateRow').classList.add('hidden');
  document.getElementById('positionPreview').classList.add('hidden');
  document.getElementById('resumeSection').style.display = 'none';
  document.getElementById('analyzeContainer').style.display = 'none';
  document.getElementById('resultsSection').classList.add('hidden');
  document.getElementById('jdContent').classList.add('hidden');
  document.getElementById('toggleJdBtn').textContent = '📋 JD 내용 보기 ▾';

  if (!state.selectedPosition) return;

  // Show JD preview
  const jdText = [state.selectedPosition.jd, state.selectedPosition.preference]
    .filter(Boolean).join('\n\n[선호 조건]\n');
  document.getElementById('jdContent').textContent = jdText;
  document.getElementById('positionPreview').classList.remove('hidden');

  // Load candidates
  try {
    state.candidates = await fetchCandidates(code);
  } catch (e) {
    showGlobalError('후보자 로딩 실패: ' + e.message);
  }

  renderCandidateDropdown();
  document.getElementById('candidateRow').classList.remove('hidden');
  // Trigger selection handler for default (__new__)
  handleCandidateSelect();
}

function renderCandidateDropdown() {
  const select = document.getElementById('candidateSelect');
  select.innerHTML = '<option value="__new__">+ 신규 지원자</option>';
  state.candidates.forEach((c, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    const resultMark = c.result ? (c.result.startsWith('합격') ? ' ✓' : ' ✗') : ' ⏳';
    opt.textContent = `${c.name} (${c.date})${resultMark}`;
    select.appendChild(opt);
  });
}

// ─── Candidate ────────────────────────────────────────────────────────────────
function handleCandidateSelect() {
  const val = document.getElementById('candidateSelect').value;
  document.getElementById('resultsSection').classList.add('hidden');

  if (val === '__new__') {
    state.selectedCandidate = null;
    document.getElementById('newCandidateRow').classList.remove('hidden');
    document.getElementById('resumeSection').style.display = '';
    document.getElementById('analyzeContainer').style.display = '';
    updateAnalyzeButton();
  } else {
    state.selectedCandidate = state.candidates[Number(val)];
    document.getElementById('newCandidateRow').classList.add('hidden');
    document.getElementById('resumeSection').style.display = 'none';
    document.getElementById('analyzeContainer').style.display = 'none';
    showExistingCandidateResult(state.selectedCandidate);
  }
}

function showExistingCandidateResult(candidate) {
  let analysis;
  try {
    analysis = JSON.parse(candidate.analysis);
  } catch {
    analysis = {
      probability: parseFloat(candidate.analysis) || 0,
      summary: candidate.analysis,
      careerSummary: candidate.career,
      strengths: [], weaknesses: [], keyMatches: [],
      recommendation: ''
    };
  }

  state.currentAnalysis = analysis;
  state.currentRowIndex = candidate.rowIndex;

  renderResults(analysis, candidate.name);

  if (candidate.result) {
    showFeedbackDone(candidate.result);
  } else {
    showFeedbackForm();
    setTimeout(() => {
      document.getElementById('feedbackSection').scrollIntoView({ behavior: 'smooth' });
    }, 300);
  }
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
function switchTab(tab) {
  if (state.activeTab === 'selection' && tab !== 'selection' && state.selectionModeActive) {
    handleCancelSelection();
  }
  state.activeTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach(c => {
    const active = c.id === tab + 'Tab';
    c.classList.toggle('active', active);
    c.classList.toggle('hidden', !active);
  });
  updateAnalyzeButton();
}

// ─── Capture ──────────────────────────────────────────────────────────────────
async function handleCapture() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    addCapture(dataUrl);
  } catch (e) {
    showMessage(document.getElementById('captureTab'), '캡처 실패: ' + e.message, 'error');
  }
}

async function handleScrollCapture() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [{ result: dims }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({ scrollHeight: document.documentElement.scrollHeight, clientHeight: document.documentElement.clientHeight, scrollTop: window.scrollY })
    });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.scrollTo(0, 0) });
    await sleep(400);
    let pos = 0;
    while (true) {
      addCapture(await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' }));
      pos += dims.clientHeight * 0.85;
      if (pos >= dims.scrollHeight) break;
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: p => window.scrollTo(0, p), args: [pos] });
      await sleep(500);
    }
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: p => window.scrollTo(0, p), args: [dims.scrollTop] });
  } catch (e) {
    showMessage(document.getElementById('captureTab'), '스크롤 캡처 실패: ' + e.message, 'error');
  }
}

function addCapture(dataUrl) {
  state.captures.push(dataUrl);
  document.getElementById('captureCount').textContent = state.captures.length;
  const img = document.createElement('img');
  img.src = dataUrl; img.className = 'capture-thumb';
  document.getElementById('captureList').appendChild(img);
  document.getElementById('capturePreview').classList.remove('hidden');
  updateAnalyzeButton();
}

function clearCaptures() {
  state.captures = [];
  document.getElementById('captureList').innerHTML = '';
  document.getElementById('captureCount').textContent = '0';
  document.getElementById('capturePreview').classList.add('hidden');
  updateAnalyzeButton();
}

// ─── Selection ────────────────────────────────────────────────────────────────
async function handleStartSelection() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/content.js'] }).catch(() => {});
    await chrome.tabs.sendMessage(tab.id, { type: 'ENABLE_SELECTION_MODE' });
    state.selectionModeActive = true;
    document.getElementById('selectionIdle').classList.add('hidden');
    document.getElementById('selectionActive').classList.remove('hidden');
    document.getElementById('selectionPreview').classList.add('hidden');
  } catch (e) {
    showMessage(document.getElementById('selectionTab'), '선택 모드 시작 실패: ' + e.message, 'error');
  }
}

async function handleCancelSelection() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.sendMessage(tab.id, { type: 'DISABLE_SELECTION_MODE' }).catch(() => {});
  } catch {}
  state.selectionModeActive = false;
  document.getElementById('selectionActive').classList.add('hidden');
  document.getElementById('selectionIdle').classList.remove('hidden');
}

function clearSelection() {
  state.selectedText = '';
  document.getElementById('selectionText').textContent = '';
  document.getElementById('selectionPreview').classList.add('hidden');
  updateAnalyzeButton();
}

// ─── Analyze ──────────────────────────────────────────────────────────────────
function updateAnalyzeButton() {
  const hasPosition = !!state.selectedPosition;
  const hasName     = document.getElementById('candidateNameInput').value.trim().length > 0;
  const hasContent  =
    (state.activeTab === 'capture'    && state.captures.length > 0) ||
    (state.activeTab === 'selection'  && state.selectedText)        ||
    (state.activeTab === 'paste'      && document.getElementById('pasteTextInput').value.trim());
  document.getElementById('analyzeBtn').disabled = !(hasPosition && hasName && hasContent);
}

async function handleAnalyze() {
  const apiKey = await getApiKey();
  if (!apiKey) {
    showGlobalError('API 키를 설정에서 입력하세요.');
    toggleSettings(true);
    return;
  }

  const candidateName = document.getElementById('candidateNameInput').value.trim();
  setLoading(true);

  try {
    let result;
    let resumeText = '';

    if (state.activeTab === 'capture') {
      const images = state.captures.map(d => d.split(',')[1]);
      result = await analyzeResumeFromImage(apiKey, state.selectedPosition, images, state.candidates);
      resumeText = result.extractedText || '[이미지 캡처]';
    } else if (state.activeTab === 'selection') {
      resumeText = state.selectedText;
      result = await analyzeResume(apiKey, state.selectedPosition, resumeText, state.candidates);
    } else {
      resumeText = document.getElementById('pasteTextInput').value.trim();
      result = await analyzeResume(apiKey, state.selectedPosition, resumeText, state.candidates);
    }

    // 시트에 저장
    const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const saved = await addCandidateRecord({
      searchCode: state.selectedPosition.searchCode,
      name:       candidateName,
      date:       today,
      career:     result.careerSummary || '',
      analysis:   JSON.stringify(result),
      result:     ''
    });

    state.currentAnalysis = result;
    state.currentRowIndex = saved.rowIndex;

    // 후보자 목록 갱신
    state.candidates = await fetchCandidates(state.selectedPosition.searchCode);
    renderCandidateDropdown();

    renderResults(result, candidateName);
    showFeedbackForm();
  } catch (e) {
    showGlobalError('분析 실패: ' + e.message);
  } finally {
    setLoading(false);
  }
}

function setLoading(on) {
  document.getElementById('analyzeBtn').disabled = on;
  document.getElementById('loadingSpinner').classList.toggle('hidden', !on);
  document.getElementById('analyzeBtn').textContent = on ? '분析 중...' : '🔍 분析 시작';
}

// ─── Results ──────────────────────────────────────────────────────────────────
function renderResults(result, candidateName) {
  const prob = Math.min(100, Math.max(0, result.probability || 0));

  document.getElementById('gaugeBar').style.width = prob + '%';
  document.getElementById('probabilityValue').textContent = prob + '%';
  document.getElementById('gaugeBar').style.background =
    prob >= 70 ? 'linear-gradient(to right,#0ca678,#2f9e44)' :
    prob >= 40 ? 'linear-gradient(to right,#fd7e14,#e8b400)' :
                 'linear-gradient(to right,#e03131,#fd7e14)';

  // Recommendation badge
  const badge = document.getElementById('recommendationBadge');
  badge.textContent = result.recommendation || '';
  badge.className = 'recommendation-badge';
  if ((result.recommendation || '').includes('권고') && !(result.recommendation || '').includes('비'))
    badge.classList.add('recommend');
  else if ((result.recommendation || '').includes('보류'))
    badge.classList.add('hold');
  else if (result.recommendation)
    badge.classList.add('no-recommend');

  // Candidate name badge
  document.getElementById('resultCandidateName').textContent = candidateName || '';

  // Career summary
  const career = result.careerSummary || '';
  document.getElementById('careerSummaryText').textContent = career;
  document.getElementById('careerSummaryBlock').style.display = career ? '' : 'none';

  document.getElementById('resultSummary').textContent = result.summary || '';

  document.getElementById('strengthsList').innerHTML =
    (result.strengths || []).map(s => `<li>${escapeHtml(s)}</li>`).join('');
  document.getElementById('weaknessesList').innerHTML =
    (result.weaknesses || []).map(w => `<li>${escapeHtml(w)}</li>`).join('');

  document.getElementById('keyMatchesList').innerHTML =
    (result.keyMatches || []).map(m => `
      <div class="match-item ${m.matched ? 'matched' : 'unmatched'}">
        <span class="match-icon">${m.matched ? '✅' : '❌'}</span>
        <div class="match-content">
          <div class="match-req">${escapeHtml(m.requirement)}</div>
          <div class="match-detail">${escapeHtml(m.detail || '')}</div>
        </div>
      </div>`).join('');

  document.getElementById('resultsSection').classList.remove('hidden');
  document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth' });
}

// ─── Feedback ─────────────────────────────────────────────────────────────────
function showFeedbackForm() {
  document.getElementById('feedbackSection').classList.remove('hidden');
  document.getElementById('feedbackDone').classList.add('hidden');
  document.getElementById('resultReasonInput').value = '';
  document.getElementById('feedbackPassBtn').classList.remove('active');
  document.getElementById('feedbackFailBtn').classList.remove('active');
  document.getElementById('feedbackConfirm').classList.add('hidden');
}

function showFeedbackDone(resultText) {
  document.getElementById('feedbackSection').classList.add('hidden');
  document.getElementById('feedbackDone').classList.remove('hidden');
  const isPass = resultText.startsWith('합격');
  const el = document.getElementById('feedbackDoneText');
  el.className = 'feedback-done-text ' + (isPass ? 'pass' : 'fail');
  el.textContent = resultText;
}

async function handleFeedback(type) {
  const reason = document.getElementById('resultReasonInput').value.trim();
  if (!reason) {
    document.getElementById('resultReasonInput').focus();
    document.getElementById('resultReasonInput').style.borderColor = '#e03131';
    setTimeout(() => document.getElementById('resultReasonInput').style.borderColor = '', 2000);
    showMessage(document.getElementById('feedbackSection'), '사유를 먼저 입력해주세요.', 'error');
    return;
  }

  const resultText = `${type} - 사유: ${reason}`;

  try {
    await updateCandidateResult(state.currentRowIndex, resultText);

    // 후보자 목록 갱신
    state.candidates = await fetchCandidates(state.selectedPosition.searchCode);
    renderCandidateDropdown();

    document.getElementById('feedbackPassBtn').classList.toggle('active', type === '합격');
    document.getElementById('feedbackFailBtn').classList.toggle('active', type === '불합격');
    const confirm = document.getElementById('feedbackConfirm');
    confirm.textContent = `${resultText} — 시트에 저장되었습니다.`;
    confirm.classList.remove('hidden');

    setTimeout(() => showFeedbackDone(resultText), 1500);
  } catch (e) {
    showMessage(document.getElementById('feedbackSection'), '저장 실패: ' + e.message, 'error');
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function showGlobalError(msg) {
  showMessage(document.getElementById('mainContent'), msg, 'error');
}

function showMessage(container, text, type) {
  const existing = container.querySelector('.error-msg,.success-msg');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.className = type === 'error' ? 'error-msg' : 'success-msg';
  el.textContent = text;
  container.prepend(el);
  setTimeout(() => el.remove(), 4000);
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

document.addEventListener('DOMContentLoaded', init);
