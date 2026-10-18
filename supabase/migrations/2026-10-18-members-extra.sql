-- 2026-10-18: 멤버 표 사용자 정의 열 — 관리 화면 "열 추가/삭제"가 members.extra(jsonb)에 키=열 이름, 값=문자열로 저장
alter table public.members add column if not exists extra jsonb not null default '{}'::jsonb;
