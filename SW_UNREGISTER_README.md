서비스 워커 / 캐시 강제 갱신 안내 (테스터/운영자용)
작성일: 2025-11-01

목적
- 이전 배포에서 캐시된 파일이나 서비스 워커가 남아 있어 구버전 UI(예: "Redirecting to sales-input (legacy)")가 보일 때 사용자가 직접 최신 파일을 적용하도록 돕습니다.

브라우저(크롬/엣지) GUI 방법
1. F12 로 개발자 도구 연다.
2. Application 탭 → 왼쪽 메뉴에서 "Service Workers" 클릭 → 각 서비스 워커 항목에서 "Unregister" 클릭.
3. Application → Clear storage → "Clear site data" 체크 후 "Clear site data" 클릭.
4. 새로고침(Shift+F5 또는 Ctrl+F5 권장).

콘솔 스니펫(한줄씩 붙여넣기)
```javascript
// 서비스 워커 등록 모두 해제
navigator.serviceWorker.getRegistrations()
  .then(regs => Promise.all(regs.map(r => r.unregister())))
  .then(() => console.log('ServiceWorkers unregistered'))
  .catch(e => console.error(e));

// Cache Storage 제거
caches.keys()
  .then(keys => Promise.all(keys.map(k => caches.delete(k))))
  .then(() => console.log('Cache Storage cleared'))
  .catch(e => console.error(e));

// 로컬 스토리지 / 세션 스토리지 초기화 (선택)
localStorage.clear();
sessionStorage.clear();
console.log('localStorage & sessionStorage cleared');
```

웹뷰 / 앱 내장 브라우저(테스트)
- 인앱 웹뷰는 앱의 웹 캐시나 서비스워커를 별도로 유지할 수 있습니다.
- 인앱 웹뷰가 문제면 앱의 캐시 초기화 기능 또는 앱 재시작/데이터 삭제를 권장합니다.
- 빠른 테스트를 위해 시크릿/인코그니토 창에서 접속해 최신 파일을 확인하세요.

비고
- 서버(호스팅) 측은 최신 파일로 배포된 상태입니다. 클라이언트 캐시만 갱신하면 사용자 화면에서 변경이 반영됩니다.
