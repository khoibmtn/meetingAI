-- Kiểm thử RLS: chạy sau supabase-stub.sql + migrations. Lỗi => ON_ERROR_STOP dừng.
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@bv.vn', '{"full_name":"Bác sĩ A"}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@bv.vn', '{"full_name":"Bác sĩ B"}'),
  ('00000000-0000-0000-0000-00000000000c', 'c@bv.vn', '{"full_name":"Bác sĩ C"}');

do $$ begin
  assert (select role from public.profiles where email = 'a@bv.vn') = 'admin', 'user dau tien phai la admin';
  assert (select role from public.profiles where email = 'b@bv.vn') = 'member', 'user sau la member';
end $$;

create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u::text, false);
  execute 'set role authenticated';
end $$;

insert into public.ai_connections (scope, name, provider, encrypted_key, model)
values ('org', 'Gemini tổ chức', 'gemini', 'v1.x.y.z', 'gemini-3.8-flash');

-- A tạo bản ghi
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.recordings (id, owner_id, title) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Giao ban khoa GMHS');
reset role;
insert into public.transcripts (recording_id, segments, search_text)
values ('10000000-0000-0000-0000-000000000001', '[{"id":"s1","start":0,"end":3,"speaker":"S1","text":"Xin chào"}]', 'Xin chào Gây mê Hồi sức, đặt nội khí quản');
do $$ begin
  assert (select search_text from public.transcripts where recording_id = '10000000-0000-0000-0000-000000000001')
    = 'xin chao gay me hoi suc, dat noi khi quan', 'search_text phai duoc chuan hoa bo dau';
end $$;

-- B chưa thấy
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
do $$ begin
  assert (select count(*) from public.recordings) = 0, 'B khong duoc thay ban ghi cua A';
  assert (select count(*) from public.transcripts) = 0, 'B khong duoc thay transcript cua A';
end $$;
reset role;

-- A tạo nhóm (INSERT ... RETURNING phải chạy được), thêm B, chia sẻ bản ghi
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
with g as (
  insert into public.groups (id, name, owner_id)
  values ('20000000-0000-0000-0000-000000000001', 'Khoa GMHS', '00000000-0000-0000-0000-00000000000a')
  returning id
) select * from g;
insert into public.group_members (group_id, user_id) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b');
insert into public.recording_shares (recording_id, group_id, shared_by) values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a');
reset role;

-- B thấy qua nhóm, nhưng chưa được sửa
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
do $$ begin
  assert (select count(*) from public.recordings) = 1, 'B phai thay ban ghi da chia se';
  assert (select count(*) from public.transcripts) = 1, 'B phai thay transcript';
  assert (select count(*) from public.channels) = 1, 'B thay kenh chat nhom';
end $$;
update public.recordings set title = 'B sửa' where id = '10000000-0000-0000-0000-000000000001';
do $$ begin
  assert (select title from public.recordings where id = '10000000-0000-0000-0000-000000000001') = 'Giao ban khoa GMHS', 'B chi co quyen xem';
end $$;
-- B nhắn tin nhóm
insert into public.messages (channel_id, sender_id, content)
select id, '00000000-0000-0000-0000-00000000000b', 'Chào cả nhóm' from public.channels where group_id = '20000000-0000-0000-0000-000000000001';
reset role;

-- A nâng quyền chia sẻ lên 'edit'
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
update public.recording_shares set permission = 'edit' where recording_id = '10000000-0000-0000-0000-000000000001';
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
update public.recordings set title = 'Giao ban 25/9' where id = '10000000-0000-0000-0000-000000000001';
do $$ begin
  assert (select title from public.recordings where id = '10000000-0000-0000-0000-000000000001') = 'Giao ban 25/9', 'B co quyen sua';
end $$;
-- B không được đổi chủ sở hữu (cột bị chặn)
do $$ begin
  begin
    update public.recordings set owner_id = '00000000-0000-0000-0000-00000000000b' where id = '10000000-0000-0000-0000-000000000001';
    raise exception 'KHONG DUOC PHEP doi owner_id';
  exception when insufficient_privilege then null;
  end;
end $$;
-- B không được sửa bản transcript gốc
do $$ begin
  begin
    update public.transcripts set original_segments = '[]' where recording_id = '10000000-0000-0000-0000-000000000001';
    raise exception 'KHONG DUOC PHEP sua original_segments';
  exception when insufficient_privilege then null;
  end;
end $$;
-- B không đọc được khoá API / cấu hình
do $$ begin
  assert (select count(*) from public.ai_connections) = 0;
  assert (select count(*) from public.ai_assignments) = 0;
  assert (select count(*) from public.app_settings) = 0;
end $$;
reset role;

-- C không thấy gì, không nhắn được vào kênh nhóm
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
do $$ begin
  assert (select count(*) from public.recordings) = 0, 'C khong thay ban ghi';
  assert (select count(*) from public.messages) = 0, 'C khong thay tin nhan';
  assert (select count(*) from public.groups) = 0, 'C khong thay nhom';
end $$;
do $$ begin
  begin
    insert into public.messages (channel_id, sender_id, content)
    select c.id, '00000000-0000-0000-0000-00000000000c', 'xâm nhập'
      from public.channels c;  -- không thấy kênh nào => 0 dòng
    assert (select count(*) from public.messages) = 0;
  end;
end $$;
-- C tham gia nhóm bằng mã mời
reset role;
select invite_code as code from public.groups where id = '20000000-0000-0000-0000-000000000001' \gset
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select public.join_group_by_code(:'code');
do $$ begin
  assert (select count(*) from public.recordings) = 1, 'C vao nhom thi thay ban ghi';
  assert (select count(*) from public.messages) = 1, 'C thay tin nhan nhom';
end $$;
-- Chat 1-1 C <-> A
select public.get_or_create_dm('00000000-0000-0000-0000-00000000000a') as dm \gset
insert into public.messages (channel_id, sender_id, content) values (:'dm', '00000000-0000-0000-0000-00000000000c', 'Chào anh');
do $$ begin
  assert (select count(*) from public.my_channels()) = 2, 'C co 2 kenh';
end $$;
-- Ghi chú riêng tư
insert into public.notes (user_id, recording_id, content) values
  ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000001', 'Ghi chú của C');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
do $$ begin
  assert (select count(*) from public.notes) = 0, 'B khong thay ghi chu cua C';
  assert (select count(*) from public.messages where channel_id in (select id from public.channels where kind = 'direct')) = 0, 'B khong thay DM cua A-C';
  assert (select unread_count from public.my_channels() where kind = 'group') = 0, 'tin cua chinh B khong tinh chua doc';
  assert (select count(*) from public.search_recordings('hồi sức')) = 1, 'tim kiem khong dau qua transcript';
  assert (select count(*) from public.search_recordings('25/9')) = 1, 'tim kiem theo tieu de';
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
do $$ begin
  assert (select unread_count from public.my_channels() where kind = 'direct') = 1, 'A co 1 tin chua doc tu C';
end $$;
select public.mark_channel_read(:'dm');
do $$ begin
  assert (select unread_count from public.my_channels() where kind = 'direct') = 0, 'da doc';
end $$;
reset role;

-- Worker (service role) nhận chunk đúng 1 lần
insert into public.transcription_jobs (id, recording_id) values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001');
insert into public.transcription_chunks (job_id, idx, start_sec, end_sec) values ('30000000-0000-0000-0000-000000000001', 0, 0, 600);
set role service_role;
do $$ begin
  assert public.claim_transcription_chunk('30000000-0000-0000-0000-000000000001', 0) = true, 'claim lan 1';
  assert public.claim_transcription_chunk('30000000-0000-0000-0000-000000000001', 0) = false, 'claim lan 2 phai that bai';
  assert public.claim_job('30000000-0000-0000-0000-000000000001', array['queued'], 'preparing') = true;
  assert public.claim_job('30000000-0000-0000-0000-000000000001', array['queued'], 'preparing') = false;
end $$;
reset role;
-- bước bị treo quá hạn thì nhận lại được
alter table public.transcription_jobs disable trigger transcription_jobs_updated_at;
update public.transcription_jobs set updated_at = now() - interval '1 hour' where id = '30000000-0000-0000-0000-000000000001';
alter table public.transcription_jobs enable trigger transcription_jobs_updated_at;
set role service_role;
do $$ begin
  assert public.claim_job('30000000-0000-0000-0000-000000000001', array['queued'], 'preparing', 60) = true, 'nhan lai buoc bi treo';
  assert (select updated_at > now() - interval '1 minute' from public.transcription_jobs where id = '30000000-0000-0000-0000-000000000001'), 'claim cap nhat updated_at';
end $$;
reset role;

select 'RLS OK' as result;
