# [002] Supabase 스키마·RLS·시드 SQL

- 브랜치: `codex/002-supabase-schema`
- 의존: 없음 (001과 병렬 가능)
- 예상 규모: M

## 배경
투표·매칭 후보·장부처럼 여러 명이 읽고 쓰는 데이터를 Supabase(Postgres)에 둡니다.
접근 모델은 공유 계정 2개입니다: `team@fcexican.local`(팀 PIN, 읽기 + 투표/반응/간식청구)과
`admin@fcexican.local`(회장, 모든 쓰기). 비로그인(anon)은 아무것도 읽을 수 없어야 합니다.
상세 설계: `docs/PLAN.md` §4.

이 발주서는 **SQL 파일 작성만** 요구합니다. Supabase 프로젝트에 적용·검증은 Claude가 합니다.
따라서 SQL은 Supabase SQL Editor에 그대로 붙여 넣어 **한 번에, 그리고 반복 실행해도** 오류 없이 실행되어야 합니다.

## 목표
- `supabase/schema.sql` 한 파일로 테이블·제약·함수·트리거·RLS 정책이 모두 생성된다.
- `supabase/seed.sql`로 `members.json`의 12명이 `members`에 들어간다.
- `supabase/README.md`에 적용 순서와 검증 쿼리가 있다.

## 변경 파일
- (신규) `supabase/schema.sql`
- (신규) `supabase/seed.sql`
- (신규) `supabase/README.md`
- (신규) `test/schema.test.js` — SQL 파일의 정적 검사(아래 9번)

## 변경 금지
- 그 외 모든 파일

## 상세 요구사항
1. **멱등성**: `create table if not exists`, `create or replace function`, `drop policy if exists … ; create policy …`, `drop trigger if exists … ; create trigger …`. 재실행 시 데이터는 보존.
2. **헬퍼 함수** (`language sql stable security definer`, `set search_path = public`):
   - `public.is_team()` → `auth.jwt() ->> 'email' in ('team@fcexican.local', 'admin@fcexican.local')`
   - `public.is_admin()` → `auth.jwt() ->> 'email' = 'admin@fcexican.local'`
3. **테이블** — 모두 `created_at timestamptz not null default now()` 포함, 생성 직후 `alter table … enable row level security`:

   | 테이블 | 컬럼 | 키·제약 |
   |---|---|---|
   | `members` | `id text`, `name text not null`, `phone text`, `bank_account text`, `active boolean not null default true`, `joined_at date`, `is_president boolean not null default false`, `injury_from date`, `injury_to date` | PK `id`, unique `name` |
   | `polls` | `id uuid default gen_random_uuid()`, `match_date date not null`, `opens_at timestamptz not null`, `closes_at timestamptz not null`, `cancelled boolean not null default false`, `match_id uuid` | PK `id`, unique `match_date` |
   | `poll_votes` | `poll_id uuid references polls(id) on delete cascade`, `member_id text references members(id)`, `choice text not null check (choice in ('attend','absent'))`, `voted_at timestamptz not null default now()`, `is_late boolean not null default false`, `updated_at timestamptz not null default now()` | PK `(poll_id, member_id)` |
   | `match_candidates` | `article_id bigint`, `menu_id int not null`, `menu_name text`, `subject text not null`, `head_name text`, `is_closed boolean not null default false`, `write_ts timestamptz`, `comment_count int default 0`, `read_count int default 0`, `parsed_date date`, `start_hour int`, `end_hour int`, `weekday text`, `parsed_format text`, `venue text`, `parse_ok boolean not null default false`, `scraper_score int not null default 0`, `first_seen_at timestamptz not null default now()`, `last_seen_at timestamptz not null default now()`, `phone text`, `contact_status text not null default 'new' check (contact_status in ('new','contacted','replied','confirmed','rejected'))`, `memo text`, `our_priority int`, `admin_updated_at timestamptz` | PK `article_id` |
   | `candidate_reactions` | `article_id bigint references match_candidates(article_id) on delete cascade`, `member_id text references members(id)` | PK `(article_id, member_id)` |
   | `matches` | `id uuid default gen_random_uuid()`, `match_date date not null`, `start_time time not null`, `end_time time`, `venue text`, `opponent text`, `format text check (format in ('5v5','6v6'))`, `cost int not null default 0`, `candidate_article_id bigint references match_candidates(article_id)`, `poll_id uuid references polls(id)`, `arranged_by text references members(id)`, `status text not null default 'scheduled' check (status in ('scheduled','played','cancelled','fallback_plab'))`, `score_us int`, `score_them int`, `schedule jsonb`, `memo text` | PK `id`, unique `(match_date, start_time)` |
   | `match_attendance` | `match_id uuid references matches(id) on delete cascade`, `member_id text references members(id)`, `status text not null check (status in ('present','late','late_kickoff','no_show','excused'))`, `note text` | PK `(match_id, member_id)` |
   | `ledger` | `id bigint generated always as identity`, `entry_date date not null default current_date`, `member_id text references members(id)`, `category text not null check (category in ('dues','injury_exempt','president_exempt','fine_late_vote','fine_no_show','fine_late','fine_late_kickoff','venue_fee','snack','plab_support','deposit','adjustment'))`, `amount int not null`, `settled boolean not null default false`, `ref_match_id uuid references matches(id)`, `ref_poll_id uuid references polls(id)`, `note text` | PK `id`; **unique index** `(member_id, category, ref_poll_id) where ref_poll_id is not null`, `(member_id, category, ref_match_id) where ref_match_id is not null`, `(member_id, category, entry_date) where category in ('dues','injury_exempt')` |
   | `snack_claims` | `id bigint generated always as identity`, `match_id uuid references matches(id)`, `buyer_id text not null references members(id)`, `amount int not null check (amount > 0)`, `items text`, `status text not null default 'pending' check (status in ('pending','approved','rejected'))` | PK `id` |
   | `rotation_history` | `match_id uuid references matches(id) on delete cascade`, `member_id text references members(id)`, `active_quarters int not null`, `gk_count int not null default 0`, `rest_count int not null default 0`, `out_quarters int[] not null default '{}'` | PK `(match_id, member_id)` |

   `polls.match_id`는 `matches` 생성 뒤에 `alter table polls add constraint … foreign key (match_id) references matches(id)` 로 추가 (순환 참조 회피, `if not exists`는 제약에 없으므로 `do $$ … exception when duplicate_object …$$` 블록 사용).
4. **트리거**: `poll_votes` `before insert or update` → `new.updated_at = now(); new.is_late = now() > (select closes_at from polls where id = new.poll_id);`
5. **RLS 정책** (정책 이름은 `<table>_<action>_<who>` 형식):
   - 모든 테이블: `select` → `using (public.is_team())`.
   - `members`, `polls`, `matches`, `match_attendance`, `ledger`, `rotation_history`: `insert/update/delete` → `is_admin()`.
   - `poll_votes`: `insert`·`update` → `with check (public.is_team() and exists (select 1 from polls p where p.id = poll_id and not p.cancelled))`; `delete` → `is_admin()`.
   - `match_candidates`: `update` → `is_admin()`. `insert`·`delete` 정책 없음(service role만).
   - `candidate_reactions`: `insert`·`delete` → `is_team()`.
   - `snack_claims`: `insert` → `is_team()`; `update`·`delete` → `is_admin()`.
   - `anon` 역할용 정책은 **하나도 만들지 않는다**.
6. **인덱스**: `match_candidates(parsed_date, scraper_score desc)`, `match_candidates(is_closed)`, `ledger(member_id, settled)`, `poll_votes(poll_id)`.
7. **seed.sql**: `insert into members (id, name, is_president) values … on conflict (id) do update set name = excluded.name`. 12명은 `members.json` 순서·id 그대로. `is_president`는 `m03`(안준호)만 `true`. 전화·계좌는 넣지 않는다.
8. **README.md** (`supabase/`): (1) 프로젝트 생성 시 리전·설정 체크리스트(**Auth → Allow new user signups OFF**, 이메일 확인 OFF, 두 사용자 수동 생성), (2) `schema.sql` → `seed.sql` 순서로 SQL Editor 실행, (3) 검증 쿼리 예시: anon으로 `select count(*) from members`가 0 또는 권한 오류인지 확인하는 `curl` 예시(키는 `<ANON_KEY>` 플레이스홀더), team 로그인 후 `poll_votes` insert가 되는지, admin만 `ledger` insert가 되는지.
9. **test/schema.test.js**: 정적 검사만. `schema.sql`을 읽어 (a) 위 테이블 10개 이름이 모두 `create table if not exists public.<name>` 로 존재, (b) 각 테이블마다 `enable row level security` 문장 존재, (c) `to anon` 문자열이 없음, (d) `is_team`·`is_admin` 함수 정의 존재, (e) `seed.sql`에 `m01`~`m12`가 모두 있음.

## 수용 기준
- [ ] `supabase/schema.sql`이 위 테이블·제약·함수·트리거·정책·인덱스를 모두 포함하고, 파일 전체가 Postgres 15 문법으로 유효하다
- [ ] 같은 파일을 두 번 실행해도 오류가 없도록 모든 문장이 멱등이다
- [ ] 비로그인(anon) 접근을 허용하는 정책이 없다
- [ ] `seed.sql`이 12명을 `on conflict` 로 멱등 삽입한다
- [ ] `npm test`에 `test/schema.test.js`가 포함되어 통과한다
- [ ] `supabase/README.md`에 적용 순서·검증 절차가 있다

## 테스트 방법
- 자동: `npm test`
- 수동(Claude 수행): Supabase SQL Editor에서 `schema.sql` 2회 실행 → 오류 없음, `seed.sql` 실행 → `members` 12행.

## 참고
- Supabase RLS 문서: https://supabase.com/docs/guides/database/postgres/row-level-security
- `auth.jwt()` 는 `authenticated` 세션에서만 email 클레임을 가짐. anon 세션은 `null` → 모든 `using`이 false.
