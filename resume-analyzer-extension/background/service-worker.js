// background/service-worker.js

// Open side panel when extension icon is clicked
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error);

// Handle messages
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Tab capture request from side panel
  if (msg.type === 'CAPTURE_TAB') {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ dataUrl });
      }
    });
    return true; // async
  }

  // Close side panel request
  if (msg.type === 'CLOSE_SIDE_PANEL') {
    chrome.windows.getCurrent((win) => {
      chrome.sidePanel.setOptions({ enabled: false, tabId: sender.tab?.id });
      // Re-enable for future use
      setTimeout(() => {
        chrome.sidePanel.setOptions({ enabled: true });
      }, 500);
    });
    return true;
  }
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Resume Analyzer installed');
  }
});
