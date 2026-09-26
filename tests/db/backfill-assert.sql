do $$ begin
  assert (select count(*) from public.profiles) = 2, 'phai tao ho so bu cho 2 tai khoan co san';
  assert (select role from public.profiles where email = 'dau@bv.vn') = 'admin', 'nguoi dang ky som nhat la admin';
  assert (select role from public.profiles where email = 'sau@bv.vn') = 'member', 'nguoi sau la member';
  assert (select full_name from public.profiles where email = 'dau@bv.vn') = 'Người đầu tiên', 'lay ten tu metadata';
  assert (select count(*) from public.profiles where status <> 'active') = 0, 'ho so bu dang hoat dong';
end $$;
-- Tài khoản mới sau migration: trigger tạo hồ sơ member
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f3', 'moi@bv.vn');
do $$ begin
  assert (select role from public.profiles where email = 'moi@bv.vn') = 'member', 'tai khoan moi la member';
end $$;
select 'BACKFILL OK' as result;
