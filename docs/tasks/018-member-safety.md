# [018] 팀원 안전 묶음 — 투표 링크 착지, 매치·투표 연결, 배정표 로그인, 불참 대비, 토스트, 홈 "내 투표"

- 브랜치: `codex/018-member-safety`
- 의존: 017 검토(main에 머지됨). 코드 선행 의존 없음.
- 예상 규모: M (S 항목 7개 묶음)

## 배경
017 검토(`docs/reviews/017-comparison.md` §5-1)에서 합의한 "팀원이 잘못 투표하거나 벌금을 억울하게 무는 것"을 막는 작은 수정 묶음이다. 모두 기존 함수·부품으로 끝나는 S 규모라 한 PR로 묶는다. 관련 설계는 `docs/PLAN.md` §7(화면별 핵심 동작)·§12(리스크).

## 목표
- 홈에서 복사한 투표 링크와 홈의 투표 버튼이 **항상 그 투표**에 착지한다(특별 투표가 토요일보다 앞서도).
- 확정 매치가 같은 날짜의 투표와 반드시 연결된다(`poll_id`).
- 배정표도 다른 화면처럼 팀 로그인을 요구한다.
- 불참 칩 글자가 AA 대비를 넘고, 투표 토스트에 이름이 붙고, 긴 오류 토스트를 읽을 수 있고, 홈 투표 카드에 "내 투표"가 보인다.

## 변경 파일
- `vote.html` — §1(URL `poll` 파라미터 우선), §5(토스트 이름), §6(이름 변경 안내)
- `index.html` — §1(링크에 id), §7(내 투표 줄·마감 후 라벨)
- `js/share.js` — §1(`buildVoteShare`가 받은 `pageUrl`을 그대로 쓰므로 호출부에서 id가 붙은 URL을 넘긴다. 함수 시그니처 변경 금지)
- `matches.html` — §2(매치 등록 시 같은 날짜 투표 연결)
- `rotation.html` — §3(`requireTeam`)
- `styles.css` — §4(불참 칩 대비). "페이지별 보정" 섹션 끝에 `/* 018 */` 블록으로만 추가. 바꿨으면 모든 HTML의 `styles.css?v=`를 `20261019a`로.
- `js/ui.js` — §5(`showToast(msg, ms)`)
- `js/member.js` — §6
- `test/share.test.js`, `test/polls.test.js`, `test/ui.test.js` — 아래 테스트 방법
- `docs/guide.md` — 팀원 편 "2. 참석 투표"의 칩 색 설명 한 줄(§4)과 "이름을 잘못 골랐어요" 항목(§6)

## 변경 금지
- `js/data.js`, `js/data-admin.js`, `js/rules.js`, `supabase/*`, `scripts/*`, `admin.html`, `ledger.html`, `DESIGN.md` — 019·020에서 다룬다.
- 투표 삭제·취소 버튼 배치, 보드 글자 크기, 참석 칩 색 — 020 범위.

## 상세 요구사항

### 1. 투표 링크가 특정 투표에 착지
- `vote.html` `loadPoll(preferredId = poll?.id)`(약 247행): 최초 호출 때 `new URLSearchParams(location.search).get("poll")`이 있으면 그 id를 `preferredId`로 쓴다. 이후 전환 칩 클릭은 지금처럼 id를 넘긴다. URL의 id가 목록에 없으면(삭제·취소됨) 기존 규칙(진행 중 → 첫 투표)으로 폴백하고, `page-message`에 "링크의 투표를 찾을 수 없어 현재 투표를 보여 줍니다"를 한 번 띄운다(토스트 아님, 상태 문구).
- `index.html`: `#weekly-poll-link`의 `href`와 "링크 복사"(`share-vote`, `buildVoteShare(…, pageUrl)`)에 넘기는 URL에 `?poll=<weeklyPoll.id>`를 붙인다(데모는 `&demo=1` 유지, 기존 `pageUrl()` 헬퍼로 조립). `#home-special-polls` 링크는 첫 특별 투표 id를 붙인다. 투표가 없으면 파라미터 없이 `vote.html`.
- 복사 문구(`share.js`)의 본문은 바꾸지 않는다. 👉 뒤 URL만 달라진다.

### 2. 매치 ↔ 투표 연결을 날짜로
- `matches.html` 약 546행 `api.buildMatchRow(row, fields, { presidentId, poll })`에 넘기는 `poll`을 "가장 이른 투표(`currentPoll`)"가 아니라 **`upcomingPolls()`에서 `match_date === fields.match_date`인 투표**로 바꾼다. 없으면 `null`(기존 `buildMatchRow`가 날짜 불일치 시 null을 넣는 동작은 그대로 유지되므로 결과는 같다). 582행의 `currentPoll()` 호출은 `upcomingPolls()`로 바꾸고 다른 용도(보드 요약 등)가 있으면 첫 항목을 그대로 쓴다.
- `js/candidates.js`는 수정하지 않는다.

### 3. 배정표 로그인
- `rotation.html` 약 110행: 데모가 아니면 `ExicanAuth.renderAuthBar()` 뒤에 `role = await ExicanAuth.requireTeam()`을 호출한다(`vote.html` 312행과 같은 패턴). 로그인 뒤 기존 초기화(통합 상태·버튼 활성)가 이어지게 한다. 회장이고 투표·매치가 연결돼 있으면 **"이번 주 참석자 불러오기"를 자동 실행**한다(269행 클릭 핸들러 본문을 함수로 빼서 호출). 자동 실행 뒤 토스트는 띄우지 않는다(버튼 수동 클릭 때만).

### 4. 불참 칩 대비
- `styles.css` `.vote-member-list li[data-choice="absent"]`의 글자색을 `var(--ink-3)`로 올린다(배경 투명·점선 테두리는 유지). `time` 요소도 같은 색. 흰 배경 대비 4.5:1 이상이어야 한다(`#6b7280` on `#fff` = 4.83:1).
- `docs/guide.md` 팀원 편 "2. 참석 투표"의 칩 설명을 "참석은 초록 칩, 불참은 회색 점선 칩(글자 진함), 미투표는 흰 칩에 초록 점"으로 유지하되 문구가 바뀌면 맞춘다(참석 색 자체는 020에서 다룸).

### 5. 토스트
- `js/ui.js` `showToast(msg, ms)`: 두 번째 인자가 없으면 `Math.max(1800, msg.length * 45)`ms. 기존 호출은 바꾸지 않아도 자동으로 길어진다.
- `vote.html` 276행 투표 토스트를 `${member.name} · 참석으로 저장했습니다`(불참 동일) + 지각 꼬리로 바꾼다.

### 6. 이름 변경 안내
- `js/member.js` `renderBadge`의 "변경" 클릭 → 이름 선택 모달 상단에 한 줄: "이전 이름(○○○)으로 한 투표는 그대로 남습니다. 잘못 골랐다면 회장에게 알려주세요." (현재 저장된 이름이 있을 때만). 모달 부품·버튼은 기존 그대로.
- `docs/guide.md` 팀원 편 FAQ "이름을 잘못 골랐어요"에 같은 문장을 덧붙인다.

### 7. 홈 "내 투표"
- `index.html` 투표 카드(`#weekly-poll-summary` 아래)에 `<p id="home-my-vote" class="home-meta">` 한 줄: 저장된 내 id(`ExicanMember.getId()`)의 표가 있으면 "내 투표: 참석 · 2시간 전"(`ExicanRules.formatRelative`), 없고 진행 중이면 "아직 투표하지 않았습니다", 투표가 없거나 이름 미선택이면 숨김. 데이터는 이미 조회된 `votes`를 쓴다(추가 요청 금지).
- 마감(`closed`)·취소 상태면 `#weekly-poll-link` 라벨을 "현황 보기"로.

## 수용 기준
- [ ] `vote.html?poll=<id>`로 열면 그 투표가 선택되고, 없는 id면 폴백 + 상태 문구.
- [ ] 홈 "링크 복사" 문구의 URL과 "투표하기" href에 정기 투표 id가 들어간다(데모에서 `&demo=1` 유지).
- [ ] 매치 등록 시 `poll_id`가 같은 날짜 투표 id다(데모: 10/24 매치 등록 → `demo-poll-1`). 특별 투표만 있고 날짜가 다르면 null.
- [ ] 배정표를 비로그인으로 열면 PIN 모달이 뜬다(데모 제외). 회장 로그인 + 연결 상태면 참석자가 자동으로 체크된다.
- [ ] 불참 칩 글자색이 `rgb(107,114,128)`이고 점선 테두리는 유지.
- [ ] 투표 토스트에 이름이 들어가고, 60자 오류 토스트가 2.7초 이상 보인다.
- [ ] 홈 투표 카드에 "내 투표" 줄이 보이고 마감 후 버튼이 "현황 보기"다.
- [ ] `npm test` 통과. 375px 가로 넘침 없음.

## 테스트 방법
- 자동: `test/share.test.js`에 id가 붙은 URL이 그대로 문구에 들어가는 케이스; `test/ui.test.js`에 `showToast` 지속시간 계산(순수 함수로 분리: `toastDuration(msg, ms)` export); `test/polls.test.js` 또는 `test/candidates.test.js`에 날짜 일치 투표 선택 헬퍼 테스트(헬퍼를 `matches.html` 인라인이 아니라 작은 함수로 두면 됨).
- 수동: `python -m http.server 8765` → `vote.html?demo=1&poll=demo-poll-special`로 특별 투표 착지 → `index.html?demo=1`에서 링크 복사 문구 확인 → 매칭에서 매치 등록 → 배정표 자동 불러오기 → 375px 캡처.

## 참고
- 017 검토: `docs/reviews/017-claude-ux-review.md` B1·B13·B14·B15·B18·B19, `017-codex-ux-review.md` B03.
- `rules.formatRelative`, `ExicanMember.getId/renderBadge`, `pageUrl()`(index.html 87행) 재사용.
