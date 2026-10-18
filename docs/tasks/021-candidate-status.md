# [021] 매칭 보드 수집 상태 — 마지막 수집 시각, 이번 주 토요일 매물 줄, 빈 상태 안내

- 브랜치: `codex/021-candidate-status`
- 의존: 020 (main에 머지됨, #21)
- 예상 규모: S

## 배경
10/19(월) 회장이 "토요일 후보가 업데이트가 안 되는 건지 매물이 없는 건지" 물었다. 조사 결과 수집은 정상(매시간 게시판 4곳 × 최신 60건, 파싱 55~59건)이고, 실제로 10/24(토) 매물이 1건(오후 13~15시)뿐이라 기본 필터(토요일·오전만·마감 제외)에서 0건으로 보인 것이다. 매물은 보통 경기 며칠 전(수~금)에 올라온다.
문제의 본질은 화면이 **"수집이 돌고 있는지"**와 **"이번 주 토요일 매물이 필터 전 기준으로 몇 건인지"**를 보여 주지 않아 회장이 고장으로 오해한다는 점이다. 보드는 "읽는 곳"(`DESIGN.md` Concept)이므로 이 두 가지를 보드에 날짜·숫자·상태로 올린다. 관련 설계는 `docs/PLAN.md` 매칭 대시보드 절 참조.

## 목표
- 매칭 보드만 보고 "마지막 수집 12분 전"과 "10/24 토 · 매물 1건 · 오전 0건"을 필터와 무관하게 읽을 수 있다.
- 후보 목록이 0건일 때 "왜 0건인지, 어떤 필터를 바꾸면 보이는지"를 문구로 알 수 있다.

## 변경 파일
- `js/candidates.js` — §1 순수 함수 `candidateStatus`, §4 `candidateEmptyMessage` 추가. 기존 함수 변경 없음. `api` 객체에 두 함수 추가(브라우저·Node 동일 키 순서 테스트가 있으니 둘 다 같은 위치에).
- `matches.html` — §2 보드 세그먼트 교체, §3 `.board-lines` 줄 추가, §4 빈 상태 문구, §5 데모 보정. `styles.css?v=20261019d`.
- `styles.css` — §2 보정 한두 줄을 파일 끝 `/* 021: … */` 블록으로. 토큰·공용 블록 수정 없음.
- `test/candidates.test.js` — §6 케이스 추가.
- `docs/guide.md` — §7 회장 편 4절에 두 줄.
- `index.html`, `vote.html`, `rotation.html`, `ledger.html`, `member.html`, `rules.html`, `help.html`, `admin.html` — `styles.css?v=20261019d` 한 줄씩(020과 같은 방식으로 전 페이지 통일).

## 변경 금지
- `scripts/*`, `supabase/*`, `.github/workflows/*` — 수집기와 스키마는 정상이며 이번 범위가 아니다.
- `js/data.js`, `js/data-admin.js` — 조회 API 추가 없이 화면이 이미 불러온 `rows`만 쓴다.
- `DESIGN.md` — 규칙 변경 없음. 점등(`is-lit`)은 "지금 할 일·최근에 바뀐 것"에만 쓰고, 지연·확인 불가는 `is-dim`으로 낮춘다.
- `js/rules.js` — `nextSaturday`·`displayDate`·`formatRelative`를 그대로 재사용한다.

## 상세 요구사항

### 1. 순수 함수 `candidateStatus(rows, todayKst, nowIso, { staleHours = 72 } = {})`
`js/candidates.js`에 추가. DOM·전역 접근 없음. 반환:

```js
{ lastSeenAt, saturday, total, morning, open, morningOpen }
```

- `lastSeenAt`: **필터와 무관하게 `rows` 전체**에서 `Date.parse(row.last_seen_at)`가 유효한 값 중 최대를 ISO 문자열로. 유효한 값이 하나도 없으면 `null`. (`last_seen_at`은 수집기가 그 글을 마지막으로 본 시각이므로, 현재 목록에 있는 글 중 가장 최근 값이 곧 마지막 수집 시각이다.)
- `saturday`: `ExicanRules.nextSaturday(todayKst)`와 같은 규칙(오늘이 토요일이면 오늘). `candidates.js`는 `rules.js`를 require하지 않으므로 같은 계산을 내부에 두되 `test`에서 `nextSaturday`와 결과가 같음을 확인한다.
- 토요일 매물 집계는 **`filterCandidates`를 "전부 보기" 옵션으로 호출한 결과**(`ranked`+`unparsed`)에서 `parsed_date === saturday`인 글만 센다. 옵션: `{ menuIds: null, formats: null, saturdayOnly: false, morningOnly: false, includeClosed: true, includeUnparsed: true, staleHours }`. 이렇게 하면 과거 글 제외·72시간 만료 규칙이 목록과 동일하게 적용되어, 보드의 "매물 1건"이 필터를 모두 풀었을 때 목록에 보이는 글과 어긋나지 않는다.
  - `total`: 위 집계 전체(마감·시간 미정 포함).
  - `morning`: 그중 `start_hour != null && start_hour < 12`(`filterCandidates`의 오전 규칙과 동일, 마감 포함).
  - `open`: 그중 `!is_closed`.
  - `morningOpen`: 그중 오전이면서 `!is_closed` — 기본 필터에서 보이는 토요일 글 수와 같다.
- `rows`가 빈 배열이면 `{ lastSeenAt: null, saturday, total: 0, morning: 0, open: 0, morningOpen: 0 }`. 입력 배열을 변경하지 않는다.

### 2. 보드 세그먼트: "마감 포함" 칸을 "마지막 수집" 칸으로 교체
현재 보드 세그먼트 3칸은 **새 후보 · 미분류 / 마감 포함 / 내 추천**이다. 둘째 칸 "마감 포함"은 아래 체크박스 상태를 되풀이할 뿐이고 라벨 "(전체)"와도 어긋나므로 **"마지막 수집"으로 교체**한다(4칸으로 늘리지 않는다: 375px에서 "새 후보 · 미분류" 라벨이 넘친다). 마감 수는 §3의 토요일 줄로 옮긴다.

- 마크업: `<div id="matches-seen-segment" class="segment"><span class="label">마지막 수집</span><b id="matches-seen">—</b></div>`. 기존 `#matches-closed`와 `renderBoard`의 해당 줄은 삭제.
- `renderBoard()`에서 `const status = api.candidateStatus(rows, today(), nowIso, { staleHours: EXICAN_CONFIG.CANDIDATE_STALE_HOURS })`를 한 번 계산해 §2·§3·§4가 공유한다(`nowIso = new Date().toISOString()` 한 번만 만든다).
- 값 규칙:
  - `lastSeenAt`이 있고 지난 시간이 **3시간 이하**: `ExicanRules.formatRelative(lastSeenAt, nowIso)` 그대로(예: "12분 전", "방금", "2시간 전"). 세그먼트에 `is-lit`·`is-dim` 없음.
  - **3시간 초과**: 같은 값 뒤에 꼬리표 — `<b id="matches-seen">4시간 전 <small>지연</small></b>`, 세그먼트에 `is-dim`. 점등하지 않는다(수집 지연은 회장이 눌러서 해결할 일이 아니다). 3시간 기준은 매시간 cron + GitHub 스케줄 지연 최대 1시간(`docs/guide.md` 회장 편 2절)을 두 번 놓친 수준이다.
  - `lastSeenAt`이 `null`: 값 "확인 불가", 세그먼트 `is-dim`.
- `styles.css` 끝에 `/* 021: 매칭 보드 마지막 수집 꼬리표 */` 블록으로 `.page-board .segment b small { margin-left: 4px; font-size: var(--fs-label); font-weight: 600; color: var(--board-muted); letter-spacing: 0; }` 한 줄. 375px에서 "4시간 전 지연"이 한 줄에 들어오는지 확인한다(안 들어오면 꼬리표를 "지연"만 남기고 값은 "4시간 전"을 유지하는 범위에서 글자 간격·여백만 조정, 글자 크기 단계는 늘리지 않는다).

### 3. 보드 아래 "이번 주 토요일" 줄 (필터와 무관)
`.segments` 바로 아래에 `vote.html`과 같은 구조로 추가한다:

```html
<div class="board-lines">
  <p id="matches-saturday" class="board-line" data-label="이번 주 토요일" aria-live="polite">—</p>
</div>
```

- 본문: `${ExicanRules.displayDate(status.saturday)} · 매물 ${total}건 · 오전 ${morning}건 · 마감 ${total - open}건` → 예: **"10/24 토 · 매물 6건 · 오전 5건 · 마감 1건"**.
- `total === 0`이면 본문은 **"10/24 토 · 매물 0건"**까지만 쓰고, 그 아래에 `<span class="board-sub">아직 올라온 매물이 없습니다 · 보통 수~금에 올라옵니다</span>`(020의 `.board-line .board-sub` 규칙을 그대로 쓴다).
- `total > 0`이고 `morningOpen === 0`이면 `board-sub`에 **"기본 필터(오전 · 마감 제외)에 맞는 글은 없습니다"**. 그 외에는 `board-sub` 없음.
- 이 줄은 `renderBoard()`에서만 갱신하며 **필터 체크박스·지역 칩을 바꿔도 값이 변하지 않는다**(전체 기준). 데이터 로드 전(`rows`가 비어 있을 때)에는 "—"를 유지한다: `renderBoard`는 `message.hidden`이 `false`(로딩 중)이면 세그먼트·줄을 건드리지 않고 반환하거나, 로드 완료 뒤에만 갱신되도록 호출 위치를 조정한다. 로드 실패 시에도 "매물 0건"으로 오해하게 두지 않는다.
- 큰 숫자 "N 건 후보"의 계산은 그대로 둔다(기본 필터 결과. `saturdayOnly`는 요일만 보므로 다음 주 이후 토요일 글도 포함되어 `morningOpen`보다 클 수 있다). 라벨은 "매칭 후보 · 토요일 오전(전체 주)"로 고쳐 이번 주 줄과 구분한다.

### 4. 후보 0건 빈 상태 문구
`renderCards()`의 빈 상태 문구 "조건에 맞는 후보가 없습니다. 필터를 변경해 보세요."를 순수 함수 `candidateEmptyMessage(status, filters)`(`js/candidates.js`)의 결과로 바꾼다. `filters`는 `normalizeFilters` 결과 모양(`saturdayOnly`, `morningOnly`, `includeClosed`, `menuIds`, `formats`). 우선순위 순서대로 첫 번째로 맞는 문구를 돌려준다:

1. `status.total === 0` → `"이번 주 토요일(10/24) 매물이 아직 없습니다. 보통 수~금에 올라옵니다."` (날짜는 `displayDate(saturday, { weekday: false })` 형식 `10/24`를 함수 인자로 받거나 내부에서 같은 형식으로 만든다.)
2. `filters.saturdayOnly && filters.morningOnly && status.morning === 0` → `"이번 주 토요일 매물 ${total}건 중 오전 경기는 없습니다. '오전만'을 끄면 보입니다."`
3. `filters.saturdayOnly && !filters.includeClosed && status.morningOpen === 0 && status.morning > 0` → `"이번 주 토요일 오전 매물 ${morning}건은 모두 마감되었습니다. '마감 포함'을 켜면 보입니다."`
4. 그 외(지역·포맷 필터로 걸러진 경우 등) → `"조건에 맞는 후보가 없습니다. 지역·포맷 필터를 확인해 보세요."`

- 문구는 기존처럼 `#ranked-candidates` 안의 `<p>`로 넣는다. 스타일 변경 없음.
- `renderCards()`는 `renderBoard()`가 계산한 `status`를 재사용한다(두 번 계산하지 않도록 `renderBoard`가 `status`를 반환하거나 상위 변수에 둔다).

### 5. 데모 보정 (`matches.html`)
`test/fixtures/demo-data.json`에는 `last_seen_at`이 없어 데모가 "확인 불가"로 보인다. 기존 데모 분기(`first_seen_at`을 작성 시각 간격으로 합성하는 곳)에서 **`last_seen_at`이 없으면 합성한 `first_seen_at`과 같은 값**을 넣는다. 그러면 데모 보드가 "1시간 전"으로 보인다. 픽스처 파일은 수정하지 않는다.

### 6. 테스트 (`test/candidates.test.js`)
인라인 행으로 작성한다(픽스처 의존 없음). `today = "2026-10-19"`, `now = "2026-10-19T09:00:00.000Z"` 기준 `saturday === "2026-10-24"`.

- `candidateStatus`:
  1. **매물 없음**: 토요일 글이 없고 10/21(수) 글만 있음 → `total 0, morning 0, open 0, morningOpen 0`, `lastSeenAt`은 그 글의 `last_seen_at`.
  2. **오후만**: 10/24 토 `start_hour 13` 1건 → `total 1, morning 0, open 1, morningOpen 0`.
  3. **마감 포함**: 10/24 토 오전 2건 중 1건 `is_closed: true`, 오후 1건 → `total 3, morning 2, open 2, morningOpen 1`. 같은 입력에서 `lastSeenAt`은 세 글 중 최대 시각(순서가 뒤섞여 있어도).
  4. **last_seen 없음**: 모든 행에 `last_seen_at`이 없거나 `"invalid"` → `lastSeenAt === null`, 집계는 정상. 빈 배열 → 전부 0과 `null`.
  - 추가로: 10/17(지난 토요일) 글과 `last_seen_at`이 73시간 전인 `contact_status: "new"` 글은 `total`에서 빠진다(목록과 같은 규칙). `saturday`가 `rules.nextSaturday(today)`와 같다(`require("../js/rules.js")`로 비교).
- `candidateEmptyMessage`: 위 4개 우선순위를 각각 한 번씩 확인하는 케이스 1개(배열 순회 가능).
- 기존 "Node와 브라우저에서 DOM 없이 동일한 후보 API를 제공한다" 테스트가 그대로 통과해야 한다(두 export 키 순서 동일).

### 7. 가이드 (`docs/guide.md` 회장 편 "4. 주중: 상대팀 매칭")
첫 번째 항목 뒤에 두 줄 추가:
- "- 보드의 **마지막 수집**이 '12분 전'처럼 세 시간 안이면 수집기가 정상입니다. '지연'이 붙거나 '확인 불가'면 GitHub Actions를 확인합니다(12절)."
- "- 보드 아래 **이번 주 토요일** 줄은 필터와 무관한 전체 매물 수입니다. '매물 1건 · 오전 0건'인데 목록이 비어 있으면 고장이 아니라 오전 글이 없는 것입니다. 매물은 보통 수~금에 올라옵니다."

## 수용 기준
- [ ] `candidateStatus`·`candidateEmptyMessage`가 `js/candidates.js`에서 export되고, `test/candidates.test.js`에 §6의 케이스가 추가되어 `npm test`가 통과한다(기존 테스트 회귀 없음).
- [ ] 매칭 보드 세그먼트가 **새 후보 · 미분류 / 마지막 수집 / 내 추천** 3칸이고, "마지막 수집" 값이 `formatRelative` 형식이다. 3시간 초과면 `is-dim` + "지연", `last_seen_at`이 없으면 `is-dim` + "확인 불가". 이 칸에 `is-lit`은 쓰지 않는다.
- [ ] 보드 아래 `data-label="이번 주 토요일"` 줄이 "10/24 토 · 매물 N건 · 오전 N건 · 마감 N건" 형식이고, 매물 0건이면 "매물 0건" + `board-sub` "아직 올라온 매물이 없습니다 · 보통 수~금에 올라옵니다"가 보인다.
- [ ] 필터 체크박스·지역 칩·포맷을 바꿔도 "마지막 수집" 칸과 "이번 주 토요일" 줄의 값이 변하지 않는다.
- [ ] 후보 0건일 때 빈 상태 문구가 §4의 우선순위에 따라 바뀐다(데모에서 '오전만'을 켜고 지역을 한 곳만 골라 0건을 만들어 확인).
- [ ] 데모(`matches.html?demo=1`)에서 "마지막 수집"이 "확인 불가"가 아니라 "1시간 전"으로 보인다.
- [ ] `docs/guide.md` 회장 편 4절에 §7의 두 줄이 있다.
- [ ] 모든 HTML의 `styles.css?v=20261019d`. 375px에서 보드 세그먼트·토요일 줄이 가로 넘침 없이 들어온다.
- [ ] `scripts/*`, `supabase/*`, `js/data.js`, `DESIGN.md` 변경 없음.

## 테스트 방법
- 자동: `npm test`. `test/candidates.test.js`에 §6 케이스 추가.
- 수동(로컬: `python -m http.server 8765`, `http://localhost:8765/matches.html?demo=1`):
  1. 보드 세그먼트 3칸과 "이번 주 토요일" 줄 확인. 데모 기준(오늘이 월요일이면) "10/24 토 · 매물 6건 · 오전 5건 · 마감 1건", 마지막 수집 "1시간 전".
  2. '오전만' 해제, '마감 포함' 켜기, 지역 칩 한 곳만 선택 — 보드 값이 그대로인지 확인.
  3. 지역을 후보가 없는 한 곳만 선택해 0건을 만들고 빈 상태 문구가 §4의 4번 문구인지 확인. 브라우저 콘솔에서 `rows`의 토요일 글을 임시로 오후로 바꿀 수 없으므로 2·3번 문구는 자동 테스트로 대신한다.
  4. 375px·1280px에서 보드 캡처.
- **캡처는 PR 본문에만 첨부(드래그로 업로드)하고 레포에 커밋하지 않는다. 이미지 파일을 커밋에 포함하면 PR을 되돌려 보낸다.**

## 참고
- 재사용: `js/candidates.js` `filterCandidates`(과거·만료·마감·오전 규칙), `js/rules.js` `nextSaturday`·`displayDate`·`formatRelative`·`kstDate`, `styles.css` `.segment.is-dim`·`.board-line[data-label]`·`.board-sub`(020).
- 참고 마크업: `vote.html` 보드의 `.board-lines > .board-line[data-label="경기 일시"]`.
- `rows`의 범위: `matches.html` `loadData`가 `parsed_date >= 오늘`인 글 + 72시간 안에 본 날짜 없는 글을 합친 것이다. `last_seen_at`은 수집기가 매시간 게시판 최신 60건에 대해 갱신하므로 이 중 최대값이 마지막 수집 시각이다. 날짜 있는 글이 하나도 없는 드문 경우 "확인 불가"가 되는 것은 허용한다.
- 2026-10-19 실측: 수집 정상(`match_candidates` 게시판별 60건, `parse_ok` 55~59건), 10/24(토) 매물 1건(13~15시).
