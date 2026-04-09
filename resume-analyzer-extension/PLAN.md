# Resume Analyzer Chrome Extension - 기획서

## 개요
채용 담당자 또는 구직자가 이력서를 보면서 채용 요구사항 대비 서류 합격 가능성을 실시간으로 분석하는 Chrome 확장 프로그램.

---

## 아키텍처

```
resume-analyzer-extension/
├── manifest.json              # Chrome Extension 설정 (Manifest V3)
├── popup/
│   ├── popup.html             # 팝업 UI
│   ├── popup.css              # 스타일
│   └── popup.js               # 팝업 로직 (메인 컨트롤러)
├── content/
│   ├── content.js             # 페이지 주입 스크립트 (텍스트 선택, 페이지 분석)
│   └── content.css            # 콘텐츠 스크립트 스타일
├── background/
│   └── service-worker.js      # 백그라운드 워커 (탭 캡처 등)
├── utils/
│   ├── storage.js             # chrome.storage.local 래퍼 (요구사항/이력 관리)
│   └── api.js                 # Claude API 호출 (텍스트/이미지 분석)
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## 주요 기능

### 1. 채용 요구사항 (JD) 관리

**데이터 구조:**
```json
{
  "id": "unique_id",
  "name": "카카오 백엔드 개발자",
  "content": "JD 전문...",
  "createdAt": "ISO timestamp",
  "updatedAt": "ISO timestamp",
  "analysisHistory": [
    {
      "id": "analysis_id",
      "resumeText": "분석된 이력서 텍스트",
      "probability": 75,
      "reasoning": "종합 평가",
      "strengths": ["강점1", "강점2"],
      "weaknesses": ["약점1"],
      "captureMethod": "capture | selection | paste",
      "feedback": "pending | pass | fail",
      "timestamp": "ISO timestamp"
    }
  ]
}
```

**UX 흐름:**
1. 드롭다운에서 기존 요구사항 선택 → 수정 폼 표시
2. "+ 새 요구사항 추가" 선택 → 신규 입력 폼 표시
3. 수정/삭제 가능, 삭제 시 분석 이력도 함께 삭제

---

### 2. 이력서 캡처/입력 방식 (3가지)

#### 방식 1: 화면 캡처 (추천)
- `chrome.tabs.captureVisibleTab()` API 활용
- **단일 캡처**: 현재 보이는 화면 캡처
- **스크롤 캡처**: 페이지 상단부터 하단까지 자동 스크롤하며 다중 캡처
  - `window.scrollTo()` + 300ms 대기 후 캡처 반복
  - Claude Vision API로 이미지 내 텍스트 직접 추출 및 분석

#### 방식 2: 텍스트 선택
- 페이지에서 원하는 텍스트를 마우스로 드래그 선택
- `window.getSelection().toString()` 으로 텍스트 추출
- Content script를 통해 팝업으로 전달
- **크롤링 차단 우회 가능** (렌더된 DOM 텍스트 직접 접근)

#### 방식 3: 직접 입력/붙여넣기
- 이력서 텍스트를 textarea에 직접 붙여넣기
- 가장 단순하고 확실한 방법

---

### 3. AI 분석 (Claude API)

**분석 프롬프트 설계:**
```
- 시스템 역할: 채용 담당자 관점의 이력서 평가 전문가
- 입력: JD + 이력서 텍스트/이미지 + 과거 합격/불합격 사례 (Few-shot)
- 출력 (JSON):
  - probability: 0~100 (서류 합격 예상 확률)
  - summary: 종합 평가 (2-3문장)
  - strengths: 강점 목록
  - weaknesses: 약점 목록
  - keyMatches: JD 요구사항별 충족 여부
  - recommendation: 지원 권고 | 지원 보류 | 지원 비권고
```

**모델 선택:** `claude-opus-4-6` (최신 최고 성능)

---

### 4. 학습 시스템 (Feedback Loop)

**설계 원칙: Few-Shot Learning**

분석 후 실제 합격/불합격 결과를 입력하면, 다음 분석 시 프롬프트에 과거 사례를 포함:

```
## 과거 분석 사례 (실제 결과 기반 학습 데이터)

[과거 사례 - 실제 결과: 합격]
이력서 내용 (일부): ...
확률 예측: 78%

[과거 사례 - 실제 결과: 불합격]
이력서 내용 (일부): ...
확률 예측: 45%
```

최근 5개 사례만 프롬프트에 포함 (토큰 절약).
저장은 `chrome.storage.local`에 로컬 보관.

---

### 5. 고도화 방안 (추가 제안)

#### A. Google Sheets 연동 (현재 NotebookLM 대체)
```
구조:
Google Drive
  └── resumes/
      ├── company_A_backend_pass_01.pdf
      └── company_A_backend_fail_01.pdf

Google Sheets: "resume_analysis_log"
  컬럼: 날짜 | 포지션 | 이력서파일 | 예측확률 | 실제결과 | 강점 | 약점 | 메모
```

**장점:**
- 여러 기기에서 공유 가능
- 데이터 누적으로 패턴 파악
- 나중에 Google Apps Script로 자동화 가능

**구현 방법:**
1. Google Sheets API + OAuth2 인증
2. 분석 후 자동으로 시트에 행 추가
3. 실제 결과(합격/불합격) 컬럼은 나중에 수동 업데이트

#### B. 분석 품질 고도화 방안

1. **JD 파싱 자동화**: JD URL 입력 → 자동으로 내용 가져오기 (크롤링 가능한 경우)

2. **멀티페이지 이력서 지원**: 스크롤 캡처로 여러 이미지 → Claude에 이미지 배열로 전달

3. **경쟁률 정보 포함**: 동일 포지션의 다른 이력서들과 상대적 비교

4. **항목별 점수화**:
   - 학력: 20점
   - 경력 년수: 25점
   - 기술 스택 매칭: 30점
   - 프로젝트/포트폴리오: 15점
   - 기타 우대사항: 10점

5. **개선 제안**: 약점 항목에 대한 구체적 개선 방법 제시

6. **유사 합격 이력서 패턴**: 동일 포지션 합격 이력서들의 공통 패턴 분석

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| Extension | Chrome Extension Manifest V3 |
| UI | Vanilla HTML/CSS/JS (의존성 최소화) |
| AI | Claude API (claude-opus-4-6) |
| Storage | chrome.storage.local |
| Capture | chrome.tabs.captureVisibleTab() |
| 향후 | Google Sheets API (선택적) |

---

## 설치 방법

1. `chrome://extensions/` 접속
2. "개발자 모드" 활성화
3. "압축 해제된 확장 프로그램 로드" 클릭
4. 이 폴더 선택
5. 확장 프로그램 아이콘 클릭 → ⚙️ 설정에서 Anthropic API 키 입력

---

## 사용 흐름

```
1. 채용공고(JD) 열기 → 확장 프로그램 팝업 → 요구사항 입력/선택
2. 이력서 페이지로 이동 → 팝업 유지
3. 캡처 방식 선택:
   - 화면 캡처: "현재 화면 캡처" 또는 "스크롤 캡처"
   - 텍스트: 드래그 선택 후 "텍스트 가져오기"
   - 붙여넣기: textarea에 직접 입력
4. "분석 시작" 클릭
5. 결과 확인 (확률, 강점/약점, 요구사항 매칭)
6. 서류 전형 결과 나오면 "합격/불합격" 버튼으로 피드백 입력
   → 다음 분석부터 학습 데이터로 활용
```
