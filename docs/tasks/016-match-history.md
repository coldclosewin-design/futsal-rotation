# [016] 경기 기록을 회칙 페이지에서 매칭 페이지 "지난 경기" 섹션으로 이동

- 브랜치: `codex/016-match-history`
- 의존: 015 (main에 머지됨)
- 예상 규모: S~M

## 배경
완료된 경기(스코어·참석 인원·상태)를 보여 주는 **경기 기록**이 `rules.html` 맨 아래에 "불러오기(팀 로그인)" 버튼으로 붙어 있다. 010a/010b 분할 때 매치 데이터가 있는 공개 페이지가 회칙뿐이어서 임시로 들어간 것으로, 회칙(규정 문서)과 경기 결과는 성격이 다르고 버튼 이름만으로는 무엇을 불러오는지 읽히지 않는다.
015에서 `matches.html` 맨 위에 **확정 매치**(다가오는 경기) 섹션이 생겼으므로, 그 바로 아래에 **지난 경기**(끝난 경기)를 두면 "우리 팀 경기"가 한 페이지에 모인다. 매칭 페이지는 이미 팀 로그인을 요구하므로 별도 버튼 없이 자동으로 보여 준다.
관련 설계는 `docs/PLAN.md` §7(화면별 핵심 동작).

## 목표
- 매칭 페이지에서 확정 매치 아래에 최근 끝난 경기(기본 5건, 펼치면 30건)가 날짜·구장·스코어(승/무/패)·상대·포맷·참석 인원·상태로 보인다.
- 회칙 페이지에는 경기 기록 섹션과 버튼이 없다. 회칙은 요약표 + 전문 + 개정 안내만 남는다.
- 매칭 페이지 제목이 "매칭 후보"에서 "매칭"으로 바뀐다(탭 이름과 일치. 보드의 "매칭 후보 · 이번 주 토요일 오전" 라벨은 그대로).

## 변경 파일
- `matches.html` — §1. `js/attendance-rules.js`, `js/data-admin.js` 스크립트를 `js/data.js` 다음에 추가(`rules.html`과 같은 순서). `<title>매칭 · FC EXICAN</title>`, `<h1>매칭</h1>`.
- `js/candidates.js` — `describeHistory(row)` 추가(§2). 기존 함수 출력 변경 금지.
- `rules.html` — §3. 섹션·스크립트 제거.
- `styles.css` — "페이지별 보정" 섹션 끝에만 추가(§1의 결과 배지 색 1개). 토큰·공용 블록 수정 금지. 스타일을 바꿨으면 모든 HTML의 `styles.css?v=` 값을 `20261017a`로 올린다(9개 파일 동일하게).
- `test/candidates.test.js` — `describeHistory` 테스트(§2의 네 경우).
- `docs/guide.md` — 팀원 편 "6. 회비·벌금과 내 현황" 아래 **더보기 → 회칙** 줄에서 "맨 아래 경기 기록(날짜·구장·스코어)이 있습니다" 구절을 지우고, 팀원 편 "3. 매칭 후보 보고 추천하기" 마지막에 `- 확정 매치 아래 **지난 경기**에서 최근 경기 결과(스코어·참석 인원)를 볼 수 있습니다.` 추가. 회장 편 "7. 경기 후: 출석과 벌금"의 "**회칙 → 경기 기록**에 남습니다"를 "**매칭 → 지난 경기**에 남습니다"로.
- `README.md` — "화면 구성"의 **회칙** 항목을 "보드 없이 회비·벌금 요약을 행 목록으로 표시하며 회칙 전문은 그대로 제공합니다."로, **매칭** 항목 끝에 "끝난 경기는 지난 경기 섹션에 스코어와 함께 남습니다." 추가.

## 변경 금지
- `index.html`, `admin.html`, `member.html`, `vote.html`, `ledger.html`, `rotation.html`, `help.html`, `js/data.js`, `js/data-admin.js`(`matchHistory`를 그대로 사용), `js/attendance-rules.js`, `js/rules.js`, `scripts/*`, `supabase/*`, `docs/rules.md`, `test/fixtures/*`, `DESIGN.md`, `CHANGELOG.md`

## 상세 요구사항

### 1. 매칭 페이지 "지난 경기" 섹션 (`matches.html`)
- 위치: `#confirmed-matches` 바로 다음, `#ranked-candidates` 앞. 마크업은 확정 매치와 같은 행 목록 부품:
  `<nav class="rows" id="match-history" aria-label="지난 경기" hidden><h2 class="row">지난 경기</h2> …행… </nav>`
- 데이터: `loadData()`의 `Promise.all`에 `ExicanData.matchHistory({ limit: 30 })`를 추가한다(`js/data-admin.js`가 이미 `ExicanData`에 붙여 둔 함수. 라이브는 매치별 출석 조회를 하므로 30건 제한 유지). 실패해도 후보 로딩은 막지 않는다: `matchHistory`만 `catch`로 `[]` 처리하고 섹션을 숨긴 뒤 `showToast("지난 경기를 불러오지 못했습니다")`.
- 표시 규칙: 기본 **5건**. 6건 이상이면 섹션 마지막에 `<button type="button" class="row-action secondary" id="history-more">전체 보기 (N건)</button>`을 가진 행을 두고, 누르면 30건까지 펼치고 버튼 행을 없앤다. 0건이면 섹션 `hidden`.
- 행 하나(`article.row`, 링크 아님):
  - `.row-main` → `.row-label` = `describeHistory(row).title`, `.row-sub` = `describeHistory(row).sub`.
  - `.row-end` → 결과 배지 `<span class="chip" data-result="win|draw|loss|none">승|무|패|상태 라벨</span>`. `data-result="win"`일 때만 보정 섹션에서 후보 카드의 확정 배지(`.candidate-badge[data-status="confirmed"]`)와 같은 점등 토큰(`--lit-ink`·`--lit-wash`)으로 강조한다. 새 색·hex 금지. 무·패·상태 라벨은 기본 칩.
  - 데모·라이브 모두 같은 코드. 데모 픽스처에는 `played` 1건(4:3)이 있다.
- 로그아웃(`role === "anon"`) 처리는 확정 매치와 동일하게 비우고 숨긴다.
- `renderConfirmed()`와 분리된 `renderHistory()` 함수로 두고, `loadData()` 끝에서 호출한다. 회원 선택(`chooseMember`)과 무관하므로 거기서는 호출하지 않는다.

### 2. `describeHistory(row)` (`js/candidates.js`)
- 입력: `matchHistory` 행(`match_date`, `start_time`, `venue`, `opponent`, `format`, `status`, `score_us`, `score_them`, `attendance_count`).
- 반환 `{ title, sub, result }`:
  - `title` = `"10/10(토) · 도봉풋살장"`(날짜는 `describeSchedule`의 날짜 부분과 같은 형식, 구장 없으면 "구장 미정") + 스코어가 둘 다 숫자면 `" · 4:3"`.
  - `result` = 스코어가 둘 다 숫자이고 `status === "played"`면 `win|draw|loss`(우리 기준), 아니면 `none`.
  - `sub` = `"상대 ○○ · 6v6 · 참석 7명 · 경기 완료"`. 상대 없으면 "상대 미정", 포맷 없으면 "포맷 미정", `attendance_count`가 숫자가 아니면 "참석 —명", 상태 라벨은 `window.ExicanAttendance?.MATCH_LABELS` 대신 **인자로 받은** `labels` 맵을 쓴다: `describeHistory(row, labels)`; 없으면 상태 코드 그대로. (candidates.js가 attendance-rules.js에 의존하지 않도록.)
- 결과 배지 텍스트: `win → "승"`, `draw → "무"`, `loss → "패"`, `none → 상태 라벨`(예: "플랩 전환", "취소").
- 테스트 네 경우: 4:3 완료(승, 제목에 스코어), 2:2 완료(무), 스코어 없는 취소(`none`, 배지 "취소"), 참석 수 없음("참석 —명").

### 3. 회칙 페이지 정리 (`rules.html`)
- `section[aria-labelledby="history-title"]` 전체(제목·버튼·메시지·목록)와 관련 스크립트 블록(`load-history` 핸들러, `historyVersion`, `onAuthChange` 콜백)을 제거한다.
- 더 이상 쓰지 않는 스크립트 태그 제거: `js/data.js`, `js/member.js`, `js/attendance-rules.js`, `js/data-admin.js`. `supabase-js` CDN과 `js/supabase.js`는 남은 코드가 `ExicanAuth`/`roleFromEmail`을 쓰지 않으면 함께 제거한다(`renderNav`가 인증 바를 그리지 않는지 `js/ui.js`에서 확인). `ExicanData.mode()`로 데모를 판단하던 자리가 있으면 `new URLSearchParams(location.search).get("demo") === "1"`로 바꾼다.
- 회칙 요약표·전문 렌더링·`rules-notice`는 변경하지 않는다. `/rules.html`과 `/rules.html?demo=1`이 PIN 모달 없이 열려야 한다(지금도 그렇다).

## 수용 기준
- [ ] `npm test` 통과(`describeHistory` 테스트 4건 포함), 기존 테스트 결과 불변
- [ ] `/matches.html?demo=1`: 확정 매치 아래 "지난 경기"에 `10/10(토) · 도봉풋살장 · 4:3` 행과 "승" 배지, 부제에 상대·6v6·참석 수·"경기 완료"가 보인다(날짜는 데모 치환 규칙에 따라 지난 토요일)
- [ ] 라이브(PIN 로그인): 끝난 경기가 없으면 섹션이 보이지 않고, 콘솔 에러 없음. 매치가 있으면 5건 → "전체 보기" → 최대 30건
- [ ] `/rules.html`에 "경기 기록"·"불러오기" 문구가 없고 `grep -n "load-history\|match-history\|history-title" rules.html`이 0건, 콘솔 에러 없음, 요약표 금액이 이전과 동일
- [ ] `rules.html`의 `<script>` 태그가 실제 사용하는 모듈만 남는다(PR 본문에 남긴 목록과 이유 기재)
- [ ] 매칭 페이지 `<title>`·`<h1>`이 "매칭"
- [ ] 375px 가로 넘침 없음, 1280px 레일 정상, 인라인 `style=`·hex·이모지 없음
- [ ] `styles.css`를 바꿨다면 9개 HTML 모두 `styles.css?v=20261017a`
- [ ] `docs/guide.md` 세 군데, `README.md` 두 군데 반영
- [ ] PR 본문에 375px 스크린샷 2장(매칭 페이지 지난 경기 섹션, 회칙 페이지 하단)

## 테스트 방법
- 자동: `npm test`
- 수동: `python -m http.server 8765` → `/matches.html?demo=1`, `/rules.html`, `/rules.html?demo=1`

## 참고
- `rules.html`의 기존 경기 기록 렌더 코드(행 템플릿·`matchHistory` 호출)를 옮기는 작업이다. `js/data-admin.js`의 `matchHistory({ limit })`, `js/attendance-rules.js`의 `MATCH_LABELS`, 015에서 만든 `matches.html`의 `renderConfirmed()`·`describeMatchDetail` 패턴, `styles.css`의 `.chip`·`.rows`·`.row-end`·`#confirmed-matches` 보정
