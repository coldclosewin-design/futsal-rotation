# [010b] 관리 페이지(멤버·매치·출석 벌금), 개인 페이지, 배정표 연동, 경기 기록

- 브랜치: `codex/010b-admin-member-history`
- 의존: 006, 007, 009 (모두 main에 머지됨)
- 예상 규모: L

## 배경
남은 운영 기능을 마무리합니다. (1) 회장이 멤버·매치·출석을 관리하고 출석 기반 벌금(지각·급불참)을 한 번에 기록하는 `admin.html`,
(2) 팀원이 자기 납부·벌금·참석률·키퍼 횟수를 보는 `member.html`, (3) 배정표가 이번 주 투표 참석자를 자동으로 불러오고 결과를
`rotation_history`에 저장, (4) 경기 기록 표. 데이터 접근은 `ExicanData`(007)·`data-ledger.js`(009) 패턴을 따라 **새 파일 `js/data-admin.js`**에 추가합니다. 데모 모드 필수.

## 목표
- 회장: `admin.html` 한 곳에서 멤버 수정, 투표 관리, 매치 상태·스코어·출석 기록, 출석 벌금 자동 생성, 회장 면제를 처리한다.
- 팀원: `member.html`에서 내 현황을 본다.
- 배정표: 참석자 자동 선택 → 생성 → 매치에 저장.

## 변경 파일
- (신규) `admin.html`, (신규) `member.html`
- (신규) `js/data-admin.js` — `Object.assign(window.ExicanData, {...})`
- (신규) `js/attendance-rules.js` — 순수 함수 (Node export + `window.ExicanAttendance`)
- `rotation.html` — 참석자 불러오기, 매치에 저장 (기존 배정 로직 호출부는 유지)
- `rules.html` — 하단 "경기 기록" 섹션 (팀 로그인 시에만 로드)
- `test/fixtures/demo-data.json` — `match_attendance`, `rotation_history` 키 추가, `polls` 1건(지난 주) 추가
- `styles.css`, `README.md`
- (신규) `test/attendance-rules.test.js`

## 변경 금지
- `js/data.js`, `js/data-ledger.js`, `js/rules.js`, `js/ledger-rules.js`, `js/candidates.js`, `js/rotation.js`(알고리즘), `scripts/*`, `supabase/*`, `vote.html`, `matches.html`, `ledger.html`

## 상세 요구사항

### 1. `js/attendance-rules.js`
- `ATTENDANCE_LABELS` — `present: 출석, late: 지각, late_kickoff: 경기 후 도착, no_show: 급불참, excused: 사유 불참`.
- `attendanceFines(match, attendance, votes, config)` → 벌금 행 배열(`ledger-rules.js`의 `fineRow`와 같은 모양, 직접 구성):
  - `late` → `fine_late`, `late_kickoff` → `fine_late_kickoff`.
  - `no_show`는 **그 매치의 투표(`votes`, poll_id = match.poll_id)에서 `attend`였던 멤버만** `fine_no_show` (회칙: 참석 투표 후 불참). `excused`는 벌금 없음.
  - 각 행 `ref_match_id: match.id`, `entry_date: match.match_date`, `note: "YYYY-MM-DD 경기 지각"` 등.
- `attendanceRate(polls, votes, attendance, memberId, weeks = 12)` → `{ polled, attended, rate }`: 최근 `weeks`주 안의 `played` 매치 중 `present|late|late_kickoff`를 attended로.
- `rotationTotals(history, memberId)` → `{ matches, gk, rest, outQuarters }` 누적.
- `rosterFromVotes(votes, members)` → `attend` 투표한 active 멤버 이름 배열(id 순).

### 2. `js/data-admin.js` (ExicanData 확장)
- `upsertMember(row)` admin — `members` upsert on `id`; 새 멤버는 `id` 자동(`m` + 2자리, 기존 최대+1).
- `polls({ from, to })`, `cancelPoll(id, cancelled)`(=setPollCancelled 재사용 가능), `votesByPolls(pollIds)`.
- `updateMatch(id, patch)` admin — status/score/memo/cost.
- `attendance(matchId)`, `saveAttendance(matchId, rows)` admin — upsert `(match_id, member_id)`, 없는 멤버 행은 삭제하지 않음.
- `rotationHistory({ memberId | matchId })`, `saveRotationHistory(matchId, rows)` admin — upsert.
- `matchHistory({ limit = 30 })` — `played|cancelled|fallback_plab` 매치 + 출석 수.
- 데모: 메모리. live: supabase-js. 에러 래핑은 `data-ledger.js`와 동일(42501/403 → "회장 로그인이 필요합니다").

### 3. `admin.html` (role admin 필수; 팀 세션이면 "회장 로그인이 필요합니다" + 회장 로그인 버튼만)
- 탭 3개(상단 칩): **멤버 / 투표 / 매치**.
- **멤버**: 표(이름, 활동, 회장, 가입일, 부상 기간, 연락처, 계좌) + 행 편집 모달 + "새 멤버". 비활성 멤버는 회색. 연락처·계좌는 이 화면에서만 입력·표시. 저장 → `upsertMember`. (기존 `members-admin.html`·`members.json`은 그대로 두되, 상단에 "members.json은 오프라인 폴백용입니다" 안내.)
- **투표**: 최근 8주 투표 목록(날짜, 상태, 참석/불참/미투표 수, 취소 토글), "다음 투표 생성"(007의 `createPoll`). 투표 행 펼치면 멤버별 선택·지각 표시.
- **매치**: 다가오는/지난 매치 목록. 매치 카드: 날짜·시간·구장·상대·포맷·구장비·상태 배지.
  - 상태 변경: scheduled → played / cancelled / fallback_plab. `played`로 바꾸면 스코어(우리:상대) 입력.
  - 출석 기록(상태 `played`일 때): 멤버별 라디오(출석/지각/경기 후 도착/급불참/사유 불참/해당 없음). 기본값은 그 매치 투표의 `attend` → 출석, `absent`·미투표 → 해당 없음. 저장 → `saveAttendance`.
  - "출석 벌금 생성" 버튼: `attendanceFines`로 미리보기(이름·항목·금액) → 확인 → `addLedger` 반복(23505는 "이미 처리됨"으로 건너뜀) → 결과 토스트 "벌금 3건 기록, 1건 이미 있음".
  - "회장 면제 기록": 009의 `presidentExemptRow` + `addLedger`.
  - 구장비 기록: `venue_fee` −cost 행 `addLedger` (member_id null, ref_match_id, settled true) 버튼, 중복은 unique index로 거부.
- 모든 쓰기 후 재조회·토스트. 375px에서 표는 가로 스크롤.

### 4. `member.html`
- 쿼리 `?id=m03` 없으면 `ExicanMember.ensure`로 내 이름. 상단에 이름 + "다른 멤버 보기" 드롭다운(active).
- 섹션: (1) 이번 달 납부: `memberSummary` + 미납 강조 + 전 기간 미정산 합계, (2) 벌금 이력: `fine_*` 행 최근 20건, (3) 참석률: 최근 12주 `attendanceRate` + 투표 참여율(투표 수 대비 투표한 수), (4) 배정 누적: `rotationTotals` (경기 수, GK, 휴식, 경기당 평균). 데이터 없으면 "기록 없음".
- 연락처·계좌는 표시하지 않는다.

### 5. `rotation.html` 연동
- 참가자 선택 섹션 위에 버튼 "이번 주 참석자 불러오기": `currentPoll` → `votes` → `rosterFromVotes`로 체크박스 자동 선택(이름 매칭; `members` 테이블이 있으면 그걸로 목록 구성, 실패 시 기존 `members.json`). 결과 토스트 "참석 7명 선택".
- 결과 아래(admin일 때) "이번 매치에 저장": 다가오는 매치 선택(기본: 투표의 match_date와 같은 매치) → `saveRotationHistory(matchId, rows)` with `rows = players.map(name → { member_id, active_quarters, gk_count, rest_count, out_quarters })`. 이름→member_id는 `members`에서 매핑. `matches.schedule`에도 배정표 JSON 저장(`updateMatch`).
- 설정 전/데모 모드/비로그인에서는 기존 기능이 그대로 동작해야 함(버튼만 비활성 + 안내).

### 6. `rules.html` 경기 기록
- 하단 섹션 "경기 기록": 버튼 "불러오기(팀 로그인)" → `requireTeam` → `matchHistory` 표(날짜, 구장, 상대, 포맷, 스코어, 참석 수, 상태). 비로그인 상태에서는 회칙 본문만 보임(공개 유지).

### 7. 데모 데이터
- `polls`에 지난 주(2026-10-10 토, 마감 10-05) 1건 + 그 투표 `poll_votes` 8명 attend, `matches`에 2026-10-10 played 1건(스코어 4:3, poll_id 연결, id `demo-ledger-match-1`로 009 장부 행과 연결), `match_attendance` 8명(지각 1, 급불참 1), `rotation_history` 7명. 날짜 치환 규칙은 006의 `shiftDemoDates`를 **과거 방향**으로도 적용할 수 있게 `js/attendance-rules.js`에 `shiftPastDemoDates(rows, todayKst)`(같은 요일의 가장 최근 과거 날짜) 추가.

### 8. 테스트
- `attendanceFines`: 지각 1·경기 후 도착 1·급불참(투표 attend) 1·급불참(투표 absent) 0·excused 0 → 3행, 금액은 config, `ref_match_id` 포함.
- `attendanceRate`: 12주 창 안/밖, 0 매치 → rate null.
- `rotationTotals`, `rosterFromVotes`(비활성 제외), `shiftPastDemoDates`.

## 수용 기준
- [ ] `npm test` 통과 (기존 436 + 신규 12개 이상)
- [ ] `admin.html?demo=1` 회장(안준호): 멤버 편집 저장 반영, 투표 목록·취소 토글, 매치 played 전환 → 출석 입력 → "출석 벌금 생성" 미리보기 3건 → 기록 → `ledger.html?demo=1`에 반영
- [ ] `admin.html?demo=1` 팀원(권형관): 관리 기능 없이 안내만
- [ ] `member.html?demo=1&id=m05`: 미납 35,000원, 벌금 이력 1건, 참석률·배정 누적 표시
- [ ] `rotation.html?demo=1`: "이번 주 참석자 불러오기" → 6명 체크 → 생성 → 회장이면 "이번 매치에 저장" 성공 토스트
- [ ] `rules.html`: 비로그인 본문 표시 유지, 데모에서 경기 기록 표 1행
- [ ] 375px 가로 넘침 없음, 콘솔 에러 없음
- [ ] 실제 Supabase 경로는 Claude가 검증 (PR에 "미검증" 명시)

## 테스트 방법
- 자동: `npm test`
- 수동: `python -m http.server 8765` → `/admin.html?demo=1`, `/member.html?demo=1`, `/rotation.html?demo=1`, `/rules.html?demo=1`

## 참고
- `js/data.js`·`js/data-ledger.js`의 demo/live 분기 패턴, `js/ledger-rules.js`의 `fineRow`/`presidentExemptRow`, `js/rules.js`의 `attendanceSummary`
- `supabase/schema.sql`: `match_attendance`, `rotation_history`, `members` 컬럼
- `js/rotation.js`의 `buildSchedule`/`validateSchedule` 반환 구조(`{quarter, gk, rest, field}`), `rotation.html`의 `currentContext`
