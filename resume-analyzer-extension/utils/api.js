// utils/api.js - Google Gemini API integration

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_OUTPUT_TOKENS = 65536; // Gemini 2.5 Flash 최대값

/**
 * Build few-shot examples from historical analyses
 */
function buildFewShotExamples(history) {
  const labeled = history.filter(h => h.feedback === 'pass' || h.feedback === 'fail');
  if (labeled.length === 0) return '';

  const examples = labeled.slice(-3).map(h => {
    const label = h.feedback === 'pass' ? '합격' : '불합격';
    const excerpt = h.resumeText.slice(0, 300);
    return `[사례: ${label} / 예측확률: ${h.probability}%]\n${excerpt}\n---`;
  }).join('\n');

  return `\n\n## 과거 사례 (학습 데이터)\n${examples}`;
}

/**
 * Build analysis prompt — 응답을 최대한 간결하게 요청
 */
function buildPrompt(requirement, resumeText, history) {
  const fewShot = buildFewShotExamples(history);

  return `채용 담당자 관점에서 이력서를 평가하라. 반드시 JSON만 출력하라.${fewShot}

## JD (포지션: ${requirement.name})
${requirement.content}

## 이력서
${resumeText}

## 출력 형식 (JSON만, 설명 없이)
{
  "probability": 75,
  "summary": "2문장 이내 평가",
  "strengths": ["강점1", "강점2", "강점3"],
  "weaknesses": ["약점1", "약점2"],
  "keyMatches": [
    {"requirement": "항목명(15자이내)", "matched": true, "detail": "근거(20자이내)"}
  ],
  "recommendation": "지원 권고"
}

규칙:
- keyMatches는 핵심 항목 최대 5개만
- 모든 문자열은 간결하게
- JSON 외 다른 텍스트 금지`;
}

/**
 * Call Gemini API
 */
async function callGeminiAPI(apiKey, contents, modelOverride) {
  const model = modelOverride ||
    (typeof getModelName === 'function' ? await getModelName() : 'gemini-2.5-flash');
  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: MAX_OUTPUT_TOKENS
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

  const candidate = data.candidates[0];

  // 응답이 토큰 한도로 잘렸는지 체크
  if (candidate.finishReason === 'MAX_TOKENS') {
    throw new Error('응답이 너무 길어 잘렸습니다. 더 짧은 이력서로 시도하거나 JD를 간결하게 줄여보세요.');
  }

  const text = candidate.content?.parts?.[0]?.text ?? '';

  // 1) 직접 파싱
  try { return JSON.parse(text); } catch {}

  // 2) 마크다운 코드블록 제거
  const stripped = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(stripped); } catch {}

  // 3) 중괄호 블록 추출
  const match = stripped.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }

  throw new Error(`응답 파싱 실패. 모델 응답 (앞 500자):\n${text.slice(0, 500)}`);
}

/**
 * Analyze resume text
 */
async function analyzeResume(apiKey, requirement, resumeText) {
  const prompt = buildPrompt(requirement, resumeText, requirement.analysisHistory || []);
  return callGeminiAPI(apiKey, [{ parts: [{ text: prompt }] }]);
}

/**
 * Analyze resume from screenshot images
 */
async function analyzeResumeFromImage(apiKey, requirement, base64Images) {
  const fewShot = buildFewShotExamples(requirement.analysisHistory || []);
  const images = Array.isArray(base64Images) ? base64Images : [base64Images];

  const parts = [];

  images.forEach((img, i) => {
    if (images.length > 1) parts.push({ text: `[캡처 ${i + 1}/${images.length}]` });
    parts.push({ inlineData: { mimeType: 'image/png', data: img } });
  });

  parts.push({
    text: `이미지에서 이력서 내용을 읽고 아래 JD와 비교하라. 반드시 JSON만 출력하라.${fewShot}

## JD (포지션: ${requirement.name})
${requirement.content}

## 출력 형식 (JSON만)
{
  "extractedText": "이력서 전문",
  "probability": 75,
  "summary": "2문장 이내 평가",
  "strengths": ["강점1", "강점2", "강점3"],
  "weaknesses": ["약점1", "약점2"],
  "keyMatches": [
    {"requirement": "항목명(15자이내)", "matched": true, "detail": "근거(20자이내)"}
  ],
  "recommendation": "지원 권고"
}

규칙: keyMatches 최대 5개, JSON 외 텍스트 금지`
  });

  return callGeminiAPI(apiKey, [{ parts }]);
}

if (typeof module !== 'undefined') {
  module.exports = { analyzeResume, analyzeResumeFromImage };
}
