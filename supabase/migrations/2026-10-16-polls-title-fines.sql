-- 2026-10-16: 임의 날짜(공휴일·이벤트) 투표 지원 — 제목, 미투표 벌금 적용 여부
alter table public.polls add column if not exists title text;
alter table public.polls add column if not exists fines boolean not null default true;
