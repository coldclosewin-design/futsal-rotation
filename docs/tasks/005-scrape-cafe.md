# [005] 카페 글 목록 수집기 + GitHub Actions cron

- 브랜치: `codex/005-scrape-cafe`
- 의존: 002, 004 (main에 머지됨)
- 예상 규모: M

## 배경
네이버 카페 풋매 게시판 4곳의 글 목록을 매시간 수집해 `match_candidates` 테이블에 upsert합니다
(`docs/PLAN.md` §3). 목록 API는 로그인 없이 공개이며 응답 예시가 `test/fixtures/api-menu-623.json`에 있습니다
(실제 응답에서 불필요한 필드를 제거한 것, 수정 금지). 글 본문은 수집하지 않습니다.
Supabase 쓰기는 service-role key(GitHub Secret)로 REST(PostgREST)를 직접 호출하며 npm 의존성은 추가하지 않습니다.

**주의**: Codex 실행 환경에서 `apis.naver.com`에 접속되지 않을 수 있습니다. 그래서 `--input` 옵션으로 파일에서
응답을 읽는 오프라인 경로를 반드시 제공하고, 테스트는 전부 오프라인으로 작성합니다. 실제 네트워크·Supabase 적용 검증은 Claude가 합니다.

## 목표
- `node scripts/scrape-cafe.js --dry-run` 이 4개 게시판을 읽어 파싱 결과를 표로 출력한다 (Supabase 미접속).
- 시크릿이 있으면 `match_candidates`에 스크래퍼 소유 컬럼만 upsert한다.
- `.github/workflows/cron.yml` 이 매시간(KST 06~24시) 실행된다.

## 변경 파일
- (신규) `scripts/scrape-cafe.js`
- (신규) `.github/workflows/cron.yml`
- (신규) `test/scrape-cafe.test.js`
- `README.md` — "카페 수집기" 절 추가 (실행법, 옵션, 시크릿 이름)

## 변경 금지
- `js/parse-title.js`, `js/config.js`, `supabase/*`, `test/fixtures/*`, `.github/workflows/test.yml`

## 상세 요구사항
1. **입력 소스**
   - 기본: 메뉴별 URL `https://apis.naver.com/cafe-web/cafe2/ArticleListV2dot1.json?search.clubid={CLUB_ID}&search.menuid={menuId}&search.perPage=30&search.page={1|2}&search.queryType=lastArticle`. 메뉴 목록은 `require("../js/config.js").CAFE.MENUS`. 요청 헤더 `User-Agent: Mozilla/5.0 (compatible; exican-hub/1.0)`, 타임아웃 20초(`AbortController`), 페이지 사이 500ms 대기.
   - `--input <file>`: 파일 1개의 JSON(응답 형식 그대로)을 메뉴 1개 분량으로 사용. `--menu 623` 과 함께 쓰면 해당 메뉴로 라벨링. 파일 입력 시 네트워크 호출 없음.
   - `--menus 623,625`: 수집할 메뉴 제한. `--pages 1`: 페이지 수(기본 2).
2. **행 변환** `buildCandidateRow(article, menuName, nowIso)` (순수 함수, export):
   ```js
   {
     article_id, menu_id, menu_name, subject, head_name: headName || null,
     is_closed: headName === "매치마감" || parsed.closed,
     write_ts: new Date(writeDateTimestamp).toISOString(),
     comment_count, read_count,
     parsed_date: parsed.date, start_hour, end_hour, weekday,
     parsed_format: parsed.formats.length ? parsed.formats.join(",") : null,
     venue: parsed.venue || null, parse_ok: parsed.ok,
     scraper_score: score ?? -1000,     // null(제외 대상)은 -1000으로 저장
     last_seen_at: nowIso
   }
   ```
   `parsed = parseTitle(subject, write_ts)`, `score = scoreCandidate(parsed, { headName, writeTs: write_ts, now: nowIso })`.
   **`first_seen_at`, `phone`, `contact_status`, `memo`, `our_priority`, `admin_updated_at`, `created_at`은 절대 본문에 넣지 않는다** (PostgREST upsert는 본문에 있는 컬럼만 갱신하므로 회장 입력값이 보존됨).
3. **upsert** `upsertCandidates(rows, { url, key, fetchImpl })` (export, `fetchImpl` 주입 가능):
   - `POST {url}/rest/v1/match_candidates?on_conflict=article_id`
   - 헤더: `apikey: key`, `Authorization: Bearer key`, `Content-Type: application/json`, `Prefer: resolution=merge-duplicates,return=minimal`
   - 100행 단위 청크. 응답이 2xx가 아니면 상태코드와 본문 앞 300자를 포함한 Error throw.
4. **실행 흐름** `main()`:
   - 환경변수 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. `--dry-run`이면 둘 다 없어도 됨. dry-run이 아닌데 없으면 종료코드 2 + 안내.
   - 메뉴별로 수집→변환→(dry-run이 아니면) upsert. 메뉴 하나가 실패해도 나머지 계속. 마지막에 요약 한 줄씩: `menu 623 성남/하남: fetched 30, parse_ok 26, closed 4, upserted 30`.
   - 모든 메뉴가 실패하면 종료코드 1, 하나라도 성공하면 0.
   - dry-run 출력: `articleId | score | date weekday start-end | formats | closed | subject(50자)` 를 점수 내림차순으로. 키·토큰은 절대 출력하지 않음.
   - 네트워크 응답이 JSON이 아니거나 `message.result.articleList`가 배열이 아니면 그 메뉴를 실패로 처리 (로그인 요구 HTML 등).
5. **cron.yml**
   ```yaml
   name: Cron
   on:
     schedule:
       - cron: "0 0-15,21-23 * * *"   # KST 06:00~24:00 매시 정각 (UTC 21~23, 0~15)
     workflow_dispatch:
   permissions: { contents: read }
   concurrency: { group: cron, cancel-in-progress: false }
   jobs:
     scrape:
       runs-on: ubuntu-latest
       timeout-minutes: 10
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version: 20 }
         - run: node scripts/scrape-cafe.js
           env:
             SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
             SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
   ```
   (housekeeping 스텝은 007에서 추가)
6. **테스트** `test/scrape-cafe.test.js` (오프라인):
   - `buildCandidateRow`: 픽스처 `api-menu-623.json`의 첫 글(`10/21(수) 20-22 성남종합운동장…`)이 `parsed_date 2026-10-21`, `weekday 수`, `start_hour 20`, `is_closed false`, `scraper_score`가 정수이고 금지 컬럼 키가 없음을 검증. `headName: "매치마감"` 글은 `is_closed true`, `scraper_score -1000`.
   - `upsertCandidates`: `fetchImpl` 모킹으로 URL·헤더(`Prefer`, `apikey`)·청크 수(250행 → 3회)·비2xx 시 throw 검증. 모킹 본문에서 금지 컬럼이 없음을 검증.
   - `--input` 경로: `child_process.execFileSync(process.execPath, ["scripts/scrape-cafe.js", "--dry-run", "--input", fixture, "--menu", "623"])` 실행 결과에 `fetched 15`가 포함되고 종료코드 0.
   - dry-run 출력에 `SUPABASE`나 `eyJ` 같은 키 흔적이 없음.

## 수용 기준
- [ ] `npm test` 통과 (기존 238 + 신규)
- [ ] `node scripts/scrape-cafe.js --dry-run --input test/fixtures/api-menu-623.json --menu 623` 이 15행을 점수순으로 출력하고 종료코드 0
- [ ] 시크릿 없이 `node scripts/scrape-cafe.js` 실행 시 종료코드 2와 한국어 안내
- [ ] upsert 본문에 스크래퍼 소유 컬럼만 포함 (테스트로 고정)
- [ ] `cron.yml`이 위 스케줄·권한·concurrency·timeout을 갖는다
- [ ] 실제 네이버 접속·Supabase upsert는 Claude가 검증 (PR 본문에 "미검증" 명시)

## 테스트 방법
- 자동: `npm test`
- 수동: 위 dry-run 명령. 네트워크가 되는 환경이면 `node scripts/scrape-cafe.js --dry-run --menus 623 --pages 1`.

## 참고
- PostgREST upsert: https://postgrest.org/en/stable/references/api/tables_views.html#upsert
- `js/parse-title.js`의 `parseTitle`, `scoreCandidate`, `js/config.js`의 `CAFE.MENUS`·`CAFE.CLUB_ID` 재사용.
