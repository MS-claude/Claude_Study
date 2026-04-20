// utils/api.js - Google Gemini API integration

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_OUTPUT_TOKENS = 65536;

/**
 * 시트에서 불러온 후보자 목록으로 few-shot 예시 생성
 * @param {Array} candidates - fetchCandidates() 결과
 */
function buildFewShotExamples(candidates) {
  const labeled = (candidates || []).filter(c =>
    c.result && (c.result.includes('합격') || c.result.includes('불합격'))
  );
  if (labeled.length === 0) return '';

  const examples = labeled.slice(-3).map(c => {
    const outcome = c.result.startsWith('합격') ? '합격' : '불합격';
    let prob = '';
    try {
      const parsed = JSON.parse(c.analysis);
      prob = ` / 예측: ${parsed.probability}%`;
    } catch {}
    return `[결과: ${outcome}${prob}]\n주요경력: ${c.career.slice(0, 200)}\n---`;
  }).join('\n');

  return `\n\n## 동일 포지션 과거 사례 (학습용)\n${examples}`;
}

/**
 * 텍스트 분석 프롬프트
 */
function buildPrompt(position, resumeText, candidates) {
  const fewShot = buildFewShotExamples(candidates);
  const jdBlock = [position.jd, position.preference].filter(Boolean).join('\n\n[선호 조건]\n');

  return `채용 담당자 관점에서 이력서를 평가하라. 반드시 JSON만 출력하라.${fewShot}

## 포지션: ${position.positionName}
${jdBlock}

## 이력서
${resumeText}

## 출력 형식 (JSON만, 마크다운 없이)
{
  "careerSummary": "직전 포함 3개 이내 주요 경력 (예: A사 5년/백엔드, B사 3년/풀스택)",
  "probability": 75,
  "summary": "2문장 이내 종합 평가",
  "strengths": ["강점1", "강점2", "강점3"],
  "weaknesses": ["약점1", "약점2"],
  "keyMatches": [
    {"requirement": "항목(15자이내)", "matched": true, "detail": "근거(20자이내)"}
  ],
  "recommendation": "지원 권고"
}

규칙: keyMatches 최대 5개, JSON 외 출력 금지`;
}

/**
 * 이미지 분석 프롬프트 parts 생성
 */
function buildImageParts(position, base64Images, candidates) {
  const fewShot = buildFewShotExamples(candidates);
  const jdBlock = [position.jd, position.preference].filter(Boolean).join('\n\n[선호 조건]\n');
  const images = Array.isArray(base64Images) ? base64Images : [base64Images];

  const parts = [];
  images.forEach((img, i) => {
    if (images.length > 1) parts.push({ text: `[캡처 ${i + 1}/${images.length}]` });
    parts.push({ inlineData: { mimeType: 'image/png', data: img } });
  });

  parts.push({
    text: `이미지에서 이력서를 읽고 아래 포지션과 비교하라. 반드시 JSON만 출력하라.${fewShot}

## 포지션: ${position.positionName}
${jdBlock}

## 출력 형식 (JSON만)
{
  "careerSummary": "직전 포함 3개 이내 주요 경력",
  "extractedText": "이미지에서 추출한 이력서 전문",
  "probability": 75,
  "summary": "2문장 이내 종합 평가",
  "strengths": ["강점1", "강점2", "강점3"],
  "weaknesses": ["약점1", "약점2"],
  "keyMatches": [
    {"requirement": "항목(15자이내)", "matched": true, "detail": "근거(20자이내)"}
  ],
  "recommendation": "지원 권고"
}

규칙: keyMatches 최대 5개, JSON 외 출력 금지`
  });

  return parts;
}

/**
 * Gemini API 호출 (공통)
 */
async function callGeminiAPI(apiKey, contents, modelOverride) {
  const model = modelOverride ||
    (typeof getModelName === 'function' ? await getModelName() : 'gemini-2.5-flash');
  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: { temperature: 0.2, maxOutputTokens: MAX_OUTPUT_TOKENS }
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gemini API 오류: ${res.status}`);
  }

  const data = await res.json();

  if (!data.candidates?.length) {
    throw new Error('API 응답이 없습니다. 안전 필터에 의해 차단되었을 수 있습니다.');
  }

  const candidate = data.candidates[0];

  if (candidate.finishReason === 'MAX_TOKENS') {
    throw new Error('응답이 너무 길어 잘렸습니다. JD나 이력서를 줄여서 시도해보세요.');
  }

  const text = candidate.content?.parts?.[0]?.text ?? '';

  // 파싱 3단계
  try { return JSON.parse(text); } catch {}

  const stripped = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(stripped); } catch {}

  const match = stripped.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch {} }

  throw new Error(`응답 파싱 실패. 모델 응답 (앞 500자):\n${text.slice(0, 500)}`);
}

/**
 * 텍스트 이력서 분석
 * @param {string} apiKey
 * @param {Object} position - { positionName, jd, preference }
 * @param {string} resumeText
 * @param {Array} candidates - 동일 포지션 기존 후보자 (few-shot용)
 */
async function analyzeResume(apiKey, position, resumeText, candidates) {
  const prompt = buildPrompt(position, resumeText, candidates);
  return callGeminiAPI(apiKey, [{ parts: [{ text: prompt }] }]);
}

/**
 * 이미지 이력서 분석
 * @param {string} apiKey
 * @param {Object} position
 * @param {string|string[]} base64Images
 * @param {Array} candidates - few-shot용
 */
async function analyzeResumeFromImage(apiKey, position, base64Images, candidates) {
  const parts = buildImageParts(position, base64Images, candidates);
  return callGeminiAPI(apiKey, [{ parts }]);
}

if (typeof module !== 'undefined') {
  module.exports = { analyzeResume, analyzeResumeFromImage };
}
