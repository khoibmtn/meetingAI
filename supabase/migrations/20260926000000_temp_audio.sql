-- =============================================================================
-- Phiên âm không lưu tệp ghi âm
--   Khi chưa kết nối (hoặc không tải được lên) Google Drive, tệp ghi âm được giữ TẠM trong
--   Supabase Storage (bucket riêng tư "audio-temp", chia phần 4 MiB) chỉ để phiên âm, và bị xoá
--   ngay khi phiên âm xong. Bản ghi vẫn giữ transcript; có thể tải tệp lên sau để nghe lại
--   hoặc phiên âm lại.
--     upload_status = 'temporary'  : đang có tệp tạm (chờ/đang phiên âm)
--     upload_status = 'discarded'  : đã phiên âm, tệp không được lưu
--   Bucket không có policy cho người dùng: chỉ máy chủ (service role) đọc/ghi.
-- =============================================================================

alter table public.recordings drop constraint if exists recordings_upload_status_check;
alter table public.recordings add constraint recordings_upload_status_check
  check (upload_status in ('pending', 'uploading', 'uploaded', 'failed', 'temporary', 'discarded'));

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('audio-temp', 'audio-temp', false, 8388608)
    on conflict (id) do nothing;
  end if;
end $$;
