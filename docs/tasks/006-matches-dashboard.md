# [006] 매칭 후보 대시보드 + 연락 상태 + 문자 템플릿 + 매치 확정

- 브랜치: `codex/006-matches-dashboard`
- 의존: 003, 005, 007 (모두 main에 머지됨). 009와 동시 진행되므로 **`js/data.js`, `js/rules.js`는 수정하지 않는다**
- 예상 규모: L

## 배경
수집기가 매시간 `match_candidates`에 후보 글을 쌓고 있습니다(현재 240건+). 회장이 토요일 오전 후보를 한눈에 보고,
팀원 반응(👍)을 모으고, 글을 열어 확인한 연락처를 기록하고, 문자를 보내고, 확정되면 `matches`에 등록하는 화면입니다
(`docs/PLAN.md` §1, §7). 데이터 접근 함수는 007에서 만든 `ExicanData`(`candidates`, `reactions`, `toggleReaction`,
`updateCandidate`, `createMatch`, `matches`, `currentPoll`, `votes`, `members`)를 그대로 사용합니다. 데모 모드(`?demo=1`)도 동일하게 지원해야 합니다.

## 목표
- 팀원: 이번 주 토요일 오전 후보를 점수순으로 보고 👍를 누를 수 있다.
- 회장: 후보에 연락처·구장비·메모·상태를 기록하고, 문자 템플릿을 한 번에 복사/전송하고, 확정 시 매치를 등록한다.
- 홈 카드 "매칭 후보"·"확정 매치"가 실제 데이터를 보여준다.

## 변경 파일
- (신규) `matches.html`
- (신규) `js/candidates.js` — 필터·정렬·표시용 순수 함수 (Node export + `window.ExicanCandidates`)
- (신규) `js/sms-template.js` — 문자 문구 생성·`sms:` 링크 순수 함수
- `js/config.js` — `SMS_TEMPLATE`, `TEAM_NAME` 추가 (아래 §5)
- `js/parse-title.js` — venue 정리 버그 수정 (아래 §7)
- `index.html` — "매칭 후보"(상위 3건), "확정 매치"(다음 매치) 카드 채우기
- `test/fixtures/demo-data.json` — `match_candidates` 10건, `matches` 1건 추가 (아래 §8)
- `styles.css` — 필터 바·후보 카드·배지·관리 패널 스타일
- (신규) `test/candidates.test.js`, (신규) `test/sms-template.test.js`; `test/parse-title.test.js` 기대값 1곳 수정
- `README.md` — 매칭 대시보드 절

## 변경 금지
- `js/data.js`, `js/rules.js`, `js/member.js`, `js/supabase.js`, `vote.html`, `scripts/*`, `supabase/*`, `test/fixtures/cafe-titles.json`, `test/fixtures/api-menu-623.json`

## 상세 요구사항

### 1. 데이터 로드
- `ExicanAuth.requireTeam()` 후 `ExicanData.candidates({ from: 오늘(KST), includeClosed: true })`로 가져온 뒤 **클라이언트에서** 필터한다(마감 포함 토글 때문). 같이 `ExicanData.members()`, `ExicanData.currentPoll()` + `votes` (문자 템플릿의 인원 수용), `ExicanData.reactions(articleIds)`.
- 로딩 중 문구, 실패 시 토스트 + 재시도 버튼.

### 2. `js/candidates.js` 순수 함수
- `filterCandidates(rows, filters, todayKst)` — `filters = { menuIds: number[]|null, saturdayOnly: bool, morningOnly: bool, formats: string[]|null, includeClosed: bool, includeUnparsed: bool }`.
  - `parsed_date < today` 제외(항상). `saturdayOnly` → `weekday === "토"`. `morningOnly` → `start_hour !== null && start_hour < 12`. `formats` → `parsed_format`에 포함. `includeClosed=false` → `is_closed` 제외. `includeUnparsed=false` → `parse_ok=false` 제외.
  - `parse_ok=false`인 행은 saturdayOnly/morningOnly 조건을 적용하지 않고 **맨 아래 "미분류" 그룹**으로 반환: 반환값 `{ ranked: rows[], unparsed: rows[] }`.
  - `ranked` 정렬: `scraper_score` desc → `write_ts` desc.
- `describeSchedule(row)` → `"10/17(토) 08~10시"`, 시간 없으면 `"10/17(토) 시간 미정"`, 날짜 없으면 `"일정 미분류"`.
- `nextStatus(status)` → `new→contacted→replied→confirmed` 순서 및 라벨 `{ new: "미연락", contacted: "문자 보냄", replied: "답장 옴", confirmed: "확정", rejected: "거절/불발" }` export.

### 3. 화면 (matches.html)
- 상단 필터 바(sticky): 지역 칩(전체 + `CAFE.MENUS` 4개, 다중 선택), 토글 "토요일만"(기본 on), "오전만"(기본 on), 포맷(전체/5v5/6v6), "마감 포함"(기본 off), "미분류 보기"(기본 on). 필터 상태는 localStorage `exican_match_filters`에 저장. 결과 수 표시 "후보 7건 (미분류 3건)".
- 후보 카드(점수순):
  - 제목 = 카페 글 링크(`CAFE.ARTICLE_URL`, `target="_blank" rel="noopener"`), 옆에 점수 작게.
  - 배지: `menu_name`, `head_name`(있으면), `describeSchedule`, 포맷(`5v5`/`6v6`), `is_closed`면 "마감", `parse_ok=false`면 "미분류", `contact_status !== "new"`면 상태 라벨 배지(색 구분).
  - 메타: `formatRelative(write_ts)` 작성, 댓글 N, 조회 N.
  - 👍 버튼 + 수. 누르면 `ExicanMember.ensure(members)`로 내 이름 확보 후 `toggleReaction`. 내 반응이면 강조. 반응한 이름 목록은 버튼 title/툴팁 + 탭하면 토스트로.
- **회장 패널**(role `admin`일 때 카드 하단 "관리" 펼침):
  - 입력: 연락처(`type=tel`), 구장비(원, number), 우선순위(없음/1/2/3), 메모(textarea).
  - 상태 버튼 4개: "문자 보냄", "답장 옴", "확정", "거절". 현재 상태 강조.
  - "저장" → `updateCandidate(article_id, { phone, memo, our_priority, contact_status, admin_updated_at: now })`. 구장비는 `memo`가 아니라 확정 모달의 `cost`로만 사용(후보 테이블에 cost 컬럼 없음) → 입력값은 localStorage에 임시 보관.
  - 문자: "문자 문구 복사", "문자 앱 열기"(`sms:` 링크, 연락처 없으면 비활성). 문구 미리보기 접기/펼치기.
  - "확정" 클릭 시 **매치 확정 모달**: match_date(parsed_date), start_time(`HH:00`), end_time, venue, opponent(빈칸), cost(위 구장비), format(parsed_format 첫 값), memo. 저장 → `createMatch({ ..., candidate_article_id, arranged_by: 회장 member id(members에서 is_president), poll_id: currentPoll이 같은 날짜면 그 id, status: "scheduled" })` → 성공 시 `updateCandidate(..., contact_status: "confirmed")` → 토스트 "매치 등록됨" + 홈 링크.
- 팀 세션(admin 아님)에서는 회장 패널이 보이지 않고, 연락처는 **표시하지 않는다**(저장돼 있어도). 상태 배지와 👍만.
- 모바일 375px: 카드 1열, 필터 칩 가로 스크롤, 모달 화면 안.

### 4. `js/sms-template.js`
- `buildSmsText(candidate, context, config)` — `context = { attendCount, format, teamName }`. `config.SMS_TEMPLATE`의 자리표시자 `{제목} {날짜} {시간} {구장} {인원} {포맷} {팀명}`을 치환. 값 없으면 `{시간}` → "시간 협의", `{구장}` → 제목에서 venue, `{인원}` → "5~6명", `{포맷}` → "5v5 또는 6v6".
- `smsHref(phone, text)` — 숫자·`+`만 남긴 번호. iOS(`/iPhone|iPad|iPod/.test(navigator.userAgent)` 를 인자로 받은 `isIos`)면 `sms:번호&body=`, 아니면 `sms:번호?body=`, 본문은 `encodeURIComponent`.
- Node export + `window.ExicanSms`.

### 5. `js/config.js` 추가
```js
TEAM_NAME: "FC EXICAN",
SMS_TEMPLATE: "안녕하세요, 모두의풋살 카페 글({제목}) 보고 연락드립니다. 저희는 3040 풋살팀 {팀명}(실력 하~중, 안 다치게 즐겁게 합니다)입니다. {날짜} {시간} {구장} 매치 가능할까요? 저희 인원 {인원}, {포맷} 희망합니다. 구장비 조건도 알려주시면 감사하겠습니다.",
```

### 6. 홈 카드 (`index.html`)
- "매칭 후보": `filterCandidates` 기본 필터로 상위 3건 → `describeSchedule` + 제목(카페 링크) 목록, 없으면 "이번 주 토요일 오전 후보가 아직 없습니다". 링크 "전체 보기 → matches.html".
- "확정 매치": `ExicanData.matches({ from: 오늘 })` 첫 건 → "10/17(토) 08:00~10:00 · 도봉풋살장 · 6v6 · 구장비 60,000원", 없으면 "확정된 매치가 없습니다".
- 기존 "이번 주 투표" 카드 로직은 그대로.

### 7. `js/parse-title.js` venue 버그
- 현재 `cleanVenue`가 "풋살"을 지워 "성남종합운동장 풋살장" → "성남종합운동장 장"이 된다. "풋살"은 **뒤에 한글이 이어지지 않을 때만** 제거하도록 바꾼다(`풋살장`, `풋살파크`, `풋살스타디움`은 유지). 같은 규칙을 `팀`에도 적용(`팀매칭`은 제거해도 되지만 `샤인풋볼클럽` 같은 단어 보호). 테스트: `"10/21(수) 20-22 성남종합운동장 풋살장 초청합니다~!"` → venue `"성남종합운동장 풋살장"`; 기존 기대값 2건(`분당 마루공원`, `반포종합운동장`)은 유지. `test/scrape-cafe.test.js`의 `"성남종합운동장 장"` 기대값을 `"성남종합운동장 풋살장"`으로 수정.

### 8. 데모 데이터
- `demo-data.json`의 `match_candidates`에 `test/fixtures/cafe-titles.json`에서 고른 실제 제목 10건을 `match_candidates` 컬럼 형태로 넣는다(토요일 오전 4건, 토요일 오후 1건, 일요일 2건, 평일 2건, 미분류 1건; 마감 1건 포함; phone은 `010-0000-0000` 더미 1건만, contact_status `contacted` 1건). `parsed_date`는 `2026-10-17` 등 고정값으로 두고, **`js/data.js`는 수정 금지이므로** `matches.html`/`index.html`의 데모 분기에서 로드 직후 `parsed_date`를 "같은 요일의 다가오는 날짜"로 치환하는 헬퍼 `shiftDemoDates(rows, todayKst)`를 `js/candidates.js`에 두고 사용한다(`ExicanData.mode() === "demo"`일 때만).
- `matches`에 1건(다가오는 토요일 08:00~10:00, 도봉풋살장, 6v6, cost 60000) — 같은 방식으로 날짜 치환.

## 수용 기준
- [ ] `npm test` 통과 (기존 364 + 신규: candidates 필터/정렬/describe 8개 이상, sms 템플릿·href 4개 이상, parse-title venue 1개)
- [ ] `matches.html?demo=1`: 기본 필터에서 토요일 오전 후보 4건이 점수순, "미분류 1건" 그룹이 아래에, 마감 토글 켜면 1건 추가
- [ ] 👍 클릭 → 이름 선택 → 수 증가·강조, 다시 클릭 → 감소
- [ ] 데모에서 회장(안준호) 선택 시 관리 패널 표시, 상태 "문자 보냄" 저장 후 배지 변경, "확정" → 모달 → 저장 → 홈 "확정 매치" 카드에 반영
- [ ] 문자 문구에 날짜·시간·구장·인원이 치환되고, `sms:` 링크가 iOS/Android 형식을 구분
- [ ] 팀 세션 화면에 연락처가 노출되지 않는다 (DOM에 phone 값이 없음)
- [ ] 375px에서 가로 넘침 없음, 모달이 화면 안
- [ ] 실제 Supabase(라이브) 경로는 Claude가 검증 (PR에 "미검증" 명시)

## 테스트 방법
- 자동: `npm test`
- 수동: `python -m http.server 8765` → `/matches.html?demo=1`, `/index.html?demo=1`

## 참고
- `js/data.js`의 `candidates/reactions/toggleReaction/updateCandidate/createMatch/matches` 시그니처
- `js/rules.js`의 `kstDate`, `nextSaturday`, `formatRelative`, `attendanceSummary`
- `js/member.js`의 `ensure`, `getId`
- 카페 글 링크: `EXICAN_CONFIG.CAFE.ARTICLE_URL(articleId, menuId)`
