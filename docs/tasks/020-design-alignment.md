# [020] 디자인 정리 — 규칙 문서 갱신, 참석 칩 무채색, 취소/삭제 분리, 열 관리 모달, 날짜 표기, 모바일 표 열 순서

- 브랜치: `codex/020-design-alignment`
- 의존: 019 (main에 머지된 뒤 시작)
- 예상 규모: M

## 배경
017 검토에서 10/18 가독성 변경과 `DESIGN.md`가 충돌한 네 가지를 회장이 결정했다(`docs/reviews/017-claude-ux-review.md` §F, `017-comparison.md` §5-3): **날짜 확대는 유지하고 규칙에 추가**, 참석 칩은 무채색으로, 취소 버튼은 분리하고 삭제만 단독, 열 삭제 ×는 모달로. 여기에 Codex가 찾은 날짜 표기 혼재와 모바일 표 열 순서를 함께 정리한다.

## 목표
- `DESIGN.md`와 화면이 다시 일치한다(규칙을 바꾼 곳은 문서에, 되돌린 곳은 화면에).
- 모바일에서 장부·멤버 표의 핵심 열이 첫 화면에 보인다.

## 변경 파일
- `DESIGN.md` — §1
- `styles.css` — §1~§4. 10/18에 붙인 `/* 017 */`~`/* 019b */` 블록을 **정리**(삭제·수정 허용). 토큰 블록은 §1의 추가 한 줄만. 모든 HTML의 `styles.css?v=`를 `20261019c`로.
- `vote.html`, `admin.html` — §2(참석 칩), §3(취소/삭제 분리), §4(열 관리 모달)
- `js/rules.js` — §5(표시용 날짜 포맷 한 곳)
- `index.html`, `matches.html`, `rotation.html`, `ledger.html`, `member.html` — §5(날짜 표기), §6(표 열 순서·보드 숫자 라벨)
- `docs/guide.md` — 칩 색·열 삭제·취소 위치 문구
- `test/rules.test.js` — §5 포맷 테스트

## 변경 금지
- `js/data.js`, `js/data-admin.js`(열 추가·삭제 API는 그대로 호출만), `supabase/*`, `scripts/*`.
- 018·019가 넣은 동작(링크 id, 확인창, 펼침 보존 등)을 되돌리지 않는다.

## 상세 요구사항

### 1. DESIGN.md 규칙 갱신 (유지하기로 한 것)
- Typography에 네 번째 크기 **"heading: 22px / 700 / -0.02em, 보드 제목(`.page-board .board-title`)과 관리 카드 날짜(`.poll-card-date`)에만"** 추가. `styles.css` 토큰 블록에 `--fs-heading: 22px` 한 줄을 추가하고 732·737행의 `clamp(22px, 6vw, 28px)`를 `var(--fs-heading)`으로 바꾼다(모든 폭에서 22px 고정. One Display Rule과의 충돌을 줄이기 위해 28px까지 키우지 않는다).
- "부품 통일 규칙"의 "보드 제목 15/700"을 "보드 제목 heading(22/700)"으로 고친다.
- Board 절에 "보드 안 링크는 허용: 확정 매치 상세(홈), 경기 일시(투표), 월 이동(장부). 밑줄 + `board-link-hint` 라벨 형식만 쓴다" 예외를 적는다(015·017 결정 반영).
- 관리 투표 카드의 제목 `h3`(현재 12px 라벨)을 15/700 `ink`로 올려 날짜(22) > 제목(15) > 메타(12) 위계가 되게 한다(`.operations-poll h3` 규칙 추가).

### 2. 참석 칩 무채색 (되돌리기)
- `styles.css` `.vote-member-list li[data-choice="attend"]`를 `{ color: var(--ink); border-color: var(--seam-strong); background: var(--panel-solid); }`로. 불참(018에서 `ink-3`·점선)·미투표(흰 칩 + 점등 점)는 유지. `.vote-counts li` 15px 규칙 삭제(칩은 12px). `.board-sub` weight 500 → 600. `th.operations-custom-col` ink-2 규칙 삭제.
- 관리 투표 카드의 집계(`.vote-counts`)는 칩 대신 **`.segments` 3칸**(참석/불참/미투표, 미투표>0이고 진행 중이면 `is-lit`)으로 바꾼다. 카드 안이라 보드 톤이 아니므로 `.segment` 배경은 `--panel-solid`, 선은 `--seam`으로 두는 `.operations-poll .segments` 보정 규칙을 추가한다.
- `docs/guide.md` 팀원 편 칩 설명: "참석은 진한 테두리 칩, 불참은 회색 점선 칩, 미투표는 초록 점이 켜진 칩".

### 3. 취소/삭제 분리
- `vote.html` 회장 도구: `.home-actions`로 묶인 두 버튼을 풀고, "투표 취소/취소 해제"를 `.rows.flat-rows`의 세 번째 행(`row-label` "투표 취소", `row-sub` "이번 경기 없음 · 기록 유지", `row-action` 버튼 "취소"/"해제")으로 옮긴다. "투표 삭제"만 `.btn-destructive` 전폭 단독(24px 위 마진, 588행 규칙이 자동 적용). 그 아래 힌트 문구는 유지.
- `admin.html` 투표 카드도 같은 구조. `styles.css` 726행(`.rollout-page .home-actions .btn-destructive { grid-column:auto; margin-top:0 }`) 삭제.
- 삭제 확인창의 버튼 순서는 "닫기"(secondary) 위, "삭제"(destructive) 아래 세로 쌓기(`.home-actions` 없이).

### 4. 열 관리 모달
- `admin.html` 멤버 탭: 머리글의 × 버튼을 없애고(열 이름만), "열 추가" 버튼을 **"열 관리"**로 바꾼다. 모달: 현재 사용자 정의 열 목록(각 행 `row-label` 열 이름 + `row-action` 36px 보조 버튼 "삭제" → 기존 삭제 확인창), 아래 "새 열 이름" 입력 + "추가" 버튼(기존 `addMemberColumn`). 열이 없으면 목록 대신 "아직 추가한 열이 없습니다".
- `styles.css` 745~751행 `.operations-col-remove` 규칙 삭제. `docs/guide.md` 회장 편 10절 "열 이름 옆 ×" → "열 관리에서 삭제".

### 5. 표시용 날짜 포맷 통일
- `js/rules.js`에 `displayDate(dateStr, { weekday = true } = {})` 하나를 두고 출력은 **"10/24 토"**(DESIGN.md Concept의 형식). `pollDateLabel`은 그대로 두되 내부에서 같은 요일 계산을 공유한다. 긴 형식 `longDate`("10월 24일 토요일")는 경기 일시 줄에만 남긴다.
- 적용: 홈 보드(이미 "10/24 토"), 투표 전환 칩·제목(`pollHeading` → "10/24 토 정기 풋살"), 관리 투표 카드 날짜와 메타("경기 2026-10-24" → "경기 10/24 토"), 관리 매치 카드, 장부 항목 날짜(연도가 필요한 장부 상세 표는 "2026-10-24" 유지 허용), 배정표 보드(이미 "10/24 토"). `<input type="date">` 값은 그대로.
- `test/rules.test.js`에 `displayDate` 케이스 3개.

### 6. 모바일 표 열 순서와 보드 숫자 라벨
- `ledger.html` 멤버별 표: 열 순서를 **이름 · 미납 · 회비 · 면제 · 벌금 · …**로 바꿔 375px 첫 화면(약 300px)에 이름과 미납이 들어오게 한다. 헤더·셀 순서를 함께 바꾸고 `colspan`을 맞춘다.
- `admin.html` 멤버 표: 열 순서를 **이름 · 편집 · 활동 · 회장 · …**로(편집 버튼을 두 번째 열로). `width: 100%` 규칙은 마지막 열에 그대로 두되 마지막 열이 바뀌므로 선택자를 확인한다.
- 보드 숫자 라벨: `rotation.html` 보드 "0" → `board-count`로 "0 명 선택", `matches.html` 보드 "4" → "4 건 후보" + 라벨을 "매칭 후보 · 이번 주 토요일 오전(전체)"로 해 필터와 무관함을 밝힌다.
- `member.html` 보드 "받을 돈 7,500 원": 라벨 "받을 돈"을 왼쪽 `.label`로 내리고 숫자+단위를 `board-count`(`<small>원</small>`)로 묶어 375px에서 한 줄.

## 수용 기준
- [ ] `DESIGN.md`에 heading 크기·보드 내 링크 예외가 적혀 있고, `--fs-heading` 토큰이 보드 제목·관리 카드 날짜에 쓰인다(28px 없음).
- [ ] 참석 칩이 무채색(진한 테두리), 미투표만 점등. 관리 투표 카드 집계가 세그먼트 3칸.
- [ ] 투표 탭·관리 카드에서 "투표 취소"는 행 부품, "투표 삭제"만 점선 단독.
- [ ] 멤버 표 머리글에 × 없음. "열 관리" 모달에서 추가·삭제가 된다.
- [ ] 화면의 날짜 표기가 "10/24 토"(경기 일시 줄과 날짜 입력·장부 상세 제외)로 통일.
- [ ] 375px 장부·멤버 표 첫 화면에 이름+미납 / 이름+편집이 보인다. 배정표·매칭·내 현황 보드 숫자에 단위가 붙고 줄바꿈 없음.
- [ ] `npm test` 통과, 375px 가로 넘침 없음.

## 테스트 방법
- 자동: `test/rules.test.js` `displayDate`·`pollHeading` 갱신, 기존 테스트 회귀 없음.
- 수동: 데모 전 화면 375px·1280px 캡처를 PR에 첨부(특히 투표·관리 투표·관리 멤버·장부·내 현황).

## 참고
- 결정 근거: `docs/reviews/017-claude-ux-review.md` §F, `017-codex-ux-review.md` B01·B08·B09·B13·B15·B16, `017-comparison.md` §5-3.
- Codex B09(관리 탭 스트립 위치)·B14(회칙·도움말 보드 없음)는 이번 범위에서 제외. 문서 문구만 "보드가 있는 화면은…"으로 좁힌다(`DESIGN.md` 페이지 구조 규칙, `docs/guide.md` 화면 구성).
