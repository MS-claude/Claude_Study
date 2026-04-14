// utils/api.js - Google Gemini API integration

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Build few-shot examples from historical analyses
 */
function buildFewShotExamples(history) {
  const labeled = history.filter(h => h.feedback === 'pass' || h.feedback === 'fail');
  if (labeled.length === 0) return '';

  const examples = labeled.slice(-5).map(h => {
    const label = h.feedback === 'pass' ? '합격' : '불합격';
    const excerpt = h.resumeText.slice(0, 500);
    return `[과거 사례 - 실제 결과: ${label}]
이력서 내용 (일부): ${excerpt}
확률 예측: ${h.probability}%
---`;
  }).join('\n\n');

  return `\n\n## 과거 분석 사례 (실제 결과 기반 학습 데이터)\n${examples}`;
}

/**
 * Build analysis prompt
 */
function buildPrompt(requirement, resumeText, history) {
  const fewShot = buildFewShotExamples(history);

  return `당신은 채용 담당자 관점에서 이력서를 평가하는 전문가입니다.
아래의 채용 요구사항과 이력서를 분석하여 서류 합격 확률을 산출해주세요.${fewShot}

## 채용 요구사항 (JD)
포지션명: ${requirement.name}
${requirement.content}

## 분석할 이력서
${resumeText}

## 분석 지침
1. JD의 필수 요건, 우대 요건을 각각 파악하세요.
2. 이력서가 각 요건을 얼마나 충족하는지 평가하세요.
3. 과거 합격/불합격 사례가 있다면 그 패턴을 참고하세요.
4. 서류 전형 단계이므로 실제 직무 수행 능력보다 서류상 매칭도를 평가하세요.

## 응답 형식 (JSON으로만 응답, 다른 텍스트 없이)
{
  "probability": 75,
  "summary": "전체 평가 요약 (2-3문장)",
  "strengths": ["강점 1", "강점 2", "강점 3"],
  "weaknesses": ["약점 1", "약점 2"],
  "keyMatches": [
    {"requirement": "요구사항 항목", "matched": true, "detail": "이력서 내 근거"},
    {"requirement": "요구사항 항목", "matched": false, "detail": "미충족 이유"}
  ],
  "recommendation": "지원 권고"
}`;
}

/**
 * Call Gemini API with given contents
 * @param {string} apiKey
 * @param {Array} contents
 * @param {number} maxTokens
 * @param {string} [modelOverride] - optional model name override
 */
async function callGeminiAPI(apiKey, contents, maxTokens = 4096, modelOverride) {
  const model = modelOverride || (typeof getModelName === 'function' ? await getModelName() : 'gemini-2.5-flash');
  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: maxTokens,
        responseMimeType: 'application/json'
      }
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Gemini API 오류: ${response.status}`);
  }

  const data = await response.json();

  if (!data.candidates || data.candidates.length === 0) {
    throw new Error('API 응답이 없습니다. 안전 필터에 의해 차단되었을 수 있습니다.');
  }

  const text = data.candidates[0].content.parts[0].text;

  // 1) 직접 파싱 시도 (responseMimeType: application/json 효과)
  try { return JSON.parse(text); } catch {}

  // 2) 마크다운 코드블록 제거 후 파싱 (```json ... ```)
  const stripped = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(stripped); } catch {}

  // 3) 중괄호 블록 추출 후 파싱
  const jsonMatch = stripped.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]); } catch {}
  }

  throw new Error(`응답 파싱 실패. 모델 응답:\n${text.slice(0, 300)}`);
}

/**
 * Analyze resume text against job requirements
 * @param {string} apiKey - Google AI API key
 * @param {Object} requirement - { name, content, analysisHistory }
 * @param {string} resumeText
 * @returns {Promise<Object>}
 */
async function analyzeResume(apiKey, requirement, resumeText) {
  const prompt = buildPrompt(requirement, resumeText, requirement.analysisHistory || []);

  return callGeminiAPI(apiKey, [
    { parts: [{ text: prompt }] }
  ]);
}

/**
 * Analyze resume from screenshot images using Gemini Vision
 * @param {string} apiKey
 * @param {Object} requirement
 * @param {string|string[]} base64Images - single or array of base64 PNG images
 * @returns {Promise<Object>}
 */
async function analyzeResumeFromImage(apiKey, requirement, base64Images) {
  const fewShot = buildFewShotExamples(requirement.analysisHistory || []);
  const images = Array.isArray(base64Images) ? base64Images : [base64Images];

  const parts = [];

  // Add all captured images
  images.forEach((img, i) => {
    if (images.length > 1) {
      parts.push({ text: `[화면 캡처 ${i + 1}/${images.length}]` });
    }
    parts.push({
      inlineData: {
        mimeType: 'image/png',
        data: img
      }
    });
  });

  // Add analysis prompt
  parts.push({
    text: `당신은 채용 담당자 관점에서 이력서를 평가하는 전문가입니다.
위 이미지(들)에서 이력서 내용을 추출하고, 아래 채용 요구사항과 비교하여 서류 합격 확률을 산출해주세요.${fewShot}

## 채용 요구사항 (JD)
포지션명: ${requirement.name}
${requirement.content}

## 분석 지침
1. 이미지에서 이력서 텍스트를 최대한 정확히 읽어내세요.
2. JD의 필수/우대 요건과 이력서의 매칭도를 평가하세요.
3. 여러 이미지가 있다면 순서대로 이어지는 이력서로 간주하세요.

## 응답 형식 (JSON으로만 응답)
{
  "extractedText": "이미지에서 추출한 이력서 전문",
  "probability": 75,
  "summary": "전체 평가 요약 (2-3문장)",
  "strengths": ["강점 1", "강점 2"],
  "weaknesses": ["약점 1"],
  "keyMatches": [
    {"requirement": "요구사항", "matched": true, "detail": "근거"}
  ],
  "recommendation": "지원 권고"
}`
  });

  return callGeminiAPI(apiKey, [{ parts }], 8192);
}

if (typeof module !== 'undefined') {
  module.exports = { analyzeResume, analyzeResumeFromImage };
}
