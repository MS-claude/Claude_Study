// content.js - Injected into pages

(function () {
  'use strict';

  if (window.__resumeAnalyzerInjected) return;
  window.__resumeAnalyzerInjected = true;

  // ─── Message handler ───────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'ENABLE_SELECTION_MODE') {
      injectSelectionToolbar();
      sendResponse({ ok: true });
    } else if (msg.type === 'DISABLE_SELECTION_MODE') {
      removeSelectionToolbar();
      sendResponse({ ok: true });
    }
    return true;
  });

  // ─── Floating selection toolbar ────────────────────────────────────────────
  function injectSelectionToolbar() {
    removeSelectionToolbar();

    const toolbar = document.createElement('div');
    toolbar.id = '__ra_toolbar__';
    toolbar.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      height: 48px !important;
      background: #1a56db !important;
      color: white !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      padding: 0 20px !important;
      z-index: 2147483647 !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
      font-size: 13px !important;
      box-shadow: 0 2px 8px rgba(0,0,0,0.25) !important;
      box-sizing: border-box !important;
    `;

    toolbar.innerHTML = `
      <span style="font-weight:500">📋 분석할 이력서 텍스트를 드래그하여 선택하세요</span>
      <div style="display:flex;gap:8px">
        <button id="__ra_confirm__" style="
          background:white;color:#1a56db;border:none;border-radius:6px;
          padding:6px 14px;font-size:13px;font-weight:600;cursor:pointer;
        ">선택 완료</button>
        <button id="__ra_cancel__" style="
          background:rgba(255,255,255,0.2);color:white;border:none;border-radius:6px;
          padding:6px 14px;font-size:13px;cursor:pointer;
        ">취소</button>
      </div>
    `;

    document.body.appendChild(toolbar);
    // Shift page content down so toolbar doesn't overlap
    document.body.style.marginTop = '48px';

    document.getElementById('__ra_confirm__').addEventListener('click', () => {
      const text = window.getSelection().toString().trim();
      if (!text) {
        showToolbarError('텍스트를 먼저 드래그하여 선택해주세요.');
        return;
      }
      chrome.runtime.sendMessage({ type: 'TEXT_SELECTED', text });
      removeSelectionToolbar();
    });

    document.getElementById('__ra_cancel__').addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'SELECTION_CANCELLED' });
      removeSelectionToolbar();
    });
  }

  function removeSelectionToolbar() {
    const existing = document.getElementById('__ra_toolbar__');
    if (existing) {
      existing.remove();
      document.body.style.marginTop = '';
    }
  }

  function showToolbarError(msg) {
    const toolbar = document.getElementById('__ra_toolbar__');
    if (!toolbar) return;
    let err = toolbar.querySelector('#__ra_err__');
    if (!err) {
      err = document.createElement('span');
      err.id = '__ra_err__';
      err.style.cssText = 'color:#ffd43b;font-size:12px;margin-left:12px;';
      toolbar.querySelector('span').after(err);
    }
    err.textContent = msg;
    setTimeout(() => { if (err) err.textContent = ''; }, 2500);
  }

})();
