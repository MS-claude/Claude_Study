// Claude API integration for resume analysis

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-opus-4-6';

/**
 * Build few-shot examples from historical analyses
 * @param {Array} history - analysisHistory array from a requirement
 * @returns {string}
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
 * Build the analysis prompt
 * @param {Object} requirement - { name, content }
 * @param {string} resumeText
 * @param {Array} history
 * @returns {string}
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

## 응답 형식 (JSON으로만 응답)
{
  "probability": 75,
  "summary": "전체 평가 요약 (2-3문장)",
  "strengths": [
    "강점 1",
    "강점 2",
    "강점 3"
  ],
  "weaknesses": [
    "약점 1",
    "약점 2"
  ],
  "keyMatches": [
    {"requirement": "요구사항 항목", "matched": true, "detail": "이력서 내 근거"},
    {"requirement": "요구사항 항목", "matched": false, "detail": "미충족 이유"}
  ],
  "recommendation": "지원 권고 | 지원 보류 | 지원 비권고"
}`;
}

/**
 * Analyze resume against job requirements using Claude API
 * @param {string} apiKey
 * @param {Object} requirement - { name, content, analysisHistory }
 * @param {string} resumeText
 * @returns {Promise<Object>} analysis result
 */
async function analyzeResume(apiKey, requirement, resumeText) {
  const prompt = buildPrompt(requirement, resumeText, requirement.analysisHistory || []);

  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || `API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.content[0].text;

  // Parse JSON response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Invalid API response format');

  return JSON.parse(jsonMatch[0]);
}

/**
 * Analyze resume from image using Claude Vision API
 * @param {string} apiKey
 * @param {Object} requirement
 * @param {string} base64Image - base64 encoded screenshot
 * @returns {Promise<Object>}
 */
async function analyzeResumeFromImage(apiKey, requirement, base64Image) {
  const fewShot = buildFewShotExamples(requirement.analysisHistory || []);

  const textPrompt = `당신은 채용 담당자 관점에서 이력서를 평가하는 전문가입니다.
첨부된 이미지에서 이력서 내용을 추출하고, 아래 채용 요구사항과 비교하여 서류 합격 확률을 산출해주세요.${fewShot}

## 채용 요구사항 (JD)
포지션명: ${requirement.name}
${requirement.content}

## 분석 지침
1. 이미지에서 이력서 텍스트를 최대한 정확히 읽어내세요.
2. JD의 필수/우대 요건과 이력서의 매칭도를 평가하세요.
3. 과거 합격/불합격 사례 패턴을 참고하세요.

## 응답 형식 (JSON으로만 응답)
{
  "extractedText": "이미지에서 추출한 이력서 전문",
  "probability": 75,
  "summary": "전체 평가 요약 (2-3문장)",
  "strengths": ["강점 1", "강점 2", "강점 3"],
  "weaknesses": ["약점 1", "약점 2"],
  "keyMatches": [
    {"requirement": "요구사항", "matched": true, "detail": "근거"}
  ],
  "recommendation": "지원 권고 | 지원 보류 | 지원 비권고"
}`;

  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: base64Image
              }
            },
            {
              type: 'text',
              text: textPrompt
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || `API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.content[0].text;

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Invalid API response format');

  return JSON.parse(jsonMatch[0]);
}

if (typeof module !== 'undefined') {
  module.exports = { analyzeResume, analyzeResumeFromImage };
}
