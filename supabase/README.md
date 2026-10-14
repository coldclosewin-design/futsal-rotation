# Supabase 초기 설정과 검증

발주서 002의 SQL 산출물입니다. 실제 Supabase 프로젝트 적용과 아래 수동 검증은 Claude가 수행합니다. `schema.sql`은 Supabase의 `auth.jwt()`와 `anon`·`authenticated`·`service_role` 역할이 있는 Postgres 15 환경을 전제로 합니다.

## 1. 프로젝트 생성과 인증 설정

- [ ] 한국 사용자와 가까운 리전(서울을 선택할 수 있으면 서울)을 선택합니다.
- [ ] 데이터베이스 비밀번호는 별도로 보관하고 저장소에 넣지 않습니다.
- [ ] **Auth → Allow new user signups OFF** (`Allow new users to sign up` 옵션)를 설정합니다.
- [ ] 이메일/비밀번호 로그인은 활성화하고 **Confirm email OFF**로 설정합니다.
- [ ] Auth → Users에서 `team@fcexican.local`과 `admin@fcexican.local`을 직접 생성하고 이메일 확인 상태를 confirmed로 만듭니다. 초대 이메일 발송 대신 사용자 생성 기능을 사용합니다.
- [ ] 팀 계정 비밀번호는 6자 이상의 팀 PIN, 회장 계정은 별도의 비밀번호로 설정합니다. 두 값 모두 소스·SQL·PR에 기록하지 않습니다.
- [ ] Data API에서 `public` 스키마를 사용합니다. 프로젝트 URL과 anon key를 확인하고, service-role key는 브라우저에 제공하지 않습니다.

화면의 메뉴 위치가 달라지면 [Supabase 인증 설정 문서](https://supabase.com/docs/guides/auth/general-configuration)의 옵션 이름을 기준으로 확인합니다.

## 2. SQL 적용 순서

1. SQL Editor에서 관리자(`postgres`)로 `schema.sql` **전체**를 실행합니다. 파일은 하나의 트랜잭션이며 테이블 10개, 함수 3개, 트리거 1개, RLS 정책 37개, 명시적 인덱스 7개와 API 역할 권한을 생성합니다.
2. 같은 파일 전체를 다시 실행하여 오류 없이 끝나는지 확인합니다. 기존 객체를 건너뛰었다는 NOTICE는 정상입니다. 테이블·행은 삭제하지 않고 함수·트리거·동일 이름의 정책만 갱신합니다.
3. `seed.sql` 전체를 실행하고 다시 한 번 실행합니다. 최초 적용 시 `members.json`의 순서와 ID대로 12명이 들어가며 `m03`(안준호)만 회장입니다. ID가 이미 있으면 이름만 갱신하므로 전화·계좌·활성 상태·운영 중 변경한 회장 지정은 보존합니다.
4. 아래 조회로 결과를 확인합니다.

```sql
-- 최초 적용/시드 재실행 후 member_count = 12, president_ids = {m03}
select count(*) as member_count,
  array_agg(id order by id) filter (where is_president) as president_ids
from public.members;

select id, name, is_president from public.members order by id;

-- 10행 모두 relrowsecurity = true
select relname, relrowsecurity
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in (
    'members', 'polls', 'poll_votes', 'match_candidates', 'candidate_reactions',
    'matches', 'match_attendance', 'ledger', 'snack_claims', 'rotation_history'
  )
order by relname;

-- 정책 37행, 모든 roles = {authenticated}; qual / with_check도 확인
select tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'members', 'polls', 'poll_votes', 'match_candidates', 'candidate_reactions',
    'matches', 'match_attendance', 'ledger', 'snack_claims', 'rotation_history'
  )
order by tablename, policyname;
```

이 파일의 멱등성은 같은 스키마의 반복 적용을 대상으로 합니다. `create table if not exists`는 이미 존재하는 다른 구조의 테이블을 마이그레이션하지 않습니다.

## 3. 비로그인 조회 차단

SQL Editor의 기본 관리자 역할은 RLS를 우회하므로 비로그인 검증은 REST API로 수행합니다. 아래는 Bash에서 사용하는 `curl` 예시입니다. `<PROJECT_REF>`, `<ANON_KEY>` 등은 실행할 환경의 값으로 바꾸되 실제 비밀값과 로그인 응답은 커밋하지 않습니다.

```sh
curl -i 'https://<PROJECT_REF>.supabase.co/rest/v1/members?select=id' \
  -H 'apikey: <ANON_KEY>' \
  -H 'Authorization: Bearer <ANON_KEY>' \
  -H 'Prefer: count=exact'
```

`count=exact`는 비로그인 세션에서 `select count(*) from members`를 확인하는 것과 같은 행 수 검증입니다. **0행(`[]`, 전체 건수 0) 또는 권한 오류**여야 합니다. 이 스키마는 anon의 테이블 권한도 회수하므로 일반적으로 HTTP 401/403, 코드 `42501` 권한 오류가 납니다. 12명 데이터가 반환되면 검증 실패입니다.

## 4. 팀 로그인과 투표 입력

SQL Editor에서 검증용 투표 1개를 준비하고 반환된 ID를 `<POLL_ID>`로 사용합니다. 예시 경기 날짜가 이미 존재하면 사용하지 않는 날짜로 변경합니다.

```sql
insert into public.polls (match_date, opens_at, closes_at)
values ('2099-01-03', now() - interval '1 hour', now() + interval '1 hour')
returning id;
```

팀 계정으로 로그인하고 응답의 `access_token`을 `<TEAM_ACCESS_TOKEN>`으로 사용합니다.

```sh
curl -i 'https://<PROJECT_REF>.supabase.co/auth/v1/token?grant_type=password' \
  -H 'apikey: <ANON_KEY>' \
  -H 'Content-Type: application/json' \
  --data '{"email":"team@fcexican.local","password":"<TEAM_PIN>"}'

curl -i 'https://<PROJECT_REF>.supabase.co/rest/v1/poll_votes?on_conflict=poll_id,member_id' \
  -H 'apikey: <ANON_KEY>' \
  -H 'Authorization: Bearer <TEAM_ACCESS_TOKEN>' \
  -H 'Content-Type: application/json' \
  -H 'Prefer: resolution=merge-duplicates,return=representation' \
  --data '{"poll_id":"<POLL_ID>","member_id":"m01","choice":"attend"}'
```

성공 응답에 `is_late: false`와 서버가 설정한 `updated_at`이 있어야 합니다. 같은 요청을 다시 보내도 `(poll_id, member_id)`는 1행이며 `updated_at`은 갱신됩니다.

SQL Editor에서 해당 투표의 `closes_at`을 과거로 바꾸고 같은 요청을 보내면 `is_late: true`가 됩니다. `cancelled = true`로 바꾼 뒤에는 새 팀 투표 삽입이 거부되어야 합니다(`member_id`를 아직 투표하지 않은 `m02`로 변경). 기존 투표 수정 역시 적용되지 않아야 합니다. UPDATE는 RLS에 의해 0행이 될 수도 있으므로 응답 코드만 보지 말고 아래 조회로 값이 유지되는지 확인합니다.

```sql
update public.polls set closes_at = now() - interval '1 minute' where id = '<POLL_ID>';
-- 팀 요청을 다시 실행하여 is_late = true 확인 후 취소합니다.
update public.polls set cancelled = true where id = '<POLL_ID>';
-- 팀의 새 삽입·수정 요청을 시도한 후 상태를 확인합니다.
select member_id, choice, is_late, updated_at
from public.poll_votes where poll_id = '<POLL_ID>';
```

## 5. 장부는 회장만 입력 가능

동일한 테스트 행을 팀 계정과 회장 계정으로 각각 요청합니다. 먼저 팀 계정 요청은 HTTP 403 / RLS 오류(`42501`)여야 합니다.

```sh
curl -i 'https://<PROJECT_REF>.supabase.co/rest/v1/ledger' \
  -H 'apikey: <ANON_KEY>' \
  -H 'Authorization: Bearer <TEAM_ACCESS_TOKEN>' \
  -H 'Content-Type: application/json' \
  -H 'Prefer: return=representation' \
  --data '{"member_id":"m01","category":"adjustment","amount":1,"ref_poll_id":"<POLL_ID>","note":"002 권한 검증용"}'

curl -i 'https://<PROJECT_REF>.supabase.co/auth/v1/token?grant_type=password' \
  -H 'apikey: <ANON_KEY>' \
  -H 'Content-Type: application/json' \
  --data '{"email":"admin@fcexican.local","password":"<ADMIN_PASSWORD>"}'

curl -i 'https://<PROJECT_REF>.supabase.co/rest/v1/ledger' \
  -H 'apikey: <ANON_KEY>' \
  -H 'Authorization: Bearer <ADMIN_ACCESS_TOKEN>' \
  -H 'Content-Type: application/json' \
  -H 'Prefer: return=representation' \
  --data '{"member_id":"m01","category":"adjustment","amount":1,"ref_poll_id":"<POLL_ID>","note":"002 권한 검증용"}'
```

회장 로그인 응답의 `access_token`을 `<ADMIN_ACCESS_TOKEN>`으로 사용하면 HTTP 201과 생성된 장부 행이 반환되어야 합니다. 회장 입력을 그대로 반복하면 부분 unique index에 의해 중복 오류가 나는 것이 정상입니다. `member_id`가 NULL인 팀 단위 장부에는 Postgres 기본 NULL 비교 규칙이 적용되므로 이 unique index가 중복을 막지 않습니다.

검증 후 SQL Editor에서 **이번에 생성한 투표 ID**를 지정해 테스트 장부와 투표를 정리합니다. 연결된 투표 응답은 cascade로 삭제됩니다.

```sql
begin;
delete from public.ledger where ref_poll_id = '<POLL_ID>' and note = '002 권한 검증용';
delete from public.polls where id = '<POLL_ID>';
commit;
```

세부 역할 구분은 [Supabase RLS 문서](https://supabase.com/docs/guides/database/postgres/row-level-security)를 참고합니다. 공유 계정이므로 팀 계정은 지정한 `member_id`로 투표·반응·간식청구를 작성할 수 있으며, 개인별 소유권 검사는 발주서에 포함되지 않습니다. 간식 승인 시 장부 기록 등 애플리케이션 자동화도 이 SQL의 범위 밖입니다.

## 6. 저장소 정적 검사

발주서 001의 테스트 러너가 적용된 저장소에서는 `npm test`가 `test/schema.test.js`를 포함해 실행합니다. 아직 `package.json`이 없는 002 단독 브랜치에서는 저장소 루트에서 아래 명령으로 정적 검사를 실행할 수 있습니다.

```sh
node --test test/schema.test.js
```

정적 검사는 테이블 10개의 생성 및 RLS 활성화, anon 정책 부재, 헬퍼 정의, 시드 12명의 ID·순서·이름·회장 지정과 `on conflict`를 검사합니다. SQL 실행 가능성과 실제 접근 권한은 위 Supabase 수동 절차로 별도 검증합니다.
