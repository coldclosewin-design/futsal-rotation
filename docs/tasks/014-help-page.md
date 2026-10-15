# [014] 도움말 페이지(docs/guide.md 렌더링)와 첫 진입 안내 링크

- 브랜치: `codex/014-help-page`
- 의존: 013 (main에 머지됨)
- 예상 규모: M

## 배경
서비스를 팀원 11명과 회장에게 공유합니다. 상세 가이드는 `docs/guide.md`에 Claude가 작성해 두었습니다(팀원 편·회장 편).
회칙 페이지(`rules.html`)가 `docs/rules.md`를 `js/markdown-lite.js`로 렌더링하듯, **PIN 없이 열리는 `help.html`이 `docs/guide.md`를 렌더링**합니다.
가이드는 `###`·굵게·링크·번호 목록을 쓰므로 markdown-lite를 그만큼만 확장합니다. 카톡 인앱 브라우저(375px)에서 읽는 것이 기본 상황입니다.

## 목표
- 더보기(모바일)/레일(데스크톱)에 "도움말" 항목이 생기고, `help.html`이 로그인 없이 `docs/guide.md`를 보여 준다.
- 페이지 상단에 "팀원 편 / 회장 편" 바로가기 두 개가 있어 긴 문서를 건너뛸 수 있다.
- 팀 PIN 모달 아래 "처음이세요? 도움말" 링크로 로그인 전에도 도움말에 갈 수 있다.

## 변경 파일
- (신규) `help.html` — `rules.html`의 뼈대(head, `body.rollout-page`, `h1`, `main.page-grid`, 스크립트 순서)를 복사. Supabase/데이터 스크립트는 넣지 않는다(`config.js`, `ui.js`, `markdown-lite.js`만). `fetch("docs/guide.md")` → `renderMarkdownLite` → `article.rules-document`에 삽입. 실패 시 `rules.html`과 같은 문구 패턴으로 `docs/guide.md` 원문 링크.
- `js/markdown-lite.js` — 확장: `###` → `<h3>`, `**굵게**` → `<strong>`, `[텍스트](url)` → `<a href>`(`http(s)://`로 시작하거나 `.html`/`.md`/`#`으로 시작·끝나는 상대경로만 허용, 그 외는 텍스트 그대로), `1.`로 시작하는 연속 줄 → `<ol><li>`(중첩 없음). 기존 `rules.md` 렌더 결과는 바뀌지 않아야 한다. 인라인 치환은 escape 이후에 적용(XSS 금지).
- `test/markdown-lite.test.js` — 위 4가지 케이스 + `rules.md` 렌더 결과 불변 테스트(기존 테스트 파일이 있으면 거기에 추가).
- `js/ui.js` — `NAV_ITEMS`에 `{ key: "help", label: "도움말", href: "help.html" }`를 `rules` 다음·`admin` 앞에 추가. `ICONS.help` 추가(24 그리드 1.75px: `<circle cx="12" cy="12" r="8.5"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.1.9-1.1 1.8M12 17v.5"/>`). `renderNav` 로직 수정 금지.
- `js/supabase.js` — PIN 모달(`account === "team"`일 때만) 폼 맨 아래 `<a class="modal-help" href="help.html">처음이세요? 도움말</a>`. 회장 로그인 모달에는 넣지 않는다.
- `styles.css` — "페이지별 보정" 섹션 끝에만 추가: `.help-page .rules-document h3`(본문 크기 15/700, 위 여백 20px), `.help-page .rules-document ol`(padding-left 20px, 항목 간 6px), `.modal-help`(라벨 크기, `--ink-3`, 가운데 정렬, 위 여백 12px). 토큰·공용 블록 수정 금지.
- `README.md` — "화면 구성" 목록에 **도움말** 한 줄, 팀원용 사용법 끝에 "막히면 더보기 → 도움말" 한 줄.

## 변경 금지
- `docs/guide.md`(내용은 Claude가 관리; 렌더링 문제로 꼭 필요한 공백·기호 수정만 허용하고 PR에 명시), `docs/rules.md`, `index.html`, `vote.html`, `matches.html`, `ledger.html`, `rotation.html`, `member.html`, `admin.html`, `rules.html`, `js/data*.js`, `js/rules.js`, `scripts/*`, `supabase/*`, `DESIGN.md`

## 상세 요구사항

### 1. 페이지 구조 (`help.html`)
- `<title>도움말 · FC EXICAN</title>`, `<h1>도움말</h1>`, `renderNav("help")`, `main.help-page.page-grid`.
- 보드 없음(공개 정적 페이지). 구성 순서:
  1. `nav.rows.page-wide` "바로가기": `a.row` 두 개 — **팀원 편**(`href="#팀원-편"`, `.row-sub` "처음 설정, 투표, 추천, 간식 청구, 내 현황"), **회장 편**(`href="#회장-편"`, `.row-sub` "주간 운영, 매칭, 배정표, 출석·벌금, 정산"). 오른쪽 `.row-action` "이동".
  2. `article#help-content.rules-document.page-wide` — 렌더링된 가이드. `aria-busy` 처리는 `rules.html`과 동일.
  3. `aside.rules-notice.page-wide` "도움말에 없는 문제는 회장에게 개인톡으로".
- 렌더 후 `h2`에 `id`를 붙인다: 제목 텍스트의 공백을 `-`로 바꾼 값(예: "팀원 편" → `팀원-편`). markdown-lite가 아니라 `help.html` 스크립트에서 처리(공용 모듈 동작 변경 최소화).
- 가이드의 첫 `h1`("FC EXICAN 운영 허브 사용 가이드")은 페이지 `h1`과 중복되므로 렌더 결과에서 첫 `h1`을 제거한다.
- 인라인 `style=`, 이모지, 새 색 금지. 375px 가로 넘침 없음(긴 URL은 `overflow-wrap: anywhere`가 `.rules-document`에 이미 있는지 확인, 없으면 보정 섹션에 추가).

### 2. markdown-lite 확장 규칙
- 제목: `#`, `##`(기존), `###`(추가). 네 개 이상은 문단.
- 굵게: `**…**` 한 줄 안에서만. 짝이 안 맞으면 그대로 둔다.
- 링크: `[텍스트](url)`. url이 `https://`/`http://`로 시작하면 `target="_blank" rel="noopener"`, 상대경로(`.html`/`.md`로 끝나거나 `#`으로 시작)면 그대로. 그 외는 치환하지 않는다.
- 번호 목록: `^\d+\.\s+`로 시작하는 줄이 연속되면 하나의 `<ol>`. 번호 값은 무시하고 순서대로. 빈 줄이나 다른 블록이 오면 닫는다.
- 기존 `-` 목록, 문단, `rotation.html` 자동 링크는 그대로.

### 3. PIN 모달 링크 (`js/supabase.js`)
- 팀 PIN 모달 폼의 버튼 줄 아래 `처음이세요? 도움말`. 클릭 시 `help.html`로 이동. `?demo=1`에서는 모달이 뜨지 않으므로 해당 없음.

## 수용 기준
- [ ] `npm test` 통과(markdown-lite 테스트 추가 포함), `rules.html` 렌더 결과 변화 없음
- [ ] `help.html`이 PIN 모달 없이 열리고 `docs/guide.md` 전체가 h2/h3/굵게/링크/번호 목록까지 올바르게 렌더된다
- [ ] 상단 바로가기 두 개가 각각 "팀원 편", "회장 편" 제목으로 스크롤된다
- [ ] 375px 가로 넘침 없음, 1280px 레일 레이아웃 정상, 콘솔 에러 없음
- [ ] 모바일 더보기 시트와 데스크톱 레일에 "도움말"이 회칙 다음·관리 앞에 보인다
- [ ] 라이브 첫 진입 PIN 모달 아래 "처음이세요? 도움말" 링크가 `help.html`로 이동한다(회장 로그인 모달에는 없음)
- [ ] `help.html`에 `style=`·hex 색·이모지 없음, 새 토큰 없음
- [ ] `README.md` 두 줄 반영
- [ ] PR 본문에 375px 스크린샷 3장(바로가기, 팀원 편 일부, 회장 편 일부)

## 테스트 방법
- 자동: `npm test`
- 수동: `python -m http.server 8765` → `/help.html`, `/help.html?demo=1`, `/rules.html`(회귀), `/index.html`(PIN 모달 링크)

## 참고
- `rules.html`의 fetch·렌더·오류 처리, `js/markdown-lite.js`, `styles.css`의 `.rows`/`.row`/`.rules-document`/`.rules-notice`, `js/ui.js`의 `NAV_ITEMS`/`ICONS`
- 공지문 `docs/kakao-announcement.md`(발주 범위 아님)
