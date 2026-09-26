-- Realtime cho văn bản tổng hợp: danh sách tự cập nhật khi văn bản được tạo tự động sau phiên âm,
-- do người khác tạo, hoặc đổi trạng thái (đang tạo → xong / lỗi) — không cần tải lại trang.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reports'
     ) then
    alter publication supabase_realtime add table public.reports;
  end if;
end;
$$;
