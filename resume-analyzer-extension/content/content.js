// content.js - Injected into pages to assist with text selection and capture coordination

(function () {
  'use strict';

  // Avoid double-injection
  if (window.__resumeAnalyzerInjected) return;
  window.__resumeAnalyzerInjected = true;

  let selectionOverlay = null;
  let isSelectionMode = false;

  // ─── Message handler from popup ───────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'GET_SELECTION') {
      const text = window.getSelection().toString().trim();
      sendResponse({ text });
    } else if (msg.type === 'GET_PAGE_TEXT') {
      // Extract visible text from page (fallback when screenshot is not enough)
      const text = extractVisibleText();
      sendResponse({ text });
    } else if (msg.type === 'ENABLE_SELECTION_MODE') {
      enableSelectionMode();
      sendResponse({ ok: true });
    } else if (msg.type === 'DISABLE_SELECTION_MODE') {
      disableSelectionMode();
      sendResponse({ ok: true });
    }
    return true; // keep channel open for async
  });

  // ─── Visible text extraction ───────────────────────────────────────────────
  function extractVisibleText() {
    const skipTags = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'META', 'HEAD', 'IFRAME', 'OBJECT']);
    const texts = [];

    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent.trim();
        if (text.length > 0) texts.push(text);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (skipTags.has(node.tagName)) return;

      // Check visibility
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;

      for (const child of node.childNodes) {
        walk(child);
      }
    }

    walk(document.body);
    return texts.join('\n');
  }

  // ─── Visual selection mode (highlight text regions) ───────────────────────
  function enableSelectionMode() {
    isSelectionMode = true;
    document.body.style.cursor = 'text';

    // Show tooltip
    showTooltip('텍스트를 드래그하여 선택한 후, 확장 프로그램에서 "선택된 텍스트 가져오기"를 클릭하세요.');
  }

  function disableSelectionMode() {
    isSelectionMode = false;
    document.body.style.cursor = '';
    hideTooltip();
  }

  let tooltip = null;
  function showTooltip(text) {
    hideTooltip();
    tooltip = document.createElement('div');
    tooltip.id = '__resume_analyzer_tooltip__';
    tooltip.style.cssText = `
      position: fixed;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(26, 86, 219, 0.95);
      color: white;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-family: -apple-system, sans-serif;
      z-index: 2147483647;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      max-width: 400px;
      text-align: center;
      pointer-events: none;
    `;
    tooltip.textContent = text;
    document.body.appendChild(tooltip);
  }

  function hideTooltip() {
    if (tooltip) {
      tooltip.remove();
      tooltip = null;
    }
  }

})();
