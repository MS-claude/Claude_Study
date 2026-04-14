// popup.js - Side panel controller

const state = {
  requirements: [],
  selectedRequirement: null,
  captures: [],
  selectedText: '',
  selectionModeActive: false,
  currentAnalysis: null,
  currentAnalysisId: null,
  activeTab: 'capture'
};

// ─── Init ───────────────────────────────────────────────────────────────────
async function init() {
  await loadRequirements();
  await loadApiKey();
  bindEvents();
  listenForMessages();
}

async function loadRequirements() {
  state.requirements = await getRequirements();
  renderRequirementDropdown();
}

async function loadApiKey() {
  const key = await getApiKey();
  if (key) document.getElementById('apiKeyInput').value = key;
  const model = await getModelName();
  document.getElementById('modelNameInput').value = model;
}

function renderRequirementDropdown() {
  const select = document.getElementById('requirementSelect');
  const currentVal = select.value;

  while (select.options.length > 2) select.remove(2);

  state.requirements.forEach(req => {
    const opt = document.createElement('option');
    opt.value = req.id;
    opt.textContent = req.name;
    select.insertBefore(opt, select.options[select.options.length - 1]);
  });

  if (currentVal) select.value = currentVal;
}

// ─── Listen for content script messages ──────────────────────────────────────
function listenForMessages() {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'TEXT_SELECTED') {
      state.selectedText = msg.text;
      state.selectionModeActive = false;
      showSelectionResult(msg.text);
    } else if (msg.type === 'SELECTION_CANCELLED') {
      state.selectionModeActive = false;
      document.getElementById('selectionActive').classList.add('hidden');
      document.getElementById('selectionIdle').classList.remove('hidden');
    }
  });
}

// ─── Event Binding ────────────────────────────────────────────────────────────
function bindEvents() {
  // Header
  document.getElementById('settingsBtn').addEventListener('click', () => toggleSettings(true));
  document.getElementById('closeBtn').addEventListener('click', handleClose);

  // Settings
  document.getElementById('closeSettingsBtn').addEventListener('click', () => toggleSettings(false));
  document.getElementById('saveApiKeyBtn').addEventListener('click', handleSaveApiKey);
  document.getElementById('saveModelBtn').addEventListener('click', handleSaveModel);

  // Requirements
  document.getElementById('requirementSelect').addEventListener('change', handleRequirementSelect);
  document.getElementById('saveNewReqBtn').addEventListener('click', handleSaveNewRequirement);
  document.getElementById('cancelNewReqBtn').addEventListener('click', () => {
    document.getElementById('newReqForm').classList.add('hidden');
    document.getElementById('requirementSelect').value = '';
    state.selectedRequirement = null;
    updateAnalyzeButton();
  });
  document.getElementById('saveEditReqBtn').addEventListener('click', handleSaveEditRequirement);
  document.getElementById('cancelEditReqBtn').addEventListener('click', () => {
    document.getElementById('editReqForm').classList.add('hidden');
  });
  document.getElementById('deleteReqBtn').addEventListener('click', handleDeleteRequirement);

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Capture
  document.getElementById('captureBtn').addEventListener('click', handleCapture);
  document.getElementById('scrollCaptureBtn').addEventListener('click', handleScrollCapture);
  document.getElementById('clearCaptureBtn').addEventListener('click', clearCaptures);

  // Selection
  document.getElementById('startSelectionBtn').addEventListener('click', handleStartSelection);
  document.getElementById('cancelSelectionBtn').addEventListener('click', handleCancelSelection);
  document.getElementById('clearSelectionBtn').addEventListener('click', clearSelection);

  // Paste
  document.getElementById('pasteTextInput').addEventListener('input', (e) => {
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
  document.getElementById('feedbackPassBtn').addEventListener('click', () => handleFeedback('pass'));
  document.getElementById('feedbackFailBtn').addEventListener('click', () => handleFeedback('fail'));

  // History
  document.getElementById('viewHistoryBtn').addEventListener('click', showHistory);
  document.getElementById('closeHistoryBtn').addEventListener('click', () => {
    document.getElementById('historySection').classList.add('hidden');
    document.getElementById('resultsSection').classList.remove('hidden');
  });
}

// ─── Header ───────────────────────────────────────────────────────────────────
function handleClose() {
  // Cancel any active selection mode first
  if (state.selectionModeActive) handleCancelSelection();
  window.close();
}

// ─── Settings ─────────────────────────────────────────────────────────────────
function toggleSettings(show) {
  document.getElementById('settingsPanel').classList.toggle('hidden', !show);
}

async function handleSaveApiKey() {
  const key = document.getElementById('apiKeyInput').value.trim();
  if (!key) return showMessage(document.getElementById('settingsPanel'), 'API 키를 입력하세요.', 'error');
  await saveApiKey(key);
  showMessage(document.getElementById('settingsPanel'), 'API 키가 저장되었습니다.', 'success');
  setTimeout(() => toggleSettings(false), 1000);
}

async function handleSaveModel() {
  const name = document.getElementById('modelNameInput').value.trim();
  if (!name) return showMessage(document.getElementById('settingsPanel'), '모델명을 입력하세요.', 'error');
  await saveModelName(name);
  showMessage(document.getElementById('settingsPanel'), `모델이 "${name}"으로 저장되었습니다.`, 'success');
}

// ─── Requirements ─────────────────────────────────────────────────────────────
function handleRequirementSelect() {
  const val = document.getElementById('requirementSelect').value;
  document.getElementById('newReqForm').classList.add('hidden');
  document.getElementById('editReqForm').classList.add('hidden');
  document.getElementById('deleteReqBtn').classList.add('hidden');

  if (val === '__new__') {
    document.getElementById('newReqForm').classList.remove('hidden');
    document.getElementById('reqNameInput').focus();
    state.selectedRequirement = null;
  } else if (val) {
    const req = state.requirements.find(r => r.id === val);
    if (req) {
      state.selectedRequirement = req;
      document.getElementById('editReqNameInput').value = req.name;
      document.getElementById('editReqContentInput').value = req.content;
      document.getElementById('editReqForm').classList.remove('hidden');
      document.getElementById('deleteReqBtn').classList.remove('hidden');
      renderReqStats(req);
    }
  } else {
    state.selectedRequirement = null;
  }
  updateAnalyzeButton();
}

function renderReqStats(req) {
  const history = req.analysisHistory || [];
  const pass = history.filter(h => h.feedback === 'pass').length;
  const fail = history.filter(h => h.feedback === 'fail').length;
  document.getElementById('reqStats').textContent =
    `분석 ${history.length}건 · 합격 ${pass}건 · 불합격 ${fail}건`;
}

async function handleSaveNewRequirement() {
  const name = document.getElementById('reqNameInput').value.trim();
  const content = document.getElementById('reqContentInput').value.trim();
  if (!name || !content) return showMessage(document.getElementById('newReqForm'), '포지션명과 요구사항을 모두 입력하세요.', 'error');

  const saved = await saveRequirement({ name, content });
  state.requirements.push(saved);
  renderRequirementDropdown();

  document.getElementById('requirementSelect').value = saved.id;
  state.selectedRequirement = saved;
  document.getElementById('newReqForm').classList.add('hidden');
  document.getElementById('editReqNameInput').value = name;
  document.getElementById('editReqContentInput').value = content;
  document.getElementById('editReqForm').classList.remove('hidden');
  document.getElementById('deleteReqBtn').classList.remove('hidden');
  renderReqStats(saved);
  updateAnalyzeButton();
}

async function handleSaveEditRequirement() {
  if (!state.selectedRequirement) return;
  const name = document.getElementById('editReqNameInput').value.trim();
  const content = document.getElementById('editReqContentInput').value.trim();
  if (!name || !content) return showMessage(document.getElementById('editReqForm'), '포지션명과 요구사항을 모두 입력하세요.', 'error');

  const updated = await updateRequirement(state.selectedRequirement.id, { name, content });
  const index = state.requirements.findIndex(r => r.id === updated.id);
  if (index !== -1) state.requirements[index] = updated;
  state.selectedRequirement = updated;
  renderRequirementDropdown();
  document.getElementById('requirementSelect').value = updated.id;
  showMessage(document.getElementById('editReqForm'), '저장되었습니다.', 'success');
}

async function handleDeleteRequirement() {
  if (!state.selectedRequirement) return;
  if (!confirm(`"${state.selectedRequirement.name}" 요구사항을 삭제하시겠습니까?\n모든 분석 이력도 함께 삭제됩니다.`)) return;

  await deleteRequirement(state.selectedRequirement.id);
  state.requirements = state.requirements.filter(r => r.id !== state.selectedRequirement.id);
  state.selectedRequirement = null;
  renderRequirementDropdown();
  document.getElementById('requirementSelect').value = '';
  document.getElementById('editReqForm').classList.add('hidden');
  document.getElementById('deleteReqBtn').classList.add('hidden');
  updateAnalyzeButton();
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
function switchTab(tab) {
  // Cancel selection mode if switching away
  if (state.activeTab === 'selection' && tab !== 'selection' && state.selectionModeActive) {
    handleCancelSelection();
  }

  state.activeTab = tab;

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  // Toggle both active and hidden properly (hidden has !important so must be removed)
  document.querySelectorAll('.tab-content').forEach(content => {
    const isActive = content.id === tab + 'Tab';
    content.classList.toggle('active', isActive);
    content.classList.toggle('hidden', !isActive);
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
      func: () => ({
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight,
        scrollTop: window.scrollY
      })
    });

    // Scroll to top
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.scrollTo(0, 0)
    });
    await sleep(400);

    let scrollPos = 0;
    while (true) {
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
      addCapture(dataUrl);

      scrollPos += dims.clientHeight * 0.85; // 15% overlap for continuity
      if (scrollPos >= dims.scrollHeight) break;

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (pos) => window.scrollTo(0, pos),
        args: [scrollPos]
      });
      await sleep(500);
    }

    // Restore scroll
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (pos) => window.scrollTo(0, pos),
      args: [dims.scrollTop]
    });
  } catch (e) {
    showMessage(document.getElementById('captureTab'), '스크롤 캡처 실패: ' + e.message, 'error');
  }
}

function addCapture(dataUrl) {
  state.captures.push(dataUrl);
  document.getElementById('captureCount').textContent = state.captures.length;

  const img = document.createElement('img');
  img.src = dataUrl;
  img.className = 'capture-thumb';
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
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/content.js']
    }).catch(() => {}); // already injected is fine

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

function showSelectionResult(text) {
  document.getElementById('selectionActive').classList.add('hidden');
  document.getElementById('selectionIdle').classList.remove('hidden');
  document.getElementById('selectionText').textContent = text;
  document.getElementById('selectionPreview').classList.remove('hidden');
  updateAnalyzeButton();
}

function clearSelection() {
  state.selectedText = '';
  document.getElementById('selectionText').textContent = '';
  document.getElementById('selectionPreview').classList.add('hidden');
  updateAnalyzeButton();
}

// ─── Analyze ──────────────────────────────────────────────────────────────────
function updateAnalyzeButton() {
  const hasReq = !!state.selectedRequirement;
  const hasContent =
    (state.activeTab === 'capture' && state.captures.length > 0) ||
    (state.activeTab === 'selection' && state.selectedText) ||
    (state.activeTab === 'paste' && document.getElementById('pasteTextInput').value.trim());

  document.getElementById('analyzeBtn').disabled = !(hasReq && hasContent);
}

async function handleAnalyze() {
  const apiKey = await getApiKey();
  if (!apiKey) {
    showMessage(document.getElementById('analyzeContainer'), 'API 키를 먼저 설정하세요. (⚙️ 설정)', 'error');
    return;
  }

  setLoading(true);

  try {
    let result;
    let resumeText = '';

    if (state.activeTab === 'capture') {
      const base64Images = state.captures.map(d => d.split(',')[1]);
      result = await analyzeResumeFromImage(apiKey, state.selectedRequirement, base64Images);
      resumeText = result.extractedText || '[이미지 캡처]';
    } else if (state.activeTab === 'selection') {
      resumeText = state.selectedText;
      result = await analyzeResume(apiKey, state.selectedRequirement, resumeText);
    } else {
      resumeText = document.getElementById('pasteTextInput').value.trim();
      result = await analyzeResume(apiKey, state.selectedRequirement, resumeText);
    }

    // Save to history
    const { analysis } = await addAnalysisResult(state.selectedRequirement.id, {
      resumeText,
      probability: result.probability,
      reasoning: result.summary,
      strengths: result.strengths,
      weaknesses: result.weaknesses,
      captureMethod: state.activeTab
    });

    // Refresh local state
    const reqs = await getRequirements();
    state.selectedRequirement = reqs.find(r => r.id === state.selectedRequirement.id);
    const idx = state.requirements.findIndex(r => r.id === state.selectedRequirement.id);
    if (idx !== -1) state.requirements[idx] = state.selectedRequirement;
    renderReqStats(state.selectedRequirement);

    state.currentAnalysis = result;
    state.currentAnalysisId = analysis.id;
    renderResults(result);
  } catch (e) {
    showMessage(document.getElementById('analyzeContainer'), '분석 실패: ' + e.message, 'error');
  } finally {
    setLoading(false);
  }
}

function setLoading(on) {
  document.getElementById('analyzeBtn').disabled = on;
  document.getElementById('loadingSpinner').classList.toggle('hidden', !on);
  document.getElementById('analyzeBtn').textContent = on ? '분석 중...' : '🔍 분석 시작';
}

// ─── Results ──────────────────────────────────────────────────────────────────
function renderResults(result) {
  const prob = Math.min(100, Math.max(0, result.probability));

  document.getElementById('gaugeBar').style.width = prob + '%';
  document.getElementById('probabilityValue').textContent = prob + '%';

  if (prob >= 70) {
    document.getElementById('gaugeBar').style.background = 'linear-gradient(to right, #0ca678, #2f9e44)';
  } else if (prob >= 40) {
    document.getElementById('gaugeBar').style.background = 'linear-gradient(to right, #fd7e14, #e8b400)';
  } else {
    document.getElementById('gaugeBar').style.background = 'linear-gradient(to right, #e03131, #fd7e14)';
  }

  const badge = document.getElementById('recommendationBadge');
  badge.textContent = result.recommendation || '';
  badge.className = 'recommendation-badge';
  if (result.recommendation?.includes('권고') && !result.recommendation?.includes('비')) {
    badge.classList.add('recommend');
  } else if (result.recommendation?.includes('보류')) {
    badge.classList.add('hold');
  } else {
    badge.classList.add('no-recommend');
  }

  document.getElementById('resultSummary').textContent = result.summary || '';

  document.getElementById('strengthsList').innerHTML = (result.strengths || [])
    .map(s => `<li>${escapeHtml(s)}</li>`).join('');

  document.getElementById('weaknessesList').innerHTML = (result.weaknesses || [])
    .map(w => `<li>${escapeHtml(w)}</li>`).join('');

  document.getElementById('keyMatchesList').innerHTML = (result.keyMatches || []).map(m => `
    <div class="match-item ${m.matched ? 'matched' : 'unmatched'}">
      <span class="match-icon">${m.matched ? '✅' : '❌'}</span>
      <div class="match-content">
        <div class="match-req">${escapeHtml(m.requirement)}</div>
        <div class="match-detail">${escapeHtml(m.detail || '')}</div>
      </div>
    </div>
  `).join('');

  document.getElementById('feedbackPassBtn').classList.remove('active');
  document.getElementById('feedbackFailBtn').classList.remove('active');
  document.getElementById('feedbackConfirm').classList.add('hidden');

  document.getElementById('resultsSection').classList.remove('hidden');
  document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth' });
}

// ─── Feedback ─────────────────────────────────────────────────────────────────
async function handleFeedback(type) {
  if (!state.selectedRequirement || !state.currentAnalysisId) return;

  await updateAnalysisFeedback(state.selectedRequirement.id, state.currentAnalysisId, type);

  const reqs = await getRequirements();
  state.selectedRequirement = reqs.find(r => r.id === state.selectedRequirement.id);
  const idx = state.requirements.findIndex(r => r.id === state.selectedRequirement.id);
  if (idx !== -1) state.requirements[idx] = state.selectedRequirement;
  renderReqStats(state.selectedRequirement);

  document.getElementById('feedbackPassBtn').classList.toggle('active', type === 'pass');
  document.getElementById('feedbackFailBtn').classList.toggle('active', type === 'fail');

  const label = type === 'pass' ? '합격' : '불합격';
  const confirm = document.getElementById('feedbackConfirm');
  confirm.textContent = `${label}으로 기록되었습니다. 다음 분석에 반영됩니다.`;
  confirm.classList.remove('hidden');
}

// ─── History ──────────────────────────────────────────────────────────────────
async function showHistory() {
  if (!state.selectedRequirement) return;
  const req = state.requirements.find(r => r.id === state.selectedRequirement.id);
  const history = [...(req?.analysisHistory || [])].reverse();

  document.getElementById('historyList').innerHTML = history.length === 0
    ? '<p style="text-align:center;color:#868e96;font-size:12px;padding:20px">분석 이력이 없습니다.</p>'
    : history.map(h => {
        const date = new Date(h.timestamp).toLocaleDateString('ko-KR', {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        const feedbackLabel = h.feedback === 'pass' ? '합격' : h.feedback === 'fail' ? '불합격' : '미입력';
        return `
          <div class="history-item">
            <div class="history-header">
              <span class="history-prob">${h.probability}%</span>
              <span class="history-feedback ${h.feedback}">${feedbackLabel}</span>
            </div>
            <div class="history-date">${date}</div>
            <div class="history-summary">${escapeHtml(h.reasoning || '')}</div>
          </div>
        `;
      }).join('');

  document.getElementById('historySection').classList.remove('hidden');
  document.getElementById('resultsSection').classList.add('hidden');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function showMessage(container, text, type) {
  const existing = container.querySelector('.error-msg, .success-msg');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.className = type === 'error' ? 'error-msg' : 'success-msg';
  el.textContent = text;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

document.addEventListener('DOMContentLoaded', init);
