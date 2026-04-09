// popup.js - Main popup controller

// State
const state = {
  requirements: [],
  selectedRequirement: null,
  captures: [],       // Array of base64 images
  selectedText: '',
  currentAnalysis: null,
  currentAnalysisId: null,
  activeTab: 'capture'
};

// DOM refs
const els = {
  settingsBtn: () => document.getElementById('settingsBtn'),
  settingsPanel: () => document.getElementById('settingsPanel'),
  mainContent: () => document.getElementById('mainContent'),
  closeSettingsBtn: () => document.getElementById('closeSettingsBtn'),
  apiKeyInput: () => document.getElementById('apiKeyInput'),
  saveApiKeyBtn: () => document.getElementById('saveApiKeyBtn'),

  requirementSelect: () => document.getElementById('requirementSelect'),
  deleteReqBtn: () => document.getElementById('deleteReqBtn'),
  newReqForm: () => document.getElementById('newReqForm'),
  editReqForm: () => document.getElementById('editReqForm'),
  reqNameInput: () => document.getElementById('reqNameInput'),
  reqContentInput: () => document.getElementById('reqContentInput'),
  saveNewReqBtn: () => document.getElementById('saveNewReqBtn'),
  cancelNewReqBtn: () => document.getElementById('cancelNewReqBtn'),
  editReqNameInput: () => document.getElementById('editReqNameInput'),
  editReqContentInput: () => document.getElementById('editReqContentInput'),
  saveEditReqBtn: () => document.getElementById('saveEditReqBtn'),
  cancelEditReqBtn: () => document.getElementById('cancelEditReqBtn'),
  reqStats: () => document.getElementById('reqStats'),

  captureBtn: () => document.getElementById('captureBtn'),
  scrollCaptureBtn: () => document.getElementById('scrollCaptureBtn'),
  capturePreview: () => document.getElementById('capturePreview'),
  captureCount: () => document.getElementById('captureCount'),
  captureList: () => document.getElementById('captureList'),
  clearCaptureBtn: () => document.getElementById('clearCaptureBtn'),

  getSelectionBtn: () => document.getElementById('getSelectionBtn'),
  selectionPreview: () => document.getElementById('selectionPreview'),
  selectionText: () => document.getElementById('selectionText'),
  clearSelectionBtn: () => document.getElementById('clearSelectionBtn'),
  pasteTextInput: () => document.getElementById('pasteTextInput'),

  analyzeBtn: () => document.getElementById('analyzeBtn'),
  loadingSpinner: () => document.getElementById('loadingSpinner'),

  resultsSection: () => document.getElementById('resultsSection'),
  gaugeBar: () => document.getElementById('gaugeBar'),
  probabilityValue: () => document.getElementById('probabilityValue'),
  recommendationBadge: () => document.getElementById('recommendationBadge'),
  resultSummary: () => document.getElementById('resultSummary'),
  strengthsList: () => document.getElementById('strengthsList'),
  weaknessesList: () => document.getElementById('weaknessesList'),
  keyMatchesList: () => document.getElementById('keyMatchesList'),

  feedbackPassBtn: () => document.getElementById('feedbackPassBtn'),
  feedbackFailBtn: () => document.getElementById('feedbackFailBtn'),
  feedbackConfirm: () => document.getElementById('feedbackConfirm'),

  viewHistoryBtn: () => document.getElementById('viewHistoryBtn'),
  historySection: () => document.getElementById('historySection'),
  historyList: () => document.getElementById('historyList'),
  closeHistoryBtn: () => document.getElementById('closeHistoryBtn')
};

// ─── Init ───────────────────────────────────────────────────────────────────
async function init() {
  await loadRequirements();
  await loadApiKey();
  bindEvents();
}

async function loadRequirements() {
  state.requirements = await getRequirements();
  renderRequirementDropdown();
}

async function loadApiKey() {
  const key = await getApiKey();
  if (key) els.apiKeyInput().value = key;
}

function renderRequirementDropdown() {
  const select = els.requirementSelect();
  const currentVal = select.value;

  // Clear options except defaults
  while (select.options.length > 2) select.remove(2);

  state.requirements.forEach(req => {
    const opt = document.createElement('option');
    opt.value = req.id;
    opt.textContent = req.name;
    select.insertBefore(opt, select.options[select.options.length - 1]);
  });

  if (currentVal) select.value = currentVal;
}

// ─── Event Binding ───────────────────────────────────────────────────────────
function bindEvents() {
  // Settings
  els.settingsBtn().addEventListener('click', () => toggleSettings(true));
  els.closeSettingsBtn().addEventListener('click', () => toggleSettings(false));
  els.saveApiKeyBtn().addEventListener('click', handleSaveApiKey);

  // Requirements
  els.requirementSelect().addEventListener('change', handleRequirementSelect);
  els.saveNewReqBtn().addEventListener('click', handleSaveNewRequirement);
  els.cancelNewReqBtn().addEventListener('click', () => {
    els.newReqForm().classList.add('hidden');
    els.requirementSelect().value = '';
  });
  els.saveEditReqBtn().addEventListener('click', handleSaveEditRequirement);
  els.cancelEditReqBtn().addEventListener('click', () => {
    els.editReqForm().classList.add('hidden');
  });
  els.deleteReqBtn().addEventListener('click', handleDeleteRequirement);

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Capture
  els.captureBtn().addEventListener('click', handleCapture);
  els.scrollCaptureBtn().addEventListener('click', handleScrollCapture);
  els.clearCaptureBtn().addEventListener('click', clearCaptures);

  // Selection
  els.getSelectionBtn().addEventListener('click', handleGetSelection);
  els.clearSelectionBtn().addEventListener('click', clearSelection);

  // Paste
  els.pasteTextInput().addEventListener('input', updateAnalyzeButton);

  // Analyze
  els.analyzeBtn().addEventListener('click', handleAnalyze);

  // Feedback
  els.feedbackPassBtn().addEventListener('click', () => handleFeedback('pass'));
  els.feedbackFailBtn().addEventListener('click', () => handleFeedback('fail'));

  // History
  els.viewHistoryBtn().addEventListener('click', showHistory);
  els.closeHistoryBtn().addEventListener('click', () => {
    els.historySection().classList.add('hidden');
    els.resultsSection().classList.remove('hidden');
  });
}

// ─── Settings ────────────────────────────────────────────────────────────────
function toggleSettings(show) {
  els.settingsPanel().classList.toggle('hidden', !show);
}

async function handleSaveApiKey() {
  const key = els.apiKeyInput().value.trim();
  if (!key) return showMessage(els.settingsPanel(), 'API 키를 입력하세요.', 'error');
  await saveApiKey(key);
  showMessage(els.settingsPanel(), 'API 키가 저장되었습니다.', 'success');
  setTimeout(() => toggleSettings(false), 1000);
}

// ─── Requirements ────────────────────────────────────────────────────────────
function handleRequirementSelect() {
  const val = els.requirementSelect().value;
  els.newReqForm().classList.add('hidden');
  els.editReqForm().classList.add('hidden');
  els.deleteReqBtn().classList.add('hidden');

  if (val === '__new__') {
    els.newReqForm().classList.remove('hidden');
    els.reqNameInput().focus();
    state.selectedRequirement = null;
  } else if (val) {
    const req = state.requirements.find(r => r.id === val);
    if (req) {
      state.selectedRequirement = req;
      els.editReqNameInput().value = req.name;
      els.editReqContentInput().value = req.content;
      els.editReqForm().classList.remove('hidden');
      els.deleteReqBtn().classList.remove('hidden');
      renderReqStats(req);
    }
  } else {
    state.selectedRequirement = null;
  }
  updateAnalyzeButton();
}

function renderReqStats(req) {
  const history = req.analysisHistory || [];
  const total = history.length;
  const pass = history.filter(h => h.feedback === 'pass').length;
  const fail = history.filter(h => h.feedback === 'fail').length;
  els.reqStats().textContent = `분석 ${total}건 | 합격 ${pass}건 | 불합격 ${fail}건`;
}

async function handleSaveNewRequirement() {
  const name = els.reqNameInput().value.trim();
  const content = els.reqContentInput().value.trim();
  if (!name || !content) return showMessage(els.newReqForm(), '포지션명과 요구사항을 모두 입력하세요.', 'error');

  const saved = await saveRequirement({ name, content });
  state.requirements.push(saved);
  renderRequirementDropdown();

  els.requirementSelect().value = saved.id;
  state.selectedRequirement = saved;
  els.newReqForm().classList.add('hidden');
  els.editReqNameInput().value = name;
  els.editReqContentInput().value = content;
  els.editReqForm().classList.remove('hidden');
  els.deleteReqBtn().classList.remove('hidden');
  renderReqStats(saved);
  updateAnalyzeButton();
}

async function handleSaveEditRequirement() {
  if (!state.selectedRequirement) return;
  const name = els.editReqNameInput().value.trim();
  const content = els.editReqContentInput().value.trim();
  if (!name || !content) return showMessage(els.editReqForm(), '포지션명과 요구사항을 모두 입력하세요.', 'error');

  const updated = await updateRequirement(state.selectedRequirement.id, { name, content });
  const index = state.requirements.findIndex(r => r.id === updated.id);
  if (index !== -1) state.requirements[index] = updated;
  state.selectedRequirement = updated;
  renderRequirementDropdown();
  els.requirementSelect().value = updated.id;
  showMessage(els.editReqForm(), '저장되었습니다.', 'success');
}

async function handleDeleteRequirement() {
  if (!state.selectedRequirement) return;
  if (!confirm(`"${state.selectedRequirement.name}" 요구사항을 삭제하시겠습니까?\n모든 분석 이력도 함께 삭제됩니다.`)) return;

  await deleteRequirement(state.selectedRequirement.id);
  state.requirements = state.requirements.filter(r => r.id !== state.selectedRequirement.id);
  state.selectedRequirement = null;
  renderRequirementDropdown();
  els.requirementSelect().value = '';
  els.editReqForm().classList.add('hidden');
  els.deleteReqBtn().classList.add('hidden');
  updateAnalyzeButton();
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === tab + 'Tab');
  });
  updateAnalyzeButton();
}

// ─── Capture ─────────────────────────────────────────────────────────────────
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

    // Get page dimensions
    const [{ result: dims }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight,
        scrollTop: window.scrollY
      })
    });

    const screenshots = [];
    let scrollPos = 0;

    // Scroll to top first
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.scrollTo(0, 0)
    });
    await sleep(300);

    while (scrollPos <= dims.scrollHeight) {
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
      screenshots.push(dataUrl);

      scrollPos += dims.clientHeight;
      if (scrollPos >= dims.scrollHeight) break;

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (pos) => window.scrollTo(0, pos),
        args: [scrollPos]
      });
      await sleep(500);
    }

    // Restore scroll position
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (pos) => window.scrollTo(0, pos),
      args: [dims.scrollTop]
    });

    screenshots.forEach(s => addCapture(s));
  } catch (e) {
    showMessage(document.getElementById('captureTab'), '스크롤 캡처 실패: ' + e.message, 'error');
  }
}

function addCapture(dataUrl) {
  state.captures.push(dataUrl);
  els.captureCount().textContent = state.captures.length;

  const img = document.createElement('img');
  img.src = dataUrl;
  img.className = 'capture-thumb';
  els.captureList().appendChild(img);

  els.capturePreview().classList.remove('hidden');
  updateAnalyzeButton();
}

function clearCaptures() {
  state.captures = [];
  els.captureList().innerHTML = '';
  els.captureCount().textContent = '0';
  els.capturePreview().classList.add('hidden');
  updateAnalyzeButton();
}

// ─── Selection ────────────────────────────────────────────────────────────────
async function handleGetSelection() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [{ result: text }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection().toString().trim()
    });

    if (!text) {
      showMessage(document.getElementById('selectionTab'), '선택된 텍스트가 없습니다. 페이지에서 텍스트를 드래그하여 선택하세요.', 'error');
      return;
    }

    state.selectedText = text;
    els.selectionText().textContent = text;
    els.selectionPreview().classList.remove('hidden');
    updateAnalyzeButton();
  } catch (e) {
    showMessage(document.getElementById('selectionTab'), '텍스트 가져오기 실패: ' + e.message, 'error');
  }
}

function clearSelection() {
  state.selectedText = '';
  els.selectionText().textContent = '';
  els.selectionPreview().classList.add('hidden');
  updateAnalyzeButton();
}

// ─── Analyze ──────────────────────────────────────────────────────────────────
function updateAnalyzeButton() {
  const hasReq = !!state.selectedRequirement;
  const hasContent = (
    (state.activeTab === 'capture' && state.captures.length > 0) ||
    (state.activeTab === 'selection' && state.selectedText) ||
    (state.activeTab === 'paste' && els.pasteTextInput().value.trim())
  );
  els.analyzeBtn().disabled = !(hasReq && hasContent);
}

async function handleAnalyze() {
  const apiKey = await getApiKey();
  if (!apiKey) {
    showMessage(document.getElementById('analyzeContainer'), 'API 키를 먼저 설정하세요.', 'error');
    toggleSettings(true);
    return;
  }

  setLoading(true);

  try {
    let result;
    let resumeText = '';

    if (state.activeTab === 'capture' && state.captures.length > 0) {
      // Use first capture for now; could merge multiple
      const base64 = state.captures[0].split(',')[1];
      result = await analyzeResumeFromImage(apiKey, state.selectedRequirement, base64);
      resumeText = result.extractedText || '[이미지에서 추출]';
    } else if (state.activeTab === 'selection') {
      resumeText = state.selectedText;
      result = await analyzeResume(apiKey, state.selectedRequirement, resumeText);
    } else {
      resumeText = els.pasteTextInput().value.trim();
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

    // Update local state
    const reqIndex = state.requirements.findIndex(r => r.id === state.selectedRequirement.id);
    if (reqIndex !== -1) {
      state.requirements[reqIndex] = await getRequirements().then(reqs =>
        reqs.find(r => r.id === state.selectedRequirement.id)
      );
      state.selectedRequirement = state.requirements[reqIndex];
      renderReqStats(state.selectedRequirement);
    }

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
  els.analyzeBtn().disabled = on;
  els.loadingSpinner().classList.toggle('hidden', !on);
  els.analyzeBtn().textContent = on ? '분석 중...' : '🔍 분석 시작';
}

// ─── Results ──────────────────────────────────────────────────────────────────
function renderResults(result) {
  const prob = Math.min(100, Math.max(0, result.probability));

  // Gauge
  els.gaugeBar().style.width = prob + '%';
  els.probabilityValue().textContent = prob + '%';

  // Color the gauge based on probability
  if (prob >= 70) els.gaugeBar().style.background = 'linear-gradient(to right, #0ca678, #2f9e44)';
  else if (prob >= 40) els.gaugeBar().style.background = 'linear-gradient(to right, #fd7e14, #e8b400)';
  else els.gaugeBar().style.background = 'linear-gradient(to right, #e03131, #fd7e14)';

  // Recommendation badge
  const badge = els.recommendationBadge();
  badge.textContent = result.recommendation || '';
  badge.className = 'recommendation-badge';
  if (result.recommendation?.includes('권고') && !result.recommendation?.includes('비')) {
    badge.classList.add('recommend');
  } else if (result.recommendation?.includes('보류')) {
    badge.classList.add('hold');
  } else {
    badge.classList.add('no-recommend');
  }

  // Summary
  els.resultSummary().textContent = result.summary || '';

  // Strengths
  els.strengthsList().innerHTML = (result.strengths || [])
    .map(s => `<li>${escapeHtml(s)}</li>`).join('');

  // Weaknesses
  els.weaknessesList().innerHTML = (result.weaknesses || [])
    .map(w => `<li>${escapeHtml(w)}</li>`).join('');

  // Key matches
  els.keyMatchesList().innerHTML = (result.keyMatches || []).map(m => `
    <div class="match-item ${m.matched ? 'matched' : 'unmatched'}">
      <span class="match-icon">${m.matched ? '✅' : '❌'}</span>
      <div class="match-content">
        <div class="match-req">${escapeHtml(m.requirement)}</div>
        <div class="match-detail">${escapeHtml(m.detail || '')}</div>
      </div>
    </div>
  `).join('');

  // Reset feedback
  els.feedbackPassBtn().classList.remove('active');
  els.feedbackFailBtn().classList.remove('active');
  els.feedbackConfirm().classList.add('hidden');

  // Show results
  els.resultsSection().classList.remove('hidden');
  els.resultsSection().scrollIntoView({ behavior: 'smooth' });
}

// ─── Feedback ─────────────────────────────────────────────────────────────────
async function handleFeedback(type) {
  if (!state.selectedRequirement || !state.currentAnalysisId) return;

  await updateAnalysisFeedback(state.selectedRequirement.id, state.currentAnalysisId, type);

  // Update local state
  state.requirements = await getRequirements();
  state.selectedRequirement = state.requirements.find(r => r.id === state.selectedRequirement.id);
  renderReqStats(state.selectedRequirement);

  els.feedbackPassBtn().classList.toggle('active', type === 'pass');
  els.feedbackFailBtn().classList.toggle('active', type === 'fail');

  const label = type === 'pass' ? '합격' : '불합격';
  els.feedbackConfirm().textContent = `${label}으로 기록되었습니다. 다음 분석에 반영됩니다.`;
  els.feedbackConfirm().classList.remove('hidden');
}

// ─── History ──────────────────────────────────────────────────────────────────
async function showHistory() {
  if (!state.selectedRequirement) return;
  const req = state.requirements.find(r => r.id === state.selectedRequirement.id);
  const history = [...(req?.analysisHistory || [])].reverse();

  els.historyList().innerHTML = history.length === 0
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

  els.historySection().classList.remove('hidden');
  els.resultsSection().classList.add('hidden');
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
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Start ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
