# [009] 장부: 회비·벌금·구장비·간식 청구·납부 확인

- 브랜치: `codex/009-ledger`
- 의존: 007 (main에 머지됨). 006과 동시 진행되므로 **`matches.html`, `js/candidates.js`, `js/parse-title.js`는 건드리지 않고, 데이터 함수는 새 파일 `js/data-ledger.js`에 추가**한다
- 예상 규모: L

## 배경
회칙(docs/rules.md)의 회비·면제·벌금 규정을 장부로 옮깁니다. 매시간 housekeeping이 `ledger`에 회비(`dues`, `period` 키)와
미투표 벌금(`fine_late_vote`, `ref_poll_id` 키)을 자동으로 넣고 있고, 나머지(지각·급불참 벌금, 구장비, 간식, 납부 확인, 조정)는
회장이 화면에서 기록합니다. 금액 부호 규칙: **+ 는 팀에 들어와야 할 돈(회비·벌금), − 는 팀이 내거나 돌려줄 돈(구장비·간식 환급·면제)**.
`settled=false`인 개인 행이 "미납/미환급"입니다. 스키마는 `supabase/schema.sql`의 `ledger`, `snack_claims` 참고. 데모 모드 필수.

## 목표
- 팀원: 이번 달 내 회비·벌금·미납 상태를 보고, 간식 구매를 청구할 수 있다.
- 회장: 납부 확인, 벌금·구장비·조정 기록, 간식 청구 승인, 회장 면제를 처리할 수 있다.
- 홈 "장부 요약" 카드가 실제 숫자를 보여준다.

## 변경 파일
- (신규) `ledger.html`
- (신규) `js/data-ledger.js` — `Object.assign(window.ExicanData, {...})`로 함수 추가 (data.js 수정 금지)
- (신규) `js/ledger-rules.js` — 순수 함수 (rules.js 수정 금지; Node export + `window.ExicanLedgerRules`)
- `index.html` — "장부 요약" 카드 채우기 (다른 카드 로직은 그대로)
- `test/fixtures/demo-data.json` — `ledger` 12건+, `snack_claims` 2건 추가 (아래 §6). 006도 이 파일을 수정하므로 **`ledger`·`snack_claims` 키만** 추가/수정
- `styles.css` — 장부 표·타일 스타일
- (신규) `test/ledger-rules.test.js`
- `README.md` — 장부 절

## 변경 금지
- `js/data.js`, `js/rules.js`, `scripts/*`, `supabase/*`, `vote.html`, `matches.html`, `js/candidates.js`, `js/parse-title.js`

## 상세 요구사항

### 1. `js/ledger-rules.js` 순수 함수
- `CATEGORY_LABELS` — `dues: 회비, injury_exempt: 부상 면제, president_exempt: 회장 면제, fine_late_vote: 미투표 벌금, fine_no_show: 급불참 벌금, fine_late: 지각 벌금, fine_late_kickoff: 경기 후 도착 벌금, venue_fee: 구장비, snack: 간식, plab_support: 플랩 지원, deposit: 입금, adjustment: 조정`.
- `monthOf(entryDate)` → `"2026-10"`.
- `memberSummary(rows, memberId, month)` → `{ due, fine, exempt, refund, settled, outstanding }`: `due` = dues 합, `fine` = fine_* 합, `exempt` = injury/president 면제 합(음수), `refund` = snack/plab 등 음수 개인 행 합, `settled` = settled=true 행 합, `outstanding` = 미정산(`settled=false`) 행의 합 (양수면 팀에 낼 돈, 음수면 받을 돈).
- `teamSummary(rows, month)` → `{ income, expense, balance, unpaidMembers: [{member_id, outstanding}] }`. `balance` = 정산된 모든 행 합 + 팀 단위(`member_id` null) 행 합 (전 기간 누적, month 무관).
- `fineRow(kind, memberId, match, config)` — `kind ∈ no_show | late | late_kickoff` → `{ member_id, category: "fine_" + kind, amount: config.FINES[...], ref_match_id: match.id, entry_date: match.match_date, note }`.
- `presidentExemptRow(match, presidentId, config)` → `config.PRESIDENT_EXEMPT_MODE === "week"` 이면 `{ category: "president_exempt", amount: -config.DUES_MONTHLY / 4 (반올림), ref_match_id: match.id, entry_date: match.match_date }`, `"month"` 이면 `{ ..., amount: -config.DUES_MONTHLY, period: monthOf(match.match_date), ref_match_id: null }`.
- `snackLedgerRow(claim)` → `{ member_id: claim.buyer_id, category: "snack", amount: -claim.amount, ref_match_id: claim.match_id, settled: false, note: claim.items }`.
- `plabSupportAllowed(rows, memberId, month)` → 해당 월 `plab_support` 행이 없으면 true (월 1회).

### 2. `js/data-ledger.js` (ExicanData 확장, demo·live 둘 다)
- `ledgerRange({ from, to })` — 기간 조회 (live: `gte/lte entry_date`), 기본 전 기간.
- `addLedger(row)` — admin만 (`ExicanAuth.getRole()` 확인; live에서 RLS가 최종 방어). `period`가 필요한 카테고리면 호출자가 채움.
- `setSettled(ids, settled)` — admin. live: `update({ settled }).in("id", ids)`.
- `snackClaims({ status })` — 전체 또는 상태별.
- `submitSnackClaim({ match_id, amount, items })` — team. `buyer_id = ExicanMember.getId()` 필수.
- `reviewSnackClaim(id, status)` — admin. `approved`면 `snackLedgerRow`로 `addLedger`도 수행(이미 같은 `ref_match_id`+`member_id`+`snack` 행이 있으면 건너뜀 — unique index `ledger_uidx_match`가 막으므로 23505는 조용히 무시).
- 데모: 메모리 배열 조작, id는 증가 숫자.

### 3. `ledger.html`
- 상단: 월 선택(◀ 2026-10 ▶, 기본 이번 달), 타일 3개: "팀 잔액", "이번 달 미납 합계", "미납자 N명".
- 표 A "멤버별 이번 달": 이름 / 회비 / 면제 / 벌금 / 환급·지원 / 납부 / **미납**(강조, 음수면 "받을 돈"). 행 클릭 → 그 멤버의 이번 달 항목 목록 펼침(날짜, 항목, 금액, 메모, 정산 여부).
- 표 B "팀 지출"(member_id null): 구장비·기타.
- 내 이름 뱃지(`ExicanMember`) + "내 항목만" 토글.
- **팀원 기능**: "간식 청구" 버튼 → 모달(매치 선택: `matches` 중 최근 4주, 금액, 품목 예: "물2 음료1") → `submitSnackClaim`. 내 청구 상태(대기/승인/거절) 표시.
- **회장 패널**(admin):
  - 납부 확인: 미납 행 체크박스 → "선택 정산" (`setSettled`). 멤버 단위 "전부 정산" 버튼.
  - 기록 추가 모달: 종류(지각/경기 후 도착/급불참/구장비/플랩 지원/입금/조정), 대상 멤버(팀 지출이면 없음), 매치(최근 8주 선택 또는 없음), 금액(벌금은 자동 채움·수정 가능), 메모. 벌금은 `fineRow` 사용, `plab_support`는 `plabSupportAllowed` 검사 후 경고.
  - 회장 면제 버튼: 매치 선택 → `presidentExemptRow` → `addLedger` (중복은 unique index로 거부 → 토스트 "이미 처리됨").
  - 간식 청구 목록: 승인/거절 버튼.
- 375px: 표는 가로 스크롤 영역(`rules.html`의 `.rules-table-scroll` 패턴 재사용), 타일 세로.

### 4. 홈 카드 "장부 요약"
- "팀 잔액 123,000원 · 이번 달 미납 3명 (45,000원)" + 내 미납이 있으면 "내 미납 10,000원" 강조. 링크 ledger.html.

### 5. 권한·안전
- 팀 세션에서는 다른 멤버의 금액도 보이지만(투명성 원칙), 연락처·계좌는 이 화면에 없다.
- 모든 쓰기는 `try/catch` + 토스트. RLS 거부(42501/403) 시 "회장 로그인이 필요합니다".

### 6. 데모 데이터 (`demo-data.json`)
- `ledger`: 이번 달(`2026-10`) 12명 `dues` 30,000(period "2026-10", 8명 settled true), m07 `injury_exempt` −15,000, m05 `fine_late_vote` 5,000(ref_poll_id "demo-poll-1"), m09 `fine_late` 10,000, 팀 `venue_fee` −60,000(settled true), m11 `snack` −8,000(settled false), m03 `president_exempt` −7,500. `id`는 1부터.
- `snack_claims`: m11 approved 8,000 "물2 음료1", m02 pending 9,000 "물2 음료2".
- 006과 같은 파일을 수정하므로 키 추가만 하고 다른 키는 손대지 않는다. `js/data.js`의 데모 로더는 `ledger`를 이미 빈 배열로 초기화하므로 추가 수정 없이 읽힌다.

## 수용 기준
- [ ] `npm test` 통과 (기존 + ledger-rules 10개 이상: 요약 계산, 부호, 면제 두 모드, 플랩 월 1회, 간식 행)
- [ ] `ledger.html?demo=1`: 타일 3개 숫자가 데모 데이터와 일치(미납자 4명 = 미납 dues 4명 + 벌금 등 합산 규칙에 따라 PR에 계산 근거 기재), 표 A 12행, m07 면제 반영
- [ ] 데모 회장(안준호)으로 "선택 정산" → 미납 합계 감소, "기록 추가"로 지각 벌금 → 표 반영, 간식 청구 승인 → ledger에 snack 행 생성
- [ ] 데모 팀원으로 간식 청구 → 대기 목록에 표시
- [ ] `index.html?demo=1` 장부 요약 카드 숫자 표시
- [ ] 375px 가로 넘침 없음
- [ ] 실제 Supabase 경로는 Claude가 검증 (PR에 "미검증" 명시)

## 테스트 방법
- 자동: `npm test`
- 수동: `python -m http.server 8765` → `/ledger.html?demo=1`, `/index.html?demo=1`

## 참고
- `supabase/schema.sql`: `ledger` 카테고리 목록·unique index(`ledger_uidx_poll/match/period`), `snack_claims`
- `js/config.js`: `FINES`, `DUES_MONTHLY`, `INJURY_EXEMPT_RATE`, `PRESIDENT_EXEMPT_MODE`, `LEDGER_START_MONTH`
- `js/ui.js`: `formatWon`, `escapeHtml`, `showToast`; `js/rules.js`: `kstDate`, `formatRelative`
