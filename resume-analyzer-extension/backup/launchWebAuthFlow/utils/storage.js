// utils/storage.js - Local settings

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

async function getClientId() {
  return new Promise(resolve =>
    chrome.storage.local.get('clientId', r => resolve(r.clientId || null))
  );
}

async function saveClientId(id) {
  return new Promise(resolve =>
    chrome.storage.local.set({ clientId: id }, resolve)
  );
}

async function getClientSecret() {
  return new Promise(resolve =>
    chrome.storage.local.get('clientSecret', r => resolve(r.clientSecret || null))
  );
}

async function saveClientSecret(secret) {
  return new Promise(resolve =>
    chrome.storage.local.set({ clientSecret: secret }, resolve)
  );
}

async function getSpreadsheetId() {
  return new Promise(resolve =>
    chrome.storage.local.get('spreadsheetId', r => resolve(r.spreadsheetId || null))
  );
}

async function saveSpreadsheetId(id) {
  return new Promise(resolve =>
    chrome.storage.local.set({ spreadsheetId: id }, resolve)
  );
}

if (typeof module !== 'undefined') {
  module.exports = {
    getApiKey, saveApiKey, getModelName, saveModelName,
    getClientId, saveClientId, getClientSecret, saveClientSecret,
    getSpreadsheetId, saveSpreadsheetId
  };
}
