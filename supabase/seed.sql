-- members.json의 순서와 ID를 유지합니다. 재실행 시 운영 중인 회장 지정은 보존합니다.
insert into public.members (id, name, is_president) values
  ('m01', '오승환', false),
  ('m02', '정운수', false),
  ('m03', '안준호', true),
  ('m04', '박동규', false),
  ('m05', '권형관', false),
  ('m06', '박규설', false),
  ('m07', '조성훈', false),
  ('m08', '정현욱', false),
  ('m09', '최준혁', false),
  ('m10', '고유찬', false),
  ('m11', '한상훈', false),
  ('m12', '전준영', false)
on conflict (id) do update set name = excluded.name;
