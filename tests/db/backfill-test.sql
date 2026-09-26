-- Kiểm thử: tài khoản đăng ký trước khi chạy migration được tạo hồ sơ bù, người sớm nhất là quản trị viên.
-- Chạy: stub → tệp này (phần trước migration) → migration → tệp backfill-assert.sql
insert into auth.users (id, email, raw_user_meta_data, created_at) values
  ('00000000-0000-0000-0000-0000000000f2', 'sau@bv.vn', '{"full_name":"Người đến sau"}', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-0000000000f1', 'dau@bv.vn', '{"name":"Người đầu tiên"}', now() - interval '2 hours');
