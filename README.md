# 풋살 키퍼·휴식 배정 웹페이지

6~12명이 참가하는 풋살 경기에서 `키퍼`와 `휴식`을 공평하게 자동 배정해주는 정적 웹페이지입니다.  
별도 서버 없이 HTML, JavaScript, CSS만으로 동작하며, GitHub Pages로 바로 배포할 수 있습니다.

## 최근 업데이트

### 1. 모바일 결과표 가독성 개선
- 모바일에서 이름이 중간에 줄바꿈되던 문제를 수정했습니다.
- 결과표 셀은 한 줄 기준으로 유지되고, 화면이 좁으면 표 전체를 가로 스크롤해서 볼 수 있습니다.
- 긴 이름도 더 안정적으로 확인할 수 있습니다.

### 2. 늦참·조기퇴장자 배정 공정성 개선
- 기존에는 늦게 오거나 일찍 가는 인원이 `키퍼/휴식`을 덜 맡고 필드 위주로 배정되는 경향이 있었습니다.
- 이제는 각 인원의 실제 참여 쿼터 수를 기준으로 `키퍼/휴식` 부담이 비슷한 비율로 분배되도록 로직을 개선했습니다.
- 부분 참가자가 포함된 경기에서도 특정 인원에게 부담이 과도하게 몰리는 현상을 줄였습니다.

### 3. 회귀 테스트 반영
- 자동 테스트 기준 `91 PASS, 0 FAIL`
- 기본 인원 구성, 부분 참가, 에러 케이스, 카카오톡 공유 포맷까지 함께 검증합니다.

## 주요 기능

- **엄격 연속 금지**: 같은 사람이 연속 쿼터에 `GK`, `Rest`로 배정되지 않도록 최대한 방지
- **공평한 배정**: 전체 참가자와 부분 참가자를 모두 고려해 `키퍼/휴식` 부담 분산
- **부분 참가 지원**: 참가자별 `Q시작 ~ Q끝` 설정 가능
- **카카오톡 복사**: 결과를 바로 공유할 수 있는 텍스트 형식 제공
- **멤버 관리**: `members.json` 기반으로 참가자 목록 유지
- **서버 불필요**: 정적 파일만으로 운영 가능

## 파일 구성

```text
index.html           FC EXICAN 운영 허브 - 공용 내비, 준비 중 카드 4개
rotation.html        배정 화면 - 참가자 선택, 부분 참가 설정, 결과 생성
rules.html           공개 회칙 화면 - 설정 기반 벌금·회비 요약표 및 회칙 전문
members-admin.html   멤버 관리 화면 - members.json 편집용
members.json         멤버 목록 데이터
js/
  config.js          공용 설정 (브라우저 전역 / Node CommonJS)
  ui.js              공용 내비, 토스트, HTML 이스케이프, 원화 표시
  markdown-lite.js   회칙용 제목·불릿·문단 변환기 (브라우저 / Node)
  rotation.js        배정 알고리즘 및 검증 로직
  parse-title.js     카페 제목 파싱 및 매칭 후보 점수 (브라우저 / Node)
styles.css           공용 내비·카드 및 기존 배정 UI 스타일
test/
  rotation.test.js   Node 회귀 테스트 (기존 91개 검증)
  config.test.js     브라우저·Node 공용 설정 검증
  ui.test.js         공용 순수 함수 검증
  markdown-lite.test.js 회칙 마크다운 변환·중첩·이스케이프 검증
  parse-title.test.js 카페 제목 픽스처·파싱 규칙·후보 점수 검증
tests.html           브라우저 기반 테스트 화면
package.json         Node 20 이상, npm test 실행 정의 (의존성 없음)
.github/workflows/
  test.yml           PR 및 main push 시 Node 20으로 npm test 실행
docs/
  PLAN.md            전체 설계
  rules.md           공개 회칙 원문 (계좌는 회장에게 문의)
  tasks/             발주서
AGENTS.md            저장소 작업 규약
```

`vote.html`, `matches.html`, `ledger.html`, `member.html`, `admin.html`과
`scripts/`, `supabase/`는 후속 발주서에서 추가합니다. 아직 없는 페이지도 공용 내비에는 링크가 표시됩니다.

## 로컬에서 실행

```bash
cd futsal-rotation
python -m http.server 8765
```

브라우저에서 아래 주소로 접속합니다.

```text
http://localhost:8765
```

`members.json`은 `fetch`로 읽기 때문에 파일을 직접 더블클릭해서 열면 CORS 문제로 실패할 수 있습니다.  
반드시 HTTP 서버로 실행해서 확인하세요.

## 인증

Supabase 설정 후 홈에 처음 접속하면 팀 PIN 입력창이 표시되며, 올바른 PIN을 입력하면 로그인 상태가 브라우저에 저장되어 새로고침해도 유지됩니다.
인증 바의 **회장 로그인**에서 비밀번호를 입력하면 팀 세션을 로그아웃한 뒤 회장 세션으로 전환하며, **로그아웃**하면 팀 PIN을 다시 입력해야 합니다.
`js/config.js`의 Supabase URL 또는 anon key가 비어 있으면 인증 바와 설정 전 안내만 표시되며, 데이터 기능은 아직 동작하지 않습니다.

## 카페 수집기

Node 20 이상에서 네이버 카페 게시판 4곳의 **글 목록만** 읽고 제목을 파싱합니다. 메뉴와 카페 ID는
`js/config.js`의 `CAFE` 설정을 사용하며, 외부 패키지 설치는 필요하지 않습니다.

```bash
# 오프라인 확인: 네이버와 Supabase에 접속하지 않음
node scripts/scrape-cafe.js --dry-run --input test/fixtures/api-menu-623.json --menu 623

# 온라인 확인: 기본 4개 메뉴 × 2페이지, Supabase 저장 없음
node scripts/scrape-cafe.js --dry-run
node scripts/scrape-cafe.js --dry-run --menus 623,625 --pages 1

# 환경변수 설정 후 실제 수집 및 저장
node scripts/scrape-cafe.js
```

| 옵션 | 동작 |
|---|---|
| `--dry-run` | 점수 내림차순 표와 메뉴별 요약만 출력. Supabase 환경변수 불필요 |
| `--input <file>` | JSON 응답 파일 1개를 메뉴 1개 분량으로 사용. 네트워크 차단을 보장하도록 `--dry-run`과 함께 사용 |
| `--menu <id>` | 파일 입력의 메뉴 ID와 이름 지정. 생략하면 첫 글의 `menuId` 사용, 빈 목록은 필수 |
| `--menus <ids>` | 수집 메뉴 제한(쉼표 구분). 기본값은 `CAFE.MENUS`의 전체 메뉴 |
| `--pages <1\|2>` | 메뉴당 페이지 수. 기본 2페이지, 페이지당 30건. 파일 입력에서는 적용하지 않음 |

실제 저장에는 환경변수 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`가 모두 필요합니다.
GitHub 저장소의 Actions Secrets에도 **동일한 이름**으로 등록하며, 값은 소스나 실행 인자에 넣지 않습니다.
`.github/workflows/cron.yml`은 KST 06:00~24:00 매시 정각에 실행되도록 예약되고,
Actions의 **Cron → Run workflow**로 수동 실행할 수 있습니다. 작업 제한은 10분이며 동시 실행은 직렬화합니다.

수집기는 메뉴별로 처리하며 하나가 실패해도 나머지 메뉴를 계속합니다. 하나 이상 성공하면 종료코드 0,
모든 메뉴 실패는 1, 필수 환경변수 누락이나 옵션 오류는 2입니다. 파일을 읽거나 해석하지 못하면 1입니다.
요약의 `fetched`는 수신한 글 수, `parse_ok`·`closed`는 중복 제거 후 글 수, `upserted`는 저장 완료 수입니다
(`--dry-run`은 0). 페이지 간 같은 글은 앞 페이지 값을 한 번만 반영합니다.

저장은 `article_id` 기준으로 100행씩 upsert하며, 수집기 소유 컬럼만 전송합니다.
`first_seen_at`, `phone`, `contact_status`, `memo`, `our_priority`, `admin_updated_at`, `created_at`은
본문에서 제외해 최초 기록과 회장 입력값을 보존합니다. 키와 토큰은 출력하지 않습니다.
자동 테스트는 모두 오프라인으로 실행합니다. 실제 네이버 접속과 Supabase upsert는 Claude가 별도 검증합니다.

## 배포

GitHub Pages 기준으로 다음 순서로 배포할 수 있습니다.

1. GitHub 저장소에 현재 파일을 push합니다.
2. 저장소에서 `Settings > Pages`로 이동합니다.
3. `Deploy from a branch`를 선택합니다.
4. 브랜치를 `main`, 폴더를 `/ (root)`로 설정합니다.
5. 잠시 후 아래 형태의 URL로 접속할 수 있습니다.

```text
https://<username>.github.io/futsal-rotation/
```

현재 저장소 기준 예상 배포 주소:

```text
https://coldclosewin-design.github.io/futsal-rotation/
```

## 멤버 목록 업데이트 방법

1. `members-admin.html`에서 멤버를 추가, 수정, 삭제합니다.
2. 브라우저에서 결과를 확인합니다.
3. JSON 내용을 복사합니다.
4. `members.json`에 반영합니다.
5. 아래 명령으로 커밋 및 푸시합니다.

```bash
git add members.json
git commit -m "멤버 업데이트"
git push origin main
```

## 배정 규칙

| 참가자 수 | 포맷 | 필드 인원(키퍼 포함) | 키퍼 | 휴식 |
|----------|------|----------------------|------|------|
| 6명 | 5v5 | 5 | 1 | 1 |
| 6명 | 6v6 | 6 | 1 | 0 |
| 7명 | 5v5 | 5 | 1 | 2 |
| 7명 | 6v6 | 6 | 1 | 1 |

기본 기준은 8쿼터입니다.
키퍼·휴식을 합친 out 배정은 참가 구간의 시작·끝과 out 사이의 필드 플레이 길이가 고르게 되도록 점수를 매깁니다.
연속 out 방지와 참가 쿼터 대비 횟수 공평성을 우선하며, 역할별 횟수와 out 간격도 함께 고려합니다.
횟수가 같은 후보는 마지막 out 이후 오래 뛴 선수를 우선하고, 같은 입력과 다시 섞기 횟수에는 같은 결과를 제공합니다.
개인 간격 점수가 1.0을 넘으면 결과에 `out 간격 편중` 경고와 해당 쿼터를 표시합니다.

## 테스트

CI와 동일한 Node 20에서 자동 회귀 테스트를 실행합니다. 별도 패키지 설치는 필요하지 않습니다.

```bash
npm test
```

`node --test`가 `test/*.test.js`를 자동으로 찾아 기존 91개 배정 검증과 공용 설정·UI 함수 테스트를 실행합니다.
GitHub Actions도 모든 PR 및 `main` push에서 같은 명령을 실행합니다. Node 20과 Node 26에서 동일하게 동작합니다.

HTTP 서버를 실행한 뒤 아래 순서로 브라우저 UI를 확인합니다.

```text
http://localhost:8765/index.html
http://localhost:8765/rotation.html
http://localhost:8765/members-admin.html
http://localhost:8765/tests.html
```

375px 폭에서 내비의 한 줄 가로 스크롤과 페이지 넘침 여부를 확인하고,
배정 화면에서 7명 선택 → 5v5 → 배정표 생성 → 카톡 복사를 확인합니다.
브라우저 테스트는 기존 검증을 유지하며, 부분 참여 표기의 기대 문자열(`A(Q1~4)`)이
현재 출력(`A(Q1~Q4)`)과 다른 기존 실패 1건이 있습니다 (`PASS 91 · FAIL 1`).
Node 회귀 테스트는 현재 출력 기준으로 검증합니다.

## 이번 반영 요약

- 모바일 결과표 줄바꿈 문제 수정
- 부분 참가자 `키퍼/휴식` 분배 로직 개선
- 테스트 강화 및 회귀 검증 완료

## 배포 버전 관리

- 개발 중 변경은 일반 `commit`으로 관리합니다.
- 실제 사용자에게 반영되는 기준점은 Git `tag`로 관리합니다.
- 고객에게 안내할 변경사항은 `CHANGELOG.md`에 기록합니다.
- 첫 운영 기준 배포 태그는 `v1.0.0`입니다.
