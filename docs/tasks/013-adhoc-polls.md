# [013] 임의 날짜 투표(공휴일·이벤트) 생성과 여러 투표 전환

- 브랜치: `codex/013-adhoc-polls`
- 의존: 012 (main에 머지됨). DB 마이그레이션 `supabase/migrations/2026-10-16-polls-title-fines.sql`은 Claude가 이미 적용함
- 예상 규모: M

## 배경
투표는 매주 토요일 경기 기준으로 자동 생성됩니다. 회장이 공휴일·이벤트 경기용 투표를 **아무 날짜에나** 만들 수 있어야 하고,
그 경우 제목(예: "10/3 개천절 특별 매치")과 마감 시각을 직접 정하며, 미투표 벌금을 적용할지 선택할 수 있어야 합니다.
또한 투표 페이지는 지금 "가장 가까운 투표 1개"만 보여 특별 투표가 토요일 투표를 가립니다. 다가오는 투표를 모두 보여주고 전환할 수 있어야 합니다.

`polls` 테이블에 컬럼 2개가 추가됐습니다(이미 적용됨): `title text`(null이면 정기 투표), `fines boolean not null default true`(false면 미투표 벌금 제외).
`createPoll(matchDate)`는 `data.js`에 이미 있고 `match_date`는 unique입니다.

## 목표
- 회장이 투표 페이지 또는 관리 페이지에서 날짜·제목·마감·벌금 적용을 정해 투표를 만든다.
- 팀원은 투표 페이지에서 다가오는 투표를 모두 보고 각각 참석/불참을 표시한다.
- 특별 투표(fines=false)의 미투표자는 벌금 대상에서 빠진다.

## 변경 파일
- `js/data.js` — `createPoll(matchDate, options)` 확장, `upcomingPolls()` 추가
- `js/rules.js` — `lateVoteRows`: `poll.fines === false`면 빈 배열; `pollTitle(poll)` 추가
- `vote.html` — 여러 투표 전환 UI + 회장 "투표 만들기" 모달
- `admin.html` — 투표 탭의 "다음 투표 생성"을 같은 모달로 교체, 목록에 제목·벌금 여부 표시
- `index.html` — 이번 주 투표 카드: 다가오는 투표가 2개 이상이면 "특별 투표 N개" 행 링크 추가 (보드·다른 카드 로직은 그대로)
- `test/fixtures/demo-data.json` — `polls`에 특별 투표 1건(제목 "개천절 특별 매치", 다음 주 목요일, fines false) + 투표 3건
- `test/rules.test.js`, `test/housekeeping.test.js` — fines=false 케이스 추가
- `styles.css` — 페이지 보정 섹션에 투표 전환 칩·특별 배지 스타일 (토큰·공용 블록 수정 금지)
- `README.md` — 회장 운영 표에 "특별 투표 만들기" 한 줄

## 변경 금지
- `scripts/*`(housekeeping은 `lateVoteRows`를 그대로 쓰므로 수정 불필요), `supabase/schema.sql`은 Claude가 갱신함, `js/rotation.js`, `matches.html`, `ledger.html`, `DESIGN.md`

## 상세 요구사항

### 1. 데이터 (`js/data.js`)
- `createPoll(matchDate, { title = null, opens_at, closes_at, fines = true } = {})`: 인자가 없으면 기존처럼 `pollWindow(matchDate)`. 있으면 그대로 저장. live는 `insert`, 23505는 "해당 날짜의 투표가 이미 있습니다". 데모는 메모리.
- `upcomingPolls(nowIso)`: `match_date >= 오늘(KST)`이고 `cancelled=false`인 투표를 `match_date` 오름차순으로 전부. `currentPoll`은 유지(= upcomingPolls의 첫 번째).
- 투표 저장(`castVote`)은 변경 없음.

### 2. 규칙 (`js/rules.js`)
- `lateVoteRows(poll, …)`: `poll.fines === false`이면 `[]`.
- `pollTitle(poll)`: `poll.title`이 있으면 그대로, 없으면 `"10/17(토) 경기"` (요일은 날짜에서 계산, 하드코딩 "(토)" 금지).
- `pollStatus` 변경 없음.

### 3. 투표 페이지 (`vote.html`)
- 보드 위(또는 보드 안 상단)에 **투표 전환 칩**: 다가오는 투표가 2개 이상일 때만 표시. 칩 라벨 = `pollTitle` + 상태(진행 중/예정/마감). 선택한 투표가 보드·패널의 대상이 된다. 기본 선택 = 진행 중인 것 중 가장 가까운 날짜, 없으면 가장 가까운 날짜.
- 보드 제목은 `pollTitle(poll)`; 특별 투표(`title`이 있거나 토요일이 아님)는 제목 옆 `.chip` "특별", `fines=false`면 "벌금 없음" 칩.
- 회장 도구: "투표 만들기" 버튼 → 모달(`.modal`): 날짜(`type=date`, 필수, 오늘 이후), 제목(선택, 30자), 마감 시각(`type=datetime-local`, 기본 = 날짜 전날 13:00), "미투표 벌금 적용" 체크(기본: 토요일이면 켬, 아니면 끔), [만들기]. 열림 시각은 지금. 성공 시 그 투표로 전환 + 토스트. "투표 취소"는 기존대로 `.btn-destructive`.
- 마감 시각이 경기 날짜보다 뒤면 오류 "마감은 경기 전이어야 합니다".

### 4. 관리 페이지 (`admin.html`) 투표 탭
- "다음 투표 생성" 버튼을 "투표 만들기"(같은 모달 컴포넌트, 코드 중복 없이 `js/poll-form.js` 새 파일로 분리 가능 — 분리 시 변경 파일에 추가)로 교체. 기본값은 다음 토요일.
- 목록 행에 `pollTitle`, "특별"·"벌금 없음" 칩, 마감 시각.

### 5. 홈 (`index.html`)
- 이번 주 투표 카드의 숫자·메타는 **정기(토요일) 투표** 기준 유지. `upcomingPolls`가 2개 이상이면 카드 하단에 행 하나 "특별 투표 N개 · 10/3 개천절 특별 매치" → vote.html 링크.

### 6. 테스트
- `rules.test.js`: `lateVoteRows` fines=false → 0행, fines 미정의(기존 데이터) → 기존대로; `pollTitle` 제목 있음/없음(요일 계산).
- `housekeeping.test.js`: 마감 지난 fines=false 투표는 ledger POST가 없음.

## 수용 기준
- [ ] `npm test` 통과
- [ ] `vote.html?demo=1`: 전환 칩 2개(정기·특별), 특별 투표에 "특별"·"벌금 없음" 칩, 각각 참석 저장 가능
- [ ] 데모 회장: "투표 만들기"로 임의 날짜(예: 다음 주 수요일) 생성 → 칩 3개, 같은 날짜 재생성 시 "이미 있습니다"
- [ ] `admin.html?demo=1` 투표 탭 목록에 제목·칩·마감 표시, 같은 모달로 생성
- [ ] `index.html?demo=1` 이번 주 투표 카드에 "특별 투표 1개" 행
- [ ] 375px 가로 넘침 없음, 콘솔 에러 없음, DESIGN.md 규칙 준수(새 색·크기 없음, 점등은 진행 중 투표의 미투표에만)
- [ ] 실제 Supabase 경로는 Claude가 검증 (PR에 "미검증" 명시)

## 테스트 방법
- 자동: `npm test`
- 수동: `python -m http.server 8765` → `/vote.html?demo=1`, `/admin.html?demo=1`, `/index.html?demo=1`

## 참고
- `js/rules.js`의 `pollWindow`, `pollStatus`, `nextSaturday`, `kstDate`; `js/data.js`의 `createPoll`, `currentPoll`, `setPollCancelled`
- 모달 마크업은 `js/supabase.js`의 PIN 모달(`.modal-backdrop > form.modal`)과 `js/member.js`의 선택 모달 패턴
