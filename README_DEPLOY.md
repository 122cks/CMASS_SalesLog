# 배포(Hosting) 가이드 — 간단하고 안전한 단계

이 파일은 최소한의 작업으로 Firebase Hosting에 배포하는 방법을 단계별(한국어)로 안내합니다. 제가 리포지토리에 작업해둔 항목:

- `.github/workflows/firebase-hosting-deploy.yml` : GitHub Actions 워크플로우 (push to main 또는 수동 실행으로 배포)
- `deploy.ps1` : 로컬 PowerShell에서 토큰으로 배포할 수 있는 간단 스크립트

사용자가 해야 할 최소 단계 (순서대로)

1) CI 토큰 준비

 - 로컬 터미널(Windows PowerShell)에서:
```powershell
firebase login:ci
```
 - 브라우저에서 'Firebase CLI Login Successful' 화면이 뜨면, 터미널에 출력된 한 줄짜리 토큰(`1//...`)을 복사하세요.

2) (권장) GitHub에 시크릿 추가 — 자동 배포용

 - 리포지토리 → Settings → Secrets and variables → Actions → New repository secret
 - Name: `FIREBASE_TOKEN`
 - Value: (1)에서 복사한 토큰 전체 붙여넣기
 - 저장

설명: 워크플로우는 `${{ secrets.FIREBASE_TOKEN }}` 을 사용해 배포합니다. 토큰이 노출되었다면 아래 '토큰 교체/폐기' 섹션을 참고하세요.

3) 워크플로우 실행 방식 (선택)

 - 자동: `main` 브랜치로 푸시하면 자동으로 배포됩니다.
 - 수동: GitHub Actions에서 해당 워크플로우를 선택해 `Run workflow` 버튼으로 수동 실행할 수 있습니다.

4) 로컬에서 바로 배포하기 (토큰 사용)

 - PowerShell에서(권장: 환경변수 방식)
```powershell
$env:FIREBASE_TOKEN = 'PASTE_YOUR_TOKEN_HERE'
.\deploy.ps1
```

 - 또는 직접 인수로 전달
```powershell
.\deploy.ps1 -Token 'PASTE_YOUR_TOKEN_HERE'
```

5) firebase.json이 없는 경우

 - 만약 리포지토리에 `firebase.json`이 없다면 로컬에서 아래를 실행해 호스팅 설정을 초기화하세요.
```powershell
firebase init hosting
```
 - public 디렉터리는 `public`으로 설정(현재 앱이 `public/input.html`에 있으므로). 기존 파일을 덮어쓰지 않도록 주의하세요.

6) (선택) 노출된 토큰 폐기 및 토큰 교체 — 권장

 - 만약 토큰을 공개적으로 붙여넣었거나 노출되었다면 안전을 위해 기존 토큰을 더 이상 사용하지 마세요.
 - 새 토큰 발급: `firebase login:ci` 다시 실행 → 새 토큰을 GitHub Secrets에 덮어쓰기

7) 배포 후 검증 (간단)

 - 배포된 URL을 엽니다 (Actions 로그 또는 `firebase deploy` 출력에 표시됨).
 - 브라우저에서 DevTools (F12) → Console 탭을 엽니다.
 - 학교 선택(예: `경기영상과학고등학교`)을 한 뒤 콘솔에서 `[Mapping]`으로 시작하는 로그가 한 번만 찍히는지 확인하세요.
 - 인라인 학교 정보(총학생수 등)가 CSV의 값(예: 27 학급 / 591 학생)과 일치하는지 확인합니다.

문제가 생기면 아래 정보를 알려주세요

- Actions 로그(오류가 있다면 해당 단계 로그 캡처 텍스트)
- 터미널에서 `firebase deploy` 실행 시 출력된 에러 메시지

안전 주의사항

- 토큰은 패스워드처럼 취급하세요. 절대로 공개 채팅/이슈/커밋 메시지에 넣지 마세요.
- GitHub 시크릿은 암호화되어 저장되므로 워크플로우에서만 참조하도록 하세요.

---
작성자: 자동 생성된 배포 헬퍼 및 안내
