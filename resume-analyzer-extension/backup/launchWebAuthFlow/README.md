# 롤백 방법 (launchWebAuthFlow 방식으로 복원)

이 폴더는 OAuth2 `chrome.identity.launchWebAuthFlow` 방식의 백업입니다.
현재 확장 프로그램은 `chrome.identity.getAuthToken()` 방식을 사용합니다.

## 복원 절차

아래 파일들을 각 위치로 복사하세요:

```
backup/launchWebAuthFlow/utils/auth.js      → utils/auth.js
backup/launchWebAuthFlow/utils/storage.js   → utils/storage.js
backup/launchWebAuthFlow/manifest.json      → manifest.json
backup/launchWebAuthFlow/popup/popup.html   → popup/popup.html
backup/launchWebAuthFlow/popup/popup.js     → popup/popup.js
```

## launchWebAuthFlow 방식의 특징

- OAuth2 Client ID 타입: **웹 애플리케이션**
- Redirect URI를 Google Cloud Console에 등록 필요
  - URI 형식: `https://<EXTENSION_ID>.chromiumapp.org/`
- Client ID, Client Secret을 확장 프로그램 설정 UI에서 입력
- 사용자 동의 화면(consent screen)을 별도 팝업으로 표시
