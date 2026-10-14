# [003] Supabase 인증·공용 모듈: PIN 모달, 팀/회장 세션, 인증 바

- 브랜치: `codex/003-auth-module`
- 의존: 001, 002 (둘 다 main에 머지됨)
- 예상 규모: M

## 배경
모든 데이터 페이지는 공유 계정 2개(`team` = 팀 PIN, `admin` = 회장 비밀번호)로 Supabase에 로그인해야 읽고 쓸 수 있습니다
(`docs/PLAN.md` §4). 페이지마다 로그인 코드를 반복하지 않도록 공용 모듈 하나로 묶습니다.
**Supabase 프로젝트는 아직 없습니다.** `js/config.js`의 `SUPABASE_URL`이 빈 문자열이면 모듈은 "설정 전" 모드로
동작해야 하며, 실제 로그인 검증은 Claude가 프로젝트 생성 후 수행합니다.

## 목표
- 어떤 페이지든 `<script>` 3줄 + `ExicanAuth.requireTeam()` 한 줄로 PIN 보호·세션 복원·인증 바를 얻는다.
- 설정이 비어 있어도 페이지가 깨지지 않고 안내 문구만 보인다.

## 변경 파일
- (신규) `js/supabase.js` — 전역 `ExicanAuth` 객체
- `index.html` — CDN·모듈 로드, `requireTeam()` 적용, 인증 바 표시
- `styles.css` — 모달·인증 바·배너 스타일 추가
- (신규) `test/auth.test.js` — 순수 함수 테스트
- `README.md` — "인증" 절 추가 (PIN 입력 흐름 2~3문장)

## 변경 금지
- `js/config.js` (값은 Claude가 채움), `js/rotation.js`, `rotation.html`, `supabase/*`

## 상세 요구사항
1. **CDN**: `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>` → `window.supabase.createClient` 사용. 로드 순서: `config.js` → supabase CDN → `ui.js` → `supabase.js`.
2. **`ExicanAuth` API** (모두 전역 객체의 메서드, Promise 반환):
   - `init()` — `EXICAN_CONFIG.SUPABASE_URL`과 `SUPABASE_ANON_KEY`가 모두 비어 있지 않으면 클라이언트 생성 후 반환, 아니면 `null`. 두 번 호출해도 클라이언트 1개만 생성.
   - `isConfigured()` — boolean.
   - `getRole()` — 현재 세션의 이메일을 `roleFromEmail`로 판정해 `"anon" | "team" | "admin"` 반환.
   - `loginTeam(pin)`, `loginAdmin(password)` — `signInWithPassword({ email: TEAM_EMAIL|ADMIN_EMAIL, password })`. 실패 시 `classifyAuthError(error)`로 한국어 메시지를 담은 `Error`를 throw.
   - `logout()` — `signOut()` 후 인증 바 갱신.
   - `requireTeam()` — 설정 전이면 상단에 배너 `"Supabase 설정 전입니다. 데이터 기능은 아직 동작하지 않습니다."`를 넣고 `null` resolve. 설정됐고 세션이 없으면 PIN 모달을 띄우고, 로그인 성공 시 role 문자열로 resolve. 이미 세션이 있으면 즉시 resolve.
   - `renderAuthBar()` — 내비 바로 아래에 `<div class="authbar">` 삽입. 내용: 설정 전이면 "설정 전", `team`이면 "팀 로그인됨 · [회장 로그인] [로그아웃]", `admin`이면 "회장 모드 · [로그아웃]". [회장 로그인]은 비밀번호 입력 모달(같은 모달 컴포넌트, 제목만 "회장 로그인") → `loginAdmin` → 성공 시 바 갱신. 회장 로그인 전에 team 세션은 `signOut`으로 교체.
   - `onAuthChange(callback)` — `supabase.auth.onAuthStateChange` 래핑. 세션 변경 시 `renderAuthBar()`도 자동 갱신.
3. **PIN 모달**: DOM으로 생성(`<div class="modal-backdrop"><form class="modal">…`), `input type="password" inputmode="numeric" autocomplete="current-password"`, 버튼 "확인". 잘못된 PIN이면 모달 안에 빨간 문구 표시 후 재입력. 모달은 바깥 클릭으로 닫히지 않음(PIN 없이는 페이지 사용 불가). Enter 제출 지원. 포커스는 입력창에.
4. **순수 함수** (DOM·네트워크 없이 Node에서 테스트 가능하게 export):
   - `roleFromEmail(email, config)` → `email === config.ADMIN_EMAIL ? "admin" : email === config.TEAM_EMAIL ? "team" : "anon"` (대소문자 무시, null/undefined → "anon").
   - `classifyAuthError(error)` → `{ code, message }`. 매핑: `invalid_credentials`/"Invalid login credentials" → "PIN 또는 비밀번호가 올바르지 않습니다"; `email_not_confirmed` → "계정 이메일 확인이 필요합니다 (Supabase 설정 확인)"; 네트워크 오류(`TypeError`/`Failed to fetch`) → "네트워크 연결을 확인하세요"; 그 외 → "로그인 실패: " + 원문 메시지.
   - `isConfigured(config)` → URL·키 둘 다 비어 있지 않은 문자열.
5. **세션 유지**: supabase-js 기본 localStorage 저장을 그대로 사용. 새로고침 후 `requireTeam()`은 모달 없이 resolve 되어야 함.
6. **index.html**: `DOMContentLoaded` 후 `renderNav("home")` → `ExicanAuth.renderAuthBar()` → `await ExicanAuth.requireTeam()`. 카드 내용은 그대로 "준비 중". 설정 전 배너는 내비와 카드 사이에 노출.
7. 에러·상태 문구는 모두 한국어. `console.error`는 예상치 못한 예외에만.

## 수용 기준
- [ ] `npm test` 통과 (기존 111 + `test/auth.test.js`의 `roleFromEmail`·`classifyAuthError`·`isConfigured` 케이스 각 3개 이상)
- [ ] `SUPABASE_URL`이 빈 상태로 `index.html`을 열면 콘솔 에러 없이 "설정 전" 배너와 인증 바("설정 전")가 보인다
- [ ] `js/config.js`에 임시로 가짜 URL/키를 넣어 열면 PIN 모달이 뜨고, 아무 값이나 입력 시 "PIN 또는 비밀번호가 올바르지 않습니다" 또는 "네트워크 연결을 확인하세요"가 모달 안에 표시된다 (테스트 후 config.js는 원복하여 커밋하지 않는다)
- [ ] 375px 폭에서 모달이 화면 안에 들어오고 입력창이 자동 포커스된다
- [ ] `js/supabase.js`를 Node에서 `require`하면 DOM 접근 없이 순수 함수 3개를 export한다
- [ ] 실제 Supabase 로그인 성공 경로는 Claude가 검증한다 (PR 본문에 "미검증"으로 명시)

## 테스트 방법
- 자동: `npm test`
- 수동: `python -m http.server 8765` → `http://localhost:8765/` 에서 설정 전 배너 확인. 임시 가짜 URL로 모달·오류 문구 확인.

## 참고
- supabase-js v2 Auth: https://supabase.com/docs/reference/javascript/auth-signinwithpassword
- 모달 스타일은 기존 `.toast`와 같은 톤(둥근 모서리 10px, 그림자 약하게).
- 기존 `js/ui.js`의 `showToast`, `escapeHtml` 재사용.
