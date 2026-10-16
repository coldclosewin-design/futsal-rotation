# [015] 확정 매치 상세(홈 링크 + 매칭 후보 페이지 섹션)와 후보 만료 규칙

- 브랜치: `codex/015-confirmed-matches`
- 의존: 014 (main에 머지됨)
- 예상 규모: M

## 배경
실기기 사용 피드백 세 가지를 한 PR로 처리합니다.
1. 홈 보드의 확정 매치는 한 줄 텍스트(`index.html` `#home-match`)뿐이라 상대팀·메모·원본 카페 글을 볼 길이 없다.
2. 매칭 후보 페이지는 확정 후 "홈에서 확인하세요" 행(`#confirmed-home-row`)으로 되돌려 보낸다. 게다가 확정한 글은 보통 카페에서 "매치마감"으로 바뀌어 다음 수집 때 `is_closed`가 되고, 기본 필터(마감 제외)에서 카드가 사라진다.
3. 수집기(`scripts/scrape-cafe.js`)는 게시판별 최신 60건만 매시간 upsert하고 **삭제는 하지 않는다**. 60건 밖으로 밀려난 글은 더 갱신되지 않아 카페에서 나중에 마감돼도 우리 쪽은 "모집 중"으로 남고, 날짜를 못 읽은 미분류 글은 날짜 조건이 없어 영원히 목록에 남는다. `last_seen_at`(마지막으로 목록에서 본 시각)은 이미 매시간 기록되고 있으므로 이를 만료 기준으로 쓴다.

관련 설계는 `docs/PLAN.md` §3(수집기), §7(화면별 핵심 동작).

## 목표
- 홈 보드의 확정 매치 줄을 누르면 매칭 후보 페이지의 **확정 매치** 섹션으로 이동한다.
- 매칭 후보 페이지 맨 위(필터 패널 아래)에 다가오는 확정 매치가 날짜·시간·구장·상대·포맷·구장비·메모와 **카페 글** 링크로 보이고, 확정한 후보 카드는 마감돼도 기본 필터에서 사라지지 않는다.
- 수집기가 72시간 넘게 보지 못한 글은 후보 목록(순위·미분류)에서 자동으로 빠진다. 회장이 손댄 글(연락 상태가 미연락이 아님)은 예외.

## 변경 파일
- `js/candidates.js` — `filterCandidates(rows, filters, todayKst, nowIso)`에 4번째 인자 추가(선택). 만료·확정 예외 규칙은 아래 §3. `describeMatch`는 공유 문구(`js/share.js`)에서도 쓰므로 **출력 형식 변경 금지**. 새 함수 `describeMatchDetail(match)` 추가: `{ title, sub }`를 돌려준다(§1).
- `js/config.js` — `CANDIDATE_STALE_HOURS: 72` 추가(주석: "수집기가 이 시간 넘게 보지 못한 글은 후보에서 숨김").
- `js/data.js` — `candidates()`에 `seenSince` 옵션 추가: 값이 있으면 라이브 쿼리에 `.gte("last_seen_at", seenSince)`. 데모 모드에서는 `last_seen_at`이 없는 행을 통과시킨다(픽스처에 컬럼 없음). 다른 함수 수정 금지.
- `matches.html` — §1·§3. `#confirmed-home-row`와 홈 이동 시 `sessionStorage` 전달 코드(`homeLink` click 리스너)는 제거한다(섹션이 그 역할을 대신함).
- `index.html` — §2. `handedMatch`/`#home-created-match`(데모 전용 "방금 등록" 줄)는 전달 코드가 사라지므로 함께 제거한다.
- `styles.css` — "페이지별 보정" 섹션 끝에만 추가(§1·§2의 최소 선택자). 토큰·공용 블록 수정 금지.
- `test/candidates.test.js` — §3 테스트와 `describeMatchDetail` 테스트 추가.
- `docs/guide.md` — 팀원 편 "3. 매칭 후보 보고 추천하기"와 회장 편 "4. 주중: 상대팀 매칭"에 각 한 줄(§4). 다른 문장 수정 금지.
- `README.md` — "화면 구성"의 **매칭** 항목 끝에 "확정 매치 섹션과 72시간 만료" 한 구절.

## 변경 금지
- `scripts/*`, `supabase/*`(DB·수집기 변경 없음. 만료는 화면 규칙이다), `js/share.js`, `js/rules.js`, `js/data-admin.js`, `admin.html`, `vote.html`, `ledger.html`, `rotation.html`, `member.html`, `help.html`, `rules.html`, `DESIGN.md`, `CHANGELOG.md`(릴리스 때 Claude가 정리), `test/fixtures/demo-data.json`

## 상세 요구사항

### 1. 매칭 후보 페이지 "확정 매치" 섹션 (`matches.html`)
- 위치: `#matches-message`·`#matches-retry` 다음, `#ranked-candidates` 앞. 마크업은 기존 행 목록 부품을 그대로 쓴다:
  `<nav class="rows" id="confirmed-matches" aria-label="확정 매치" hidden><h2 class="row">확정 매치</h2> …행…</nav>`
  (`.rollout-page .rows > h2.row` 스타일이 이미 있다.)
- 데이터: `knownMatches` 중 `status === "scheduled"`이고 `match_date >= today()`인 것을 날짜·시작 시각 오름차순. 0건이면 섹션 `hidden`. `loadData()`와 매치 등록 성공 직후(`knownMatches` 갱신 뒤) `renderConfirmed()`를 호출한다. 로그아웃(`role === "anon"`) 시 비운다.
- 행 하나(`article.row`, 링크가 아님):
  - `.row-main` → `.row-label` = `describeMatchDetail(match).title` = `"10/17(토) 08:00~10:00 · 도봉풋살장"`(날짜는 `describeSchedule`과 같은 형식, 구장 없으면 "구장 미정").
  - `.row-sub` = `describeMatchDetail(match).sub` = `"상대 ○○ · 6v6 · 구장비 60,000원"` + 메모가 있으면 `" · 메모내용"`. 상대 없으면 "상대 미정", 포맷 없으면 "포맷 미정".
  - `.row-end` → `candidate_article_id`가 있으면 `<a class="row-action" target="_blank" rel="noopener">카페 글</a>`(`EXICAN_CONFIG.CAFE.ARTICLE_URL(article_id, menu_id)`; `menu_id`는 `rows`에서 같은 `article_id`를 찾아 쓰고, 못 찾으면 `?menuid=` 없이 article만). 없으면 `.row-end`를 비운다.
  - 회장(`isAdmin()`)이면 `.row-end`에 `<a class="row-action secondary" href="admin.html">관리</a>`를 **카페 글 링크 뒤에** 추가(데모는 `admin.html?demo=1`). `.row-action`을 재사용하고 보정 섹션에서 `.row-end .secondary` 왼쪽 간격 8px만 둔다.
- 섹션 `id="confirmed-matches"`가 홈 링크의 앵커다. 페이지 진입 시 해시가 `#confirmed-matches`이고 섹션이 보이면 데이터 로드 뒤 `scrollIntoView({ block: "start" })` 한 번.
- 확정 후보 카드: `contact_status === "confirmed"`인 행은 `includeClosed`가 꺼져 있어도 **기본 목록에 남긴다**(§3 규칙 b). 카드에는 이미 "확정" 배지가 붙는다.
- 375px에서 `.row-label`·`.row-sub`가 줄바꿈되고 가로 넘침이 없어야 한다(`overflow-wrap: anywhere`는 `.rollout-page .row-label`에 이미 있음).

### 2. 홈 보드 링크 (`index.html`)
- `#home-match`는 `<p class="board-line">`을 유지하되, 확정 매치가 있을 때 내용을 `<a id="home-match-link" href="matches.html#confirmed-matches">텍스트</a>`로 넣는다(데모는 `pageUrl()`로 `?demo=1` 유지 → `matches.html?demo=1#confirmed-matches`). 텍스트는 지금처럼 `describeMatch(nextMatch)`. 없을 때는 지금처럼 "확정된 매치가 없습니다" 텍스트만.
- 링크 끝에 `<span class="board-link-hint">상세</span>`를 붙인다. 스타일(보정 섹션): `.board-line a { color: inherit; text-decoration: underline; text-underline-offset: 3px; }`, `.board-link-hint { margin-left: 8px; font-size: var(--fs-label); color: var(--board-muted); }`. 새 색·hex 금지.
- `.board-line::before`("확정 매치" 라벨)와 점등 애니메이션은 그대로.
- `#home-created-match`와 `handedMatch` 관련 코드 제거(변경 파일 참고). 데모에서 매치를 확정한 뒤 홈으로 오면 픽스처의 확정 매치만 보이는 것이 정상이다(데모 데이터는 메모리 전용).

### 3. 후보 만료 규칙 (`js/candidates.js`, `matches.html`, `index.html`)
`filterCandidates(rows, filters, todayKst, nowIso)`:
- (a) **만료**: `nowIso`가 주어지고 행에 `last_seen_at`이 있으며 `Date.parse(nowIso) - Date.parse(last_seen_at) > staleHours * 3600000`이면 제외한다. 순위·미분류 둘 다 적용. `last_seen_at`이 없거나 파싱되지 않으면 제외하지 않는다. `nowIso`가 없으면(기존 호출) 규칙을 적용하지 않는다(기존 테스트 유지).
  - 예외: `contact_status !== "new"`인 행(회장이 연락 상태를 바꾼 글)은 만료시키지 않는다.
  - `staleHours`는 `filters.staleHours`(기본 72)로 받는다. 호출부는 `EXICAN_CONFIG.CANDIDATE_STALE_HOURS`를 넘긴다. `DEFAULT_FILTERS`·`normalizeFilters`에는 넣지 않는다(저장되는 사용자 필터가 아님).
- (b) **확정 예외**: `includeClosed`가 꺼져 있어도 `contact_status === "confirmed"`인 행은 `is_closed`를 무시하고 남긴다. 과거 날짜 제외 규칙은 그대로.
- 호출부: `matches.html` `renderCards()`와 보드 집계(`renderBoard()`의 `defaults`), `index.html` 후보 위젯 모두 `new Date().toISOString()`을 4번째 인자로, `staleHours`를 필터에 넘긴다.
- `matches.html`의 **미분류 보충 쿼리**(현재 `ExicanData.candidates({ includeClosed: true })`, 전체 행을 가져옴)에 `seenSince: new Date(Date.now() - CANDIDATE_STALE_HOURS * 3600000).toISOString()`을 넘겨 서버에서 잘라낸다. 날짜 있는 쿼리(`from: today()`)는 `parsed_date`로 이미 제한되므로 그대로 둔다.
- 데모 픽스처에는 `last_seen_at`이 없다. 픽스처를 바꾸지 말고 "없으면 신선" 규칙으로 데모 화면(후보 4건 + 미분류 1건)을 유지한다.

### 4. 문서 한 줄씩 (`docs/guide.md`)
- 팀원 편 §3 목록 끝: `- 게시판에서 밀려나 수집기가 3일 넘게 보지 못한 글은 목록에서 자동으로 빠집니다. 확정된 매치는 목록 맨 위 **확정 매치**에 카페 글 링크와 함께 남습니다.`
- 회장 편 §4 "같은 매치의 구장비는…" 앞: `- 확정한 매치는 매칭 탭 맨 위 **확정 매치** 섹션에 보입니다(카페 글·관리 바로가기). 연락 상태를 바꾼 글은 3일 만료 규칙에서 제외되니, 불발이면 **거절·불발**로 바꿔 두세요.`

## 수용 기준
- [ ] `npm test` 통과. 추가 테스트: (1) `last_seen_at`이 73시간 전이면 순위·미분류 모두에서 빠진다 (2) `last_seen_at` 없음은 유지 (3) 73시간 전이라도 `contact_status: "contacted"`면 유지 (4) `is_closed: true` + `contact_status: "confirmed"`는 기본 필터에서 유지, `"new"`면 제외 (5) `describeMatchDetail`의 title/sub 형식(상대·메모 유무 각각)
- [ ] 기존 `candidates.test.js`·`share.test.js` 결과 불변(`describeMatch` 출력 동일)
- [ ] `/matches.html?demo=1`: 회장(데모는 회장 멤버 선택)으로 후보 하나를 확정하면 새로고침 없이 "확정 매치" 섹션에 행이 생기고, 카페 글 링크가 해당 `article_id`로 열린다. 섹션은 매치가 0건이면 보이지 않는다
- [ ] `/index.html?demo=1`: 보드 확정 매치 줄이 링크이며 누르면 `matches.html?demo=1#confirmed-matches`로 이동해 섹션 위치로 스크롤된다. 확정 매치가 없을 때는 링크가 아니다
- [ ] 라이브(PIN 로그인): 확정 매치 섹션에 카페 글 링크, 회장 로그인 시 "관리" 링크가 추가로 보인다
- [ ] 375px 가로 넘침 없음, 1280px 레일 정상, 콘솔 에러 없음, 인라인 `style=`·hex·이모지 없음
- [ ] `confirmed-home-row`, `exican_demo_match_handoff`, `home-created-match`가 저장소에서 사라진다(`grep` 0건)
- [ ] `docs/guide.md` 두 줄, `README.md` 한 구절 반영
- [ ] PR 본문에 375px 스크린샷 3장(홈 보드 링크, 확정 매치 섹션(팀원), 확정 매치 섹션(회장))

## 테스트 방법
- 자동: `npm test`
- 수동: `python -m http.server 8765` → `/matches.html?demo=1`(확정 → 섹션), `/index.html?demo=1`(링크 → 앵커), 필터 "마감 포함" 토글로 확정 카드 잔존 확인. 만료 규칙은 테스트로만 검증(데모 픽스처에 `last_seen_at` 없음).

## 참고
- `js/candidates.js`의 `filterCandidates`·`describeSchedule`·`describeMatch`, `matches.html`의 `openConfirmation`(`knownMatches` 갱신 지점)·`loadData`, `index.html`의 `pageUrl()`·`updateWeek()`
- `styles.css` `.rows`/`.row`/`.row-end`/`.row-action`/`.board-line`, `.rollout-page .rows > h2.row`
- 수집기 동작(참고만): `scripts/scrape-cafe.js` `SCRAPER_COLUMNS`에 `last_seen_at` 포함, 게시판당 2페이지 × 30건
