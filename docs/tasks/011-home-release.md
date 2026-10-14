# [011] 홈 통합·카톡 공유·문서 정리·v2.0.0 릴리스

- 브랜치: `codex/011-home-release`
- 의존: 010b (머지 후 발주). 그 외 전부 머지됨
- 예상 규모: M

## 배경
기능이 모두 들어왔으니 홈을 "매주 쓰는 화면"으로 다듬고, 카톡에 붙여넣을 링크·문구를 한 번에 복사하게 하고,
문서와 버전을 정리해 v2.0.0으로 태깅할 준비를 합니다.

## 목표
- 홈에서 이번 주 흐름(투표 → 후보 → 확정 → 배정표 → 장부)이 한눈에 보이고, 카톡 공유 버튼 2개로 회장의 반복 작업이 끝난다.
- README가 사용자 가이드가 되고, CHANGELOG에 v2.0.0 항목이 생긴다.

## 변경 파일
- `index.html`, `styles.css`
- (신규) `js/share.js` — 공유 문구 순수 함수 (Node export + `window.ExicanShare`)
- `README.md` — 전면 개편 (아래 §3)
- `CHANGELOG.md` — v2.0.0 항목
- `package.json` — `"version": "2.0.0"`
- 구형 브라우저 테스트 페이지 — 삭제 (Node 테스트가 대체). 구형 멤버 편집 페이지 — 삭제하고 내비·README에서 제거 (010b `admin.html`이 대체). `members.json`은 폴백으로 유지
- `js/ui.js` — 내비 항목에 `member.html`("내 현황") 추가, 구형 멤버 편집 페이지 링크 제거
- (신규) `test/share.test.js`

## 변경 금지
- `js/rotation.js`, `scripts/*`, `supabase/*`, 다른 페이지의 기능 로직

## 상세 요구사항

### 1. 홈 재구성 (`index.html`)
- 상단 "이번 주" 띠: 다가오는 토요일 날짜 + D-day, 투표 상태(진행 중/마감/없음), 확정 매치 유무를 한 줄로.
- 카드 순서: 이번 주 투표 → 매칭 후보 → 확정 매치 → 배정표(버튼: 확정 매치가 있으면 "10/17 배정표 만들기") → 장부 요약 → 내 현황(`member.html`).
- 각 카드의 기존 로드 로직은 유지하되, 로드 순서를 `requireTeam` 1회 → 병렬 로드로 정리(현재 DOMContentLoaded 핸들러 3개를 1개로 합치고 `requireTeam` 중복 호출 제거).
- **카톡 공유 버튼**(회장뿐 아니라 누구나):
  - "투표 링크 복사": `buildVoteShare(poll, summary, url)` → 예: `[FC EXICAN] 10/17(토) 경기 참석 투표\n마감: 10/12(월) 13:00\n현재 참석 6명\n👉 https://.../vote.html`
  - "후보 공유": `buildCandidateShare(rankedTop3, url)` → 상위 3건 `describeSchedule` + 제목 + 카페 링크 + `👉 https://.../matches.html`
  - 복사는 `navigator.clipboard`, 실패 시 `prompt` 폴백(기존 rotation.html 패턴). 카톡 인앱 브라우저에서도 동작해야 하므로 버튼은 `user gesture` 안에서 호출.
- 데모 모드(`?demo=1`) 링크 유지.

### 2. `js/share.js`
- `buildVoteShare(poll, summary, pageUrl)`, `buildCandidateShare(candidates, pageUrl)`, `buildMatchShare(match, pageUrl)`(확정 매치 공지: 날짜·시간·구장·구장비·"15분 전 도착"). 모두 순수 문자열 반환. 이모지는 `👉` 하나만.

### 3. README 개편 (구조)
1. 한 줄 소개 + 배포 URL
2. 팀원용 사용법: PIN 입력 → 투표 → 후보 👍 → 내 현황 → 간식 청구
3. 회장용 운영 흐름(주간): 일 13:00 투표 자동 생성 → 월 13:00 마감·벌금 자동 → 후보 확인·문자·확정 → 토요일 배정표 → 출석·벌금·구장비 기록 → 월초 회비 자동
4. 설정값 설명(`js/config.js` 각 키, `PRESIDENT_EXEMPT_MODE`, `LEDGER_START_MONTH`)
5. 운영 절차: PIN/회장 비밀번호 분실(Supabase Users에서 삭제·재생성), 멤버 추가/탈퇴(admin.html), Cron 확인(Actions 탭), 데이터 백업(SQL Editor export)
6. 개발: 구조, `npm test`, 로컬 실행, 발주서 워크플로(AGENTS.md 링크), Supabase 스키마 적용(`supabase/README.md`)
7. 기존 "배정 규칙" 절은 유지
- 연락처·계좌·키·PIN은 README에 없음.

### 4. CHANGELOG v2.0.0
- Added/Changed/Removed/Infra 항목으로 001~011 요약(각 1줄). 날짜는 PR 머지일.

### 5. 삭제 영향
- 구형 브라우저 테스트 페이지 삭제 시 README·AGENTS.md 언급 제거. 구형 멤버 편집 페이지 삭제 시 `rotation.html`의 "⚙️ 멤버 관리" 링크를 `admin.html`로 교체.

## 수용 기준
- [ ] `npm test` 통과 (기존 + share 6개 이상)
- [ ] `index.html?demo=1`: 상단 띠 D-day 표시, 카드 6개, 공유 버튼 2개 클릭 시 복사 토스트(클립보드 불가 환경은 prompt)
- [ ] 홈 로드 시 `requireTeam` 호출이 1회 (콘솔에서 `ExicanAuth.requireTeam`을 래핑해 횟수 확인, PR 본문에 기재)
- [ ] 내비에 "내 현황" 추가, 삭제한 두 HTML 파일의 경로 문자열 참조가 저장소에 없음(`git grep`)
- [ ] README에 비밀값 없음, 배포 URL·사용법·운영 절차 포함
- [ ] `CHANGELOG.md` v2.0.0 항목, `package.json` version 2.0.0
- [ ] 375px 가로 넘침 없음, 콘솔 에러 없음

## 테스트 방법
- 자동: `npm test`
- 수동: `python -m http.server 8765` → `/index.html?demo=1`

## 참고
- `js/candidates.js`의 `describeSchedule`/`describeMatch`, `js/rules.js`의 `attendanceSummary`/`pollStatus`/`nextSaturday`
- 기존 `index.html`의 세 DOMContentLoaded 핸들러(007·006·009가 각각 추가)
