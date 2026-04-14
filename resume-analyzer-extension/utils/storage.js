// Storage utility for managing requirements and analysis history

const STORAGE_KEYS = {
  REQUIREMENTS: 'requirements',
  API_KEY: 'apiKey',
  MODEL_NAME: 'modelName',
  SETTINGS: 'settings'
};

const DEFAULT_MODEL = 'gemini-2.5-flash';

/**
 * Get all saved requirements
 * @returns {Promise<Array>}
 */
async function getRequirements() {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEYS.REQUIREMENTS, (result) => {
      resolve(result[STORAGE_KEYS.REQUIREMENTS] || []);
    });
  });
}

/**
 * Save a new requirement
 * @param {Object} requirement - { name, content }
 * @returns {Promise<Object>} saved requirement with id
 */
async function saveRequirement(requirement) {
  const requirements = await getRequirements();
  const newReq = {
    id: generateId(),
    name: requirement.name,
    content: requirement.content,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    analysisHistory: []
  };
  requirements.push(newReq);
  await setRequirements(requirements);
  return newReq;
}

/**
 * Update an existing requirement
 * @param {string} id
 * @param {Object} updates - { name?, content? }
 * @returns {Promise<Object>}
 */
async function updateRequirement(id, updates) {
  const requirements = await getRequirements();
  const index = requirements.findIndex(r => r.id === id);
  if (index === -1) throw new Error('Requirement not found');
  requirements[index] = {
    ...requirements[index],
    ...updates,
    updatedAt: new Date().toISOString()
  };
  await setRequirements(requirements);
  return requirements[index];
}

/**
 * Delete a requirement
 * @param {string} id
 */
async function deleteRequirement(id) {
  const requirements = await getRequirements();
  const filtered = requirements.filter(r => r.id !== id);
  await setRequirements(filtered);
}

/**
 * Add analysis result to a requirement's history
 * @param {string} requirementId
 * @param {Object} analysis - { resumeText, probability, reasoning, captureMethod }
 * @returns {Promise<Object>} saved analysis
 */
async function addAnalysisResult(requirementId, analysis) {
  const requirements = await getRequirements();
  const index = requirements.findIndex(r => r.id === requirementId);
  if (index === -1) throw new Error('Requirement not found');

  const newAnalysis = {
    id: generateId(),
    resumeText: analysis.resumeText,
    probability: analysis.probability,
    reasoning: analysis.reasoning,
    strengths: analysis.strengths || [],
    weaknesses: analysis.weaknesses || [],
    captureMethod: analysis.captureMethod || 'selection',
    feedback: 'pending', // 'pending' | 'pass' | 'fail'
    timestamp: new Date().toISOString()
  };

  requirements[index].analysisHistory.push(newAnalysis);
  requirements[index].updatedAt = new Date().toISOString();
  await setRequirements(requirements);
  return { requirement: requirements[index], analysis: newAnalysis };
}

/**
 * Update feedback for an analysis result (pass/fail)
 * @param {string} requirementId
 * @param {string} analysisId
 * @param {string} feedback - 'pass' | 'fail'
 */
async function updateAnalysisFeedback(requirementId, analysisId, feedback) {
  const requirements = await getRequirements();
  const reqIndex = requirements.findIndex(r => r.id === requirementId);
  if (reqIndex === -1) throw new Error('Requirement not found');

  const analysisIndex = requirements[reqIndex].analysisHistory.findIndex(
    a => a.id === analysisId
  );
  if (analysisIndex === -1) throw new Error('Analysis not found');

  requirements[reqIndex].analysisHistory[analysisIndex].feedback = feedback;
  requirements[reqIndex].updatedAt = new Date().toISOString();
  await setRequirements(requirements);
}

/**
 * Get API key
 * @returns {Promise<string|null>}
 */
async function getApiKey() {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEYS.API_KEY, (result) => {
      resolve(result[STORAGE_KEYS.API_KEY] || null);
    });
  });
}

/**
 * Save API key
 * @param {string} key
 */
async function saveApiKey(key) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEYS.API_KEY]: key }, resolve);
  });
}

/**
 * Get saved model name (falls back to DEFAULT_MODEL)
 * @returns {Promise<string>}
 */
async function getModelName() {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEYS.MODEL_NAME, (result) => {
      resolve(result[STORAGE_KEYS.MODEL_NAME] || DEFAULT_MODEL);
    });
  });
}

/**
 * Save model name
 * @param {string} name
 */
async function saveModelName(name) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEYS.MODEL_NAME]: name }, resolve);
  });
}

// Internal helpers
async function setRequirements(requirements) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEYS.REQUIREMENTS]: requirements }, resolve);
  });
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

// Export for use in other scripts
if (typeof module !== 'undefined') {
  module.exports = {
    getRequirements,
    saveRequirement,
    updateRequirement,
    deleteRequirement,
    addAnalysisResult,
    updateAnalysisFeedback,
    getApiKey,
    saveApiKey,
    getModelName,
    saveModelName
  };
}
