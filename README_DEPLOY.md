
# 배포 가이드 — CMASS-SALES (Firebase Hosting)

로컬에서 또는 GitHub Actions를 통해 `public/` 디렉터리를 Firebase Hosting으로 배포하는 방법입니다.

사전 준비
- Node.js 및 npm 설치
- Firebase CLI 설치 (로컬 배포용):

```powershell
npm install -g firebase-tools
```

로컬 배포
1. Firebase 로그인 (브라우저가 열립니다):

```powershell
firebase login
```

2. (한번만) 프로젝트 연결(선택):

```powershell
firebase use --add
# 또는 .firebaserc에 프로젝트 id가 이미 적혀 있으므로 이 단계는 건너뛸 수 있습니다.
```

3. 배포:

```powershell
firebase deploy --only hosting --project cmass-sales
```

CI(자동 배포) — GitHub Actions
1. CI용 토큰 생성 (로컬에서 실행):

```powershell
firebase login:ci
# 출력된 긴 문자열을 복사하세요.
```

2. GitHub 레포지토리 → Settings → Secrets and variables → Actions → New repository secret
- Name: `FIREBASE_TOKEN`
- Value: (위에서 복사한 토큰 문자열)

3. 워크플로우는 `main`, `master`, `pr/draft-restore-clean` 브랜치에 푸시될 때 자동으로 실행됩니다.

참고
- 호스팅 리다이렉트/rewrites는 `firebase.json`에 설정되어 있으며, 모든 요청을 `/front.html`로 보냅니다.
- 배포 후 Firebase 콘솔 또는 작업 로그에서 배포 URL을 확인하세요 (예: `https://cmass-sales.web.app`).

문제가 발생하면 배포 로그(로컬의 경우 터미널 출력, CI는 Actions 로그)를 공유해 주세요. 제가 로그를 보고 추가 조치를 도와드리겠습니다.
Firebase Hosting 배포 안내

빠르게 배포하려면 아래 단계를 따라주세요 (PowerShell / pwsh 기준).

1) Firebase CLI 설치 (없다면):

```powershell
npm install -g firebase-tools
```

2) Firebase 로그인 (브라우저 창이 열립니다):

```powershell
firebase login
```

3) 프로젝트 연결: (한 번만 실행)

```powershell
# 기존 Firebase 프로젝트가 있으면 아래로 선택하거나 ID를 입력하세요
firebase use --add
# 또는 .firebaserc 파일의 default 값을 직접 YOUR_FIREBASE_PROJECT_ID 로 바꿔도 됩니다.
```

4) 실제 배포:

```powershell
firebase deploy --only hosting
```

CI/GitHub 액션 배포를 사용하려면 아래 파일 `.github/workflows/firebase-hosting.yml`을 참조하고
`Settings -> Secrets`에 `FIREBASE_TOKEN`(또는 서비스계정 JSON)을 추가하세요.

주의: 이 저장소에는 `firebase.json` 템플릿이 포함되어 있습니다. 실제 배포 전에
`.firebaserc`의 프로젝트 ID를 채우거나 `firebase use --add`로 연결하세요.
Firebase deploy helper

Steps to deploy locally:

1. Install firebase CLI (or use npx):

```powershell
npm install -g firebase-tools
# or use npx (no global install required)
```

2. Login interactively:

```powershell
npx firebase-tools login
# or if installed globally
firebase login
```

3. Deploy hosting from repo root:

```powershell
# interactive
.\tools\deploy_firebase.ps1
# or non-interactive using a token
#$env:FIREBASE_TOKEN = '<token-from-firebase-login:ci>'
.\tools\deploy_firebase.ps1 -UseToken
```

CI (GitHub Actions):

- Create a token with `npx firebase-tools login:ci` and add it to GitHub repo secrets as `FIREBASE_TOKEN`.
- Push to `main` to trigger `.github/workflows/firebase-deploy.yml`.

Notes:
- The default project id in `.firebaserc` is `cmass-sales`. Change it if you use a different Firebase project.
- The hosting `public` folder is set to `public/` and rewrites are added to serve `input.html` as the SPA entry.Firebase Hosting deploy instructions
=================================

This repository hosts a static site under `public/` and can be deployed to Firebase Hosting.

Files added by the automation:
- `firebase.json` - hosting configuration (serves `public/` and rewrites all routes to `/input.html`).
- `.firebaserc` - default Firebase project id (`cmass-sales`).
- `tools/deploy_firebase.ps1` - PowerShell helper to deploy from the repo root (prefers global `firebase` CLI, falls back to `npx`).
- `.github/workflows/firebase-deploy.yml` - GitHub Actions workflow that deploys on push to `main` using a `FIREBASE_TOKEN` secret.

Local deploy (PowerShell)
-------------------------
1. Install Firebase CLI (one-time):

```powershell
npm install -g firebase-tools
# or use: npx firebase-tools --version
```

2. Login to Firebase from your machine:

```powershell
firebase login
```

3. From the repo root run the helper script:

```powershell
.\tools\deploy_firebase.ps1
```

This will run `firebase deploy --only hosting` for the project configured in `.firebaserc` (default `cmass-sales`).

CI (GitHub Actions)
-------------------
1. Create a token for CI deploys. On a machine with access to the Firebase project run:

```bash
firebase login:ci
# copy the printed token
```

2. In your GitHub repository settings > Secrets > Actions create a secret named `FIREBASE_TOKEN` with the token value.

3. Push to the `main` branch. The workflow will run and deploy `public/` to Firebase Hosting using the token.

Security note
-------------
- Do NOT commit service account JSON files to the repo. Use `firebase login:ci` token or GitHub Secrets to authenticate.
- Ensure the token you create has the appropriate permissions for the `cmass-sales` Hosting site.

If you want me to also add a `package.json` with a `deploy` npm script (or change the hosting rewrite to `/index.html`), tell me and I can add it.
Firebase Hosting / CI Deploy quick guide

This project is a static site under `public/`. The repository includes a minimal `firebase.json` and a GitHub Actions workflow to deploy to Firebase Hosting.

Two deployment options are provided below. Pick one and follow the steps.

Option A — Deploy from GitHub Actions (recommended)
- Create a Firebase service account with the "Firebase Hosting Admin" role (or project Owner).
- Generate a service account JSON key. In the repository's GitHub Settings → Secrets, add a secret named `FIREBASE_SERVICE_ACCOUNT` and paste the entire JSON contents as the secret value (no additional encoding required).
- Set the workflow `projectId` in `.github/workflows/firebase-hosting-deploy.yml` to your Firebase project id (replace `YOUR_FIREBASE_PROJECT_ID`).
- Push to `main`/`master` to trigger the workflow.

Option B — Deploy from your machine (quick)
- Install Firebase CLI: `npm install -g firebase-tools`.
- Login and get a CI token: `firebase login:ci` (copy the printed token) — or just login and deploy interactively.
- To deploy interactively:
  - `firebase init hosting` (select `public` as the public directory if prompted)
  - `firebase deploy --only hosting`
- To deploy non-interactively with a token (legacy):
  - Set environment variable `FIREBASE_TOKEN` to the token from `firebase login:ci`.
  - Run: `firebase deploy --only hosting`.

Notes
- The `firebase.json` provided is minimal and serves files from `public/`.
- If you prefer Netlify or Vercel, I can add a deploy configuration for those services instead.
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
