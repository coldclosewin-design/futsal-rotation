-- 2026-10-15: ledger 멱등 키 변경 (PostgREST on_conflict는 partial index를 추론하지 못함 → 42P10)
alter table public.ledger add column if not exists period text;
drop index if exists public.ledger_member_category_poll_uidx;
drop index if exists public.ledger_member_category_match_uidx;
drop index if exists public.ledger_member_category_date_uidx;
create unique index if not exists ledger_uidx_poll on public.ledger (member_id, category, ref_poll_id);
create unique index if not exists ledger_uidx_match on public.ledger (member_id, category, ref_match_id);
create unique index if not exists ledger_uidx_period on public.ledger (member_id, category, period);
