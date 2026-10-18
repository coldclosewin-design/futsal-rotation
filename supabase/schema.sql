-- Supabase SQL Editor에서 파일 전체를 실행합니다. 재실행해도 기존 행은 보존합니다.
begin;

create or replace function public.is_team()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.jwt() ->> 'email' in ('team@fcexican.local', 'admin@fcexican.local');
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.jwt() ->> 'email' = 'admin@fcexican.local';
$$;

create table if not exists public.members (
  id text primary key,
  name text not null unique,
  phone text,
  bank_account text,
  active boolean not null default true,
  joined_at date,
  is_president boolean not null default false,
  injury_from date,
  injury_to date,
  created_at timestamptz not null default now()
);
alter table public.members enable row level security;
-- 2026-10-18: 관리 화면에서 회장이 추가·삭제하는 사용자 정의 열(예: 포지션, 등번호). 키 = 열 이름, 값 = 문자열.
alter table public.members add column if not exists extra jsonb not null default '{}'::jsonb;

create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  match_date date not null unique,
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  cancelled boolean not null default false,
  match_id uuid,
  title text,
  fines boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.polls enable row level security;
alter table public.polls add column if not exists title text;
alter table public.polls add column if not exists fines boolean not null default true;

create table if not exists public.poll_votes (
  poll_id uuid references public.polls(id) on delete cascade,
  member_id text references public.members(id),
  choice text not null check (choice in ('attend', 'absent')),
  voted_at timestamptz not null default now(),
  is_late boolean not null default false,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (poll_id, member_id)
);
alter table public.poll_votes enable row level security;

create table if not exists public.match_candidates (
  article_id bigint primary key,
  menu_id int not null,
  menu_name text,
  subject text not null,
  head_name text,
  is_closed boolean not null default false,
  write_ts timestamptz,
  comment_count int default 0,
  read_count int default 0,
  parsed_date date,
  start_hour int,
  end_hour int,
  weekday text,
  parsed_format text,
  venue text,
  parse_ok boolean not null default false,
  scraper_score int not null default 0,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  phone text,
  contact_status text not null default 'new'
    check (contact_status in ('new', 'contacted', 'replied', 'confirmed', 'rejected')),
  memo text,
  our_priority int,
  admin_updated_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.match_candidates enable row level security;

create table if not exists public.candidate_reactions (
  article_id bigint references public.match_candidates(article_id) on delete cascade,
  member_id text references public.members(id),
  created_at timestamptz not null default now(),
  primary key (article_id, member_id)
);
alter table public.candidate_reactions enable row level security;

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  match_date date not null,
  start_time time not null,
  end_time time,
  venue text,
  opponent text,
  format text check (format in ('5v5', '6v6')),
  cost int not null default 0,
  candidate_article_id bigint references public.match_candidates(article_id),
  poll_id uuid references public.polls(id),
  arranged_by text references public.members(id),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'played', 'cancelled', 'fallback_plab')),
  score_us int,
  score_them int,
  schedule jsonb,
  memo text,
  created_at timestamptz not null default now(),
  unique (match_date, start_time)
);
alter table public.matches enable row level security;

-- polls와 matches의 순환 참조는 두 테이블이 모두 생성된 뒤 연결합니다.
do $$
begin
  alter table public.polls
    add constraint polls_match_id_fkey foreign key (match_id) references public.matches(id);
exception
  when duplicate_object then null;
end;
$$;

create table if not exists public.match_attendance (
  match_id uuid references public.matches(id) on delete cascade,
  member_id text references public.members(id),
  status text not null check (status in ('present', 'late', 'late_kickoff', 'no_show', 'excused')),
  note text,
  created_at timestamptz not null default now(),
  primary key (match_id, member_id)
);
alter table public.match_attendance enable row level security;

create table if not exists public.ledger (
  id bigint generated always as identity primary key,
  entry_date date not null default current_date,
  member_id text references public.members(id),
  category text not null check (category in (
    'dues', 'injury_exempt', 'president_exempt', 'fine_late_vote',
    'fine_no_show', 'fine_late', 'fine_late_kickoff', 'venue_fee',
    'snack', 'plab_support', 'deposit', 'adjustment'
  )),
  amount int not null,
  settled boolean not null default false,
  ref_match_id uuid references public.matches(id),
  ref_poll_id uuid references public.polls(id),
  period text,
  note text,
  created_at timestamptz not null default now()
);
alter table public.ledger enable row level security;
alter table public.ledger add column if not exists period text;

create table if not exists public.snack_claims (
  id bigint generated always as identity primary key,
  match_id uuid references public.matches(id),
  buyer_id text not null references public.members(id),
  amount int not null check (amount > 0),
  items text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);
alter table public.snack_claims enable row level security;

create table if not exists public.rotation_history (
  match_id uuid references public.matches(id) on delete cascade,
  member_id text references public.members(id),
  active_quarters int not null,
  gk_count int not null default 0,
  rest_count int not null default 0,
  out_quarters int[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (match_id, member_id)
);
alter table public.rotation_history enable row level security;

-- PostgREST의 on_conflict는 partial index를 추론하지 못하므로(42P10) 전체 unique index를 쓴다.
-- NULL은 서로 다른 값으로 취급되므로 ref/period가 없는 행은 제한되지 않는다.
drop index if exists public.ledger_member_category_poll_uidx;
drop index if exists public.ledger_member_category_match_uidx;
drop index if exists public.ledger_member_category_date_uidx;
create unique index if not exists ledger_uidx_poll
  on public.ledger (member_id, category, ref_poll_id);
create unique index if not exists ledger_uidx_match
  on public.ledger (member_id, category, ref_match_id);
create unique index if not exists ledger_uidx_period
  on public.ledger (member_id, category, period);
create index if not exists match_candidates_date_score_idx
  on public.match_candidates (parsed_date, scraper_score desc);
create index if not exists match_candidates_closed_idx
  on public.match_candidates (is_closed);
create index if not exists ledger_member_settled_idx
  on public.ledger (member_id, settled);
create index if not exists poll_votes_poll_idx
  on public.poll_votes (poll_id);

create or replace function public.set_poll_vote_timestamps()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  new.is_late = now() > (select closes_at from public.polls where id = new.poll_id);
  return new;
end;
$$;

drop trigger if exists poll_votes_set_timestamps on public.poll_votes;
create trigger poll_votes_set_timestamps
  before insert or update on public.poll_votes
  for each row execute function public.set_poll_vote_timestamps();

-- 프로젝트 기본 권한에 의존하지 않고, 작업별 권한과 RLS를 함께 설정합니다.
revoke all on table public.members, public.polls, public.poll_votes,
  public.match_candidates, public.candidate_reactions, public.matches,
  public.match_attendance, public.ledger, public.snack_claims, public.rotation_history
  from public, anon, authenticated;
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on table public.members, public.polls,
  public.poll_votes, public.matches, public.match_attendance, public.ledger,
  public.snack_claims, public.rotation_history to authenticated;
grant select, update on table public.match_candidates to authenticated;
grant select, insert, delete on table public.candidate_reactions to authenticated;
grant all on table public.members, public.polls, public.poll_votes,
  public.match_candidates, public.candidate_reactions, public.matches,
  public.match_attendance, public.ledger, public.snack_claims, public.rotation_history
  to service_role;
revoke all on sequence public.ledger_id_seq, public.snack_claims_id_seq
  from public, anon, authenticated;
grant usage, select on sequence public.ledger_id_seq, public.snack_claims_id_seq
  to authenticated, service_role;

-- 읽기: 팀 계정과 회장 계정만 허용합니다.
drop policy if exists members_select_team on public.members;
create policy members_select_team on public.members
  for select to authenticated using (public.is_team());
drop policy if exists polls_select_team on public.polls;
create policy polls_select_team on public.polls
  for select to authenticated using (public.is_team());
drop policy if exists poll_votes_select_team on public.poll_votes;
create policy poll_votes_select_team on public.poll_votes
  for select to authenticated using (public.is_team());
drop policy if exists match_candidates_select_team on public.match_candidates;
create policy match_candidates_select_team on public.match_candidates
  for select to authenticated using (public.is_team());
drop policy if exists candidate_reactions_select_team on public.candidate_reactions;
create policy candidate_reactions_select_team on public.candidate_reactions
  for select to authenticated using (public.is_team());
drop policy if exists matches_select_team on public.matches;
create policy matches_select_team on public.matches
  for select to authenticated using (public.is_team());
drop policy if exists match_attendance_select_team on public.match_attendance;
create policy match_attendance_select_team on public.match_attendance
  for select to authenticated using (public.is_team());
drop policy if exists ledger_select_team on public.ledger;
create policy ledger_select_team on public.ledger
  for select to authenticated using (public.is_team());
drop policy if exists snack_claims_select_team on public.snack_claims;
create policy snack_claims_select_team on public.snack_claims
  for select to authenticated using (public.is_team());
drop policy if exists rotation_history_select_team on public.rotation_history;
create policy rotation_history_select_team on public.rotation_history
  for select to authenticated using (public.is_team());

-- 회장만 생성·변경·삭제할 수 있는 데이터입니다.
drop policy if exists members_insert_admin on public.members;
create policy members_insert_admin on public.members
  for insert to authenticated with check (public.is_admin());
drop policy if exists members_update_admin on public.members;
create policy members_update_admin on public.members
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists members_delete_admin on public.members;
create policy members_delete_admin on public.members
  for delete to authenticated using (public.is_admin());

drop policy if exists polls_insert_admin on public.polls;
create policy polls_insert_admin on public.polls
  for insert to authenticated with check (public.is_admin());
drop policy if exists polls_update_admin on public.polls;
create policy polls_update_admin on public.polls
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists polls_delete_admin on public.polls;
create policy polls_delete_admin on public.polls
  for delete to authenticated using (public.is_admin());

drop policy if exists matches_insert_admin on public.matches;
create policy matches_insert_admin on public.matches
  for insert to authenticated with check (public.is_admin());
drop policy if exists matches_update_admin on public.matches;
create policy matches_update_admin on public.matches
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists matches_delete_admin on public.matches;
create policy matches_delete_admin on public.matches
  for delete to authenticated using (public.is_admin());

drop policy if exists match_attendance_insert_admin on public.match_attendance;
create policy match_attendance_insert_admin on public.match_attendance
  for insert to authenticated with check (public.is_admin());
drop policy if exists match_attendance_update_admin on public.match_attendance;
create policy match_attendance_update_admin on public.match_attendance
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists match_attendance_delete_admin on public.match_attendance;
create policy match_attendance_delete_admin on public.match_attendance
  for delete to authenticated using (public.is_admin());

drop policy if exists ledger_insert_admin on public.ledger;
create policy ledger_insert_admin on public.ledger
  for insert to authenticated with check (public.is_admin());
drop policy if exists ledger_update_admin on public.ledger;
create policy ledger_update_admin on public.ledger
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists ledger_delete_admin on public.ledger;
create policy ledger_delete_admin on public.ledger
  for delete to authenticated using (public.is_admin());

drop policy if exists rotation_history_insert_admin on public.rotation_history;
create policy rotation_history_insert_admin on public.rotation_history
  for insert to authenticated with check (public.is_admin());
drop policy if exists rotation_history_update_admin on public.rotation_history;
create policy rotation_history_update_admin on public.rotation_history
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists rotation_history_delete_admin on public.rotation_history;
create policy rotation_history_delete_admin on public.rotation_history
  for delete to authenticated using (public.is_admin());

-- 취소되지 않은 투표는 팀 계정으로 작성·변경할 수 있습니다.
drop policy if exists poll_votes_insert_team on public.poll_votes;
create policy poll_votes_insert_team on public.poll_votes
  for insert to authenticated
  with check (
    public.is_team() and exists (
      select 1 from public.polls p where p.id = poll_votes.poll_id and not p.cancelled
    )
  );
drop policy if exists poll_votes_update_team on public.poll_votes;
create policy poll_votes_update_team on public.poll_votes
  for update to authenticated
  using (
    public.is_team() and exists (
      select 1 from public.polls p where p.id = poll_votes.poll_id and not p.cancelled
    )
  )
  with check (
    public.is_team() and exists (
      select 1 from public.polls p where p.id = poll_votes.poll_id and not p.cancelled
    )
  );
drop policy if exists poll_votes_delete_admin on public.poll_votes;
create policy poll_votes_delete_admin on public.poll_votes
  for delete to authenticated using (public.is_admin());

-- 후보 생성·삭제는 RLS를 우회하는 service_role 수집기만 수행합니다.
drop policy if exists match_candidates_update_admin on public.match_candidates;
create policy match_candidates_update_admin on public.match_candidates
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists candidate_reactions_insert_team on public.candidate_reactions;
create policy candidate_reactions_insert_team on public.candidate_reactions
  for insert to authenticated with check (public.is_team());
drop policy if exists candidate_reactions_delete_team on public.candidate_reactions;
create policy candidate_reactions_delete_team on public.candidate_reactions
  for delete to authenticated using (public.is_team());

drop policy if exists snack_claims_insert_team on public.snack_claims;
create policy snack_claims_insert_team on public.snack_claims
  for insert to authenticated with check (public.is_team());
drop policy if exists snack_claims_update_admin on public.snack_claims;
create policy snack_claims_update_admin on public.snack_claims
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists snack_claims_delete_admin on public.snack_claims;
create policy snack_claims_delete_admin on public.snack_claims
  for delete to authenticated using (public.is_admin());

commit;
