# AGENTS.md — FC EXICAN 운영 허브 작업 규약

이 저장소는 풋살팀 **FC EXICAN**의 운영 허브입니다. 기존 "키퍼·휴식 배정" 페이지를 확장해
주간 투표, 매칭 후보 대시보드, 장부, 회칙, 개인 페이지를 한 곳에서 제공합니다.
전체 설계는 `docs/PLAN.md`에 있습니다. **작업은 반드시 `docs/tasks/NNN-*.md` 발주서 단위로 수행합니다.**

## 역할 분담
- **Claude Code**: 기획, 발주서 작성, PR 리뷰·머지, Supabase 적용, 배포 검증.
- **Codex (이 문서를 읽는 당신)**: 발주서 1건 = 브랜치 1개 = PR 1개로 구현.

## 기술 제약 (위반 금지)
- **순수 HTML / CSS / JavaScript. 빌드 도구·번들러·프레임워크·TypeScript 금지.** GitHub Pages가 `main` 루트를 그대로 서빙합니다.
- 브라우저 JS는 ES2020 문법, `<script>` 전역 스크립트 방식 유지 (ESM `import` 는 사용하지 않음). Node 스크립트(`scripts/`, `test/`)는 CommonJS.
- 외부 라이브러리는 **supabase-js v2 CDN** 1개만 허용 (`https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2`). 그 외 CDN·npm 런타임 의존성 추가 금지. devDependency도 추가하지 않습니다(테스트는 `node:test`).
- Node 20 이상. 테스트는 `npm test` (= `node --test test/`).
- UI 문구는 한국어. 모바일 우선 (카카오톡 인앱 브라우저, 375px 폭에서 가로 스크롤 없이 동작).
- 공용 설정은 `js/config.js` 한 곳에만 둡니다. 벌금 금액·Supabase URL/anon key·카페 메뉴 ID 등을 코드에 흩뿌리지 않습니다.

## 보안·개인정보 (위반 시 PR 거절)
- Supabase **service_role key, 비밀번호, PIN, 토큰을 절대 커밋하지 않습니다.** GitHub Actions에서는 `secrets.SUPABASE_URL`, `secrets.SUPABASE_SERVICE_ROLE_KEY`만 사용합니다.
- anon key는 `js/config.js`에 둘 수 있습니다(RLS 전제로 공개 가능).
- 전화번호·계좌번호를 소스·픽스처·테스트에 넣지 않습니다. 테스트 데이터는 `010-0000-0000` 같은 더미만.
- `.github/workflows/`는 발주서에 명시된 경우에만 수정합니다.

## 디렉토리 구조 (목표)
```
index.html  vote.html  matches.html  rotation.html  ledger.html  member.html  rules.html  admin.html
js/        config.js  supabase.js  ui.js  rotation.js  parse-title.js  rules.js
scripts/   scrape-cafe.js  housekeeping.js        # Node, GitHub Actions에서 실행
supabase/  schema.sql  seed.sql  README.md
test/      *.test.js                                # node:test
docs/      PLAN.md  tasks/_template.md  tasks/NNN-*.md
.github/workflows/  test.yml  cron.yml
```

## 작업 절차
1. 지정된 발주서 `docs/tasks/NNN-slug.md`를 끝까지 읽습니다. **"변경 파일" 목록 밖의 파일은 수정하지 않습니다.** 꼭 필요하면 PR 본문에 이유를 적습니다.
2. 브랜치명: `codex/NNN-slug`.
3. 구현 후 `npm test`가 통과해야 합니다. 새 순수 함수에는 테스트를 추가합니다.
4. 커밋 메시지: 한국어 또는 영어, 첫 줄 72자 이내, `[NNN] 요약` 형식.
5. PR 제목: `[NNN] 발주서 제목`. PR 본문: 발주서의 **수용 기준 체크리스트를 그대로 복사**하고 각 항목에 체크, 테스트 결과(`npm test` 출력 마지막 줄), 수동 확인한 화면 설명, 발주서에서 벗어난 점을 기록합니다.
6. 발주서에 모호한 점이 있으면 **가장 단순한 해석**을 택하고 PR 본문 "가정" 항목에 적습니다. 질문하려고 멈추지 않습니다.

## 코드 스타일
- 들여쓰기 2칸, 세미콜론 사용, 더블쿼트. 기존 파일의 스타일을 따릅니다.
- 함수는 작게, 순수 함수(파싱·계산·규칙)는 DOM과 분리해 `js/*.js`에 두고 Node에서도 require 가능하게 아래 패턴으로 export합니다:
  ```js
  if (typeof module !== "undefined" && module.exports) { module.exports = { ... }; }
  ```
- 에러는 사용자에게 토스트/문구로 보여줍니다. `console.log` 디버그 코드는 남기지 않습니다.
- Supabase 쓰기는 RLS가 최종 방어선입니다. UI에서 버튼을 숨기는 것으로 권한 검사를 대신하지 않습니다.

## 완료 정의 (Definition of Done)
- [ ] 발주서의 수용 기준 전부 충족
- [ ] `npm test` 통과, 기존 테스트 회귀 없음
- [ ] 375px 모바일 폭에서 레이아웃 확인
- [ ] 비밀값·개인정보 없음
- [ ] PR 본문에 체크리스트·가정·테스트 결과 기재
