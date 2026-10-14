# [001] 레포 골격: 허브 홈, 배정 페이지 이관, 테스트 러너, CI

- 브랜치: `codex/001-scaffold`
- 의존: 없음
- 예상 규모: M

## 배경
현재 저장소는 배정표 단일 페이지(`index.html`)입니다. 앞으로 투표·매칭·장부 등 7개 페이지가 추가되므로
(`docs/PLAN.md` §2) 공용 구조를 먼저 잡습니다. 기존 배정 기능은 URL만 바뀌고 동작은 그대로여야 합니다.

## 목표
- `index.html`이 허브 홈(내비게이션 + 준비 중 위젯)이 되고, 기존 배정 화면은 `rotation.html`로 이동한다.
- `npm test`로 `node:test` 기반 테스트가 돌고, PR마다 GitHub Actions가 테스트를 실행한다.
- 모든 페이지가 공유하는 `js/config.js`, `js/ui.js`, 내비게이션, 스타일이 생긴다.

## 변경 파일
- `index.html` — 허브 홈으로 교체 (아래 5번)
- (신규) `rotation.html` — 현재 `index.html`의 내용을 그대로 이관 + 공용 내비 적용
- `rotation.js` → `js/rotation.js`로 이동 (`git mv`). 내용 변경 없음. 참조 경로 갱신: `rotation.html`, `tests.html`, 테스트
- `test.js` → (신규) `test/rotation.test.js`로 변환 후 루트 `test.js` 삭제 (아래 3번)
- (신규) `package.json`
- (신규) `.github/workflows/test.yml`
- (신규) `js/config.js`, `js/ui.js`
- `styles.css` — 내비·카드 공용 스타일 추가
- `members-admin.html` — `rotation.html`로 돌아가는 링크 경로만 수정, 공용 내비 적용
- `tests.html` — `js/rotation.js` 경로만 수정
- `README.md` — "파일 구성", "테스트" 절을 새 구조로 갱신
- `.gitignore` — `node_modules/` 추가

## 변경 금지
- `js/rotation.js`의 알고리즘 로직 (이동만, 한 줄도 수정 금지)
- `members.json`
- `CHANGELOG.md` (릴리스 시 Claude가 갱신)

## 상세 요구사항
1. **package.json**: `"name": "exican-hub"`, `"private": true`, `"scripts": { "test": "node --test test/" }`, `"engines": { "node": ">=20" }`. dependencies 없음. `"type"` 필드는 넣지 않음(CommonJS 유지).
2. **test.yml**: `on: [pull_request, push(main)]`, `actions/checkout@v4`, `actions/setup-node@v4`(node 20), `npm test`. 캐시 불필요.
3. **테스트 변환**: `test.js`의 91개 어서션을 `test/rotation.test.js`에서 `node:test`의 `describe`/`test`와 `node:assert/strict`로 동일하게 재현한다. 케이스 그룹(`[basic]`, `[dynamic]`, `[error]`, `[format]`)과 임계값을 바꾸지 않는다. `require("../js/rotation.js")`. 실행 결과 pass 수가 91 이상이어야 한다.
4. **js/config.js**: 전역 `window.EXICAN_CONFIG` (Node에서는 `module.exports`)로 다음을 제공:
   ```js
   {
     SUPABASE_URL: "",            // 002 이후 Claude가 채움
     SUPABASE_ANON_KEY: "",
     TEAM_EMAIL: "team@fcexican.local",
     ADMIN_EMAIL: "admin@fcexican.local",
     FINES: { LATE_VOTE: 5000, NO_SHOW: 10000, LATE: 10000, LATE_KICKOFF: 30000 },
     DUES_MONTHLY: 30000,
     INJURY_EXEMPT_RATE: 0.5,
     PRESIDENT_EXEMPT_MODE: "week",   // "week" | "month"
     CAFE: {
       CLUB_ID: 11367414,
       MENUS: { 623: "성남/하남", 625: "서울북동", 627: "서울남동", 922: "남양주/구리" },
       ARTICLE_URL: (articleId, menuId) => `https://cafe.naver.com/f-e/cafes/11367414/articles/${articleId}?menuid=${menuId}`
     },
     PREFERRED_START_HOURS: [8, 7, 9, 10]   // 우선순위 순
   }
   ```
5. **index.html (허브 홈)**: 제목 "⚽ FC EXICAN 운영 허브". 공용 내비 아래에 카드 4개를 세로로 배치: "이번 주 투표", "매칭 후보", "확정 매치", "장부 요약". 각 카드는 "준비 중" 문구와 해당 페이지 링크. 하단에 "배정표 만들기" 큰 버튼(`rotation.html`). 데이터 호출 없음.
6. **공용 내비 `js/ui.js`**: `renderNav(activeKey)` — `<nav class="topnav">`를 `body` 맨 앞에 삽입. 항목: 홈(`index.html`), 투표(`vote.html`), 매칭(`matches.html`), 배정표(`rotation.html`), 장부(`ledger.html`), 회칙(`rules.html`), 관리(`admin.html`). 존재하지 않는 페이지도 링크는 둔다. 모바일에서 가로 스크롤되는 한 줄 탭 바. 또한 `showToast(msg)`, `escapeHtml(str)`, `formatWon(n)`(예: `30,000원`) 를 export. 기존 `index.html`·`members-admin.html`의 `showToast`는 `ui.js` 것으로 교체.
7. **rotation.html**: 기존 `index.html`과 기능·문구 동일. `<script src="js/rotation.js?v=4">` 로 경로·버전 갱신. 상단 내비 `renderNav("rotation")`.
8. **styles.css**: `.topnav`, `.card`, `.hub-grid` 스타일 추가. 기존 셀렉터는 변경하지 않음.
9. 페이지 공통 `<head>`: `<meta name="viewport" content="width=device-width, initial-scale=1">`, `lang="ko"`.

## 수용 기준
- [ ] `npm test` 통과, 출력에 `pass 91` 이상 (`fail 0`)
- [ ] `.github/workflows/test.yml`이 PR에서 실행된다 (PR 체크에 표시)
- [ ] `rotation.html`에서 참가자 7명 선택 → 5v5 → 배정표 생성 → 카톡 복사가 이전과 동일하게 동작
- [ ] `members-admin.html`에서 "← 배정 화면으로" 링크가 `rotation.html`로 이동
- [ ] `tests.html`이 브라우저에서 에러 없이 로드되고 기존 테스트 결과를 표시
- [ ] `index.html`이 내비 + 카드 4개 + 배정표 버튼을 보여주고 콘솔 에러가 없다
- [ ] 375px 폭에서 내비가 한 줄 탭으로 스크롤되고 페이지 가로 스크롤이 없다
- [ ] `js/config.js`가 브라우저(`window.EXICAN_CONFIG`)와 Node(`require`) 양쪽에서 로드된다 (테스트 1개 추가: `test/config.test.js`에서 키 존재 확인)
- [ ] `git diff --stat`에서 `js/rotation.js`는 rename 100%로 표시된다

## 테스트 방법
- 자동: `npm test`
- 수동: `python -m http.server 8765` 후 `http://localhost:8765/` (홈), `/rotation.html`, `/members-admin.html`, `/tests.html` 순서로 확인. 브라우저 개발자도구 → 기기 모드 375px.

## 참고
- 기존 `index.html`의 `loadMembers`, `render`, `renderResult`는 그대로 `rotation.html`로 옮깁니다.
- `README.md`의 "파일 구성" 표를 `AGENTS.md`의 디렉토리 구조와 맞춥니다.
