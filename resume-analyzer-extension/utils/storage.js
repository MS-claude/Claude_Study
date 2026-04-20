// utils/storage.js - Local settings only (JD data now lives in Google Sheets)

async function getApiKey() {
  return new Promise(resolve =>
    chrome.storage.local.get('apiKey', r => resolve(r.apiKey || null))
  );
}

async function saveApiKey(key) {
  return new Promise(resolve =>
    chrome.storage.local.set({ apiKey: key }, resolve)
  );
}

async function getModelName() {
  return new Promise(resolve =>
    chrome.storage.local.get('modelName', r => resolve(r.modelName || 'gemini-2.5-flash'))
  );
}

async function saveModelName(name) {
  return new Promise(resolve =>
    chrome.storage.local.set({ modelName: name }, resolve)
  );
}

if (typeof module !== 'undefined') {
  module.exports = { getApiKey, saveApiKey, getModelName, saveModelName };
}
