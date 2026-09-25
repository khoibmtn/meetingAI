-- =============================================================================
-- MeetingAI — lược đồ CSDL khởi tạo (Supabase / PostgreSQL 15+)
--
-- Nguyên tắc:
--   * Mọi bảng nghiệp vụ bật RLS. Quyền truy cập bản ghi âm được tính qua các hàm
--     SECURITY DEFINER (can_view_recording / can_edit_recording) để tránh đệ quy RLS.
--   * Bảng chứa bí mật (ai_connections, ai_assignments, app_settings, upload_sessions) bật RLS nhưng
--     KHÔNG có policy => chỉ service role (server) truy cập được.
--   * Worker phiên âm ghi dữ liệu bằng service role; người dùng chỉ đọc tiến độ.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- Bỏ dấu tiếng Việt, dùng cho tìm kiếm không phân biệt dấu (immutable wrapper).
create or replace function public.f_unaccent(text)
returns text
language sql
immutable
parallel safe
strict
set search_path = extensions, public
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, replace(replace($1, 'đ', 'd'), 'Đ', 'D')))
$$;

-- Thoát ký tự đặc biệt của LIKE trong chuỗi tìm kiếm của người dùng.
create or replace function public.like_escape(text)
returns text
language sql
immutable
parallel safe
strict
as $$
  select replace(replace(replace($1, '\', '\\'), '%', '\%'), '_', '\_')
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Hồ sơ người dùng
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  title text,           -- chức danh: BS, ThS.BS, CN...
  department text,      -- khoa/phòng
  avatar_url text,
  role text not null default 'member' check (role in ('admin', 'member')),
  status text not null default 'active' check (status in ('active', 'pending', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Cấu hình hệ thống (chỉ server đọc/ghi). Khoá: 'drive', 'ai_defaults', 'security'...
create table public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Tạo profile khi có tài khoản mới. Người dùng đầu tiên là admin.
-- Nếu app_settings.security.require_approval = true thì tài khoản mới ở trạng thái 'pending'.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_first boolean;
  need_approval boolean;
begin
  select not exists (select 1 from public.profiles) into is_first;
  select coalesce((value ->> 'require_approval')::boolean, false)
    into need_approval
    from public.app_settings where key = 'security';

  insert into public.profiles (id, email, full_name, avatar_url, role, status)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    case when is_first then 'admin' else 'member' end,
    case when is_first or not coalesce(need_approval, false) then 'active' else 'pending' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Hàm quyền (SECURITY DEFINER, dùng trong policy)
-- -----------------------------------------------------------------------------
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'active')
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'active' and role = 'admin'
  )
$$;

-- -----------------------------------------------------------------------------
-- Nhóm
-- -----------------------------------------------------------------------------
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  description text,
  owner_id uuid not null references public.profiles (id) on delete restrict,
  invite_code text not null unique default encode(extensions.gen_random_bytes(6), 'hex'),
  invite_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger groups_updated_at before update on public.groups
  for each row execute function public.set_updated_at();

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index group_members_user_idx on public.group_members (user_id);

create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_user() and exists (
    select 1 from public.group_members where group_id = gid and user_id = auth.uid()
  )
$$;

create or replace function public.is_group_admin(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_user() and exists (
    select 1 from public.group_members
    where group_id = gid and user_id = auth.uid() and role in ('owner', 'admin')
  )
$$;

-- -----------------------------------------------------------------------------
-- Bản ghi âm (recording) + chia sẻ
-- -----------------------------------------------------------------------------
create table public.recordings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  description text,
  category text not null default 'giao_ban'
    check (category in ('giao_ban', 'hop', 'hoi_nghi', 'dao_tao', 'khac')),
  meeting_date date,
  location text,
  participants text,          -- danh sách người dự kiến tham dự (giúp gán tên người nói)
  tags text[] not null default '{}',
  language text not null default 'vi',
  -- Tệp âm thanh gốc (lưu nguyên vẹn trên Google Drive)
  drive_file_id text,
  original_filename text,
  mime_type text,
  size_bytes bigint,
  duration_sec numeric,
  upload_status text not null default 'pending'
    check (upload_status in ('pending', 'uploading', 'uploaded', 'failed')),
  -- Trạng thái xử lý
  status text not null default 'draft'
    check (status in ('draft', 'queued', 'processing', 'ready', 'error')),
  status_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recordings_owner_idx on public.recordings (owner_id, created_at desc);
create index recordings_title_trgm on public.recordings using gin (public.f_unaccent(title) extensions.gin_trgm_ops);

create trigger recordings_updated_at before update on public.recordings
  for each row execute function public.set_updated_at();

create table public.recording_shares (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null references public.recordings (id) on delete cascade,
  group_id uuid references public.groups (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  permission text not null default 'view' check (permission in ('view', 'edit')),
  shared_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check ((group_id is null) <> (user_id is null)),
  unique (recording_id, group_id),
  unique (recording_id, user_id)
);

create index recording_shares_group_idx on public.recording_shares (group_id);
create index recording_shares_user_idx on public.recording_shares (user_id);

create or replace function public.can_view_recording(rid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_user() and exists (
    select 1 from public.recordings r
    where r.id = rid
      and (
        r.owner_id = auth.uid()
        or exists (
          select 1 from public.recording_shares s
          where s.recording_id = r.id
            and (
              s.user_id = auth.uid()
              or (s.group_id is not null and exists (
                select 1 from public.group_members m
                where m.group_id = s.group_id and m.user_id = auth.uid()
              ))
            )
        )
      )
  )
$$;

create or replace function public.can_edit_recording(rid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_user() and exists (
    select 1 from public.recordings r
    where r.id = rid
      and (
        r.owner_id = auth.uid()
        or exists (
          select 1 from public.recording_shares s
          where s.recording_id = r.id
            and s.permission = 'edit'
            and (
              s.user_id = auth.uid()
              or (s.group_id is not null and exists (
                select 1 from public.group_members m
                where m.group_id = s.group_id and m.user_id = auth.uid()
              ))
            )
        )
      )
  )
$$;

create or replace function public.is_recording_owner(rid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.recordings where id = rid and owner_id = auth.uid())
$$;

-- Phiên upload resumable của Google Drive (chứa URL phiên => chỉ server truy cập)
create table public.upload_sessions (
  recording_id uuid primary key references public.recordings (id) on delete cascade,
  session_uri text not null,
  total_bytes bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Transcript + tiến trình phiên âm
-- -----------------------------------------------------------------------------
create table public.transcripts (
  recording_id uuid primary key references public.recordings (id) on delete cascade,
  segments jsonb not null default '[]'::jsonb,           -- bản đang dùng (có thể đã hiệu đính)
  original_segments jsonb not null default '[]'::jsonb,  -- bản máy gốc, không bao giờ sửa
  speakers jsonb not null default '[]'::jsonb,
  engine text,
  model text,
  quality jsonb,              -- thống kê độ phủ, cảnh báo
  search_text text,           -- văn bản bỏ dấu, chữ thường để tìm kiếm
  version integer not null default 1,
  edited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index transcripts_search_trgm on public.transcripts using gin (search_text extensions.gin_trgm_ops);

create trigger transcripts_updated_at before update on public.transcripts
  for each row execute function public.set_updated_at();

-- Chuẩn hoá search_text (bỏ dấu, chữ thường) bất kể nơi ghi — tìm kiếm không dấu luôn khớp.
create or replace function public.normalize_transcript_search()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.search_text := public.f_unaccent(new.search_text);
  return new;
end;
$$;

create trigger transcripts_normalize_search before insert or update of search_text on public.transcripts
  for each row execute function public.normalize_transcript_search();

create table public.transcription_jobs (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null references public.recordings (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  status text not null default 'queued'
    check (status in ('queued', 'preparing', 'transcribing', 'finalizing', 'done', 'error', 'canceled')),
  stage text,
  progress numeric not null default 0,
  error text,
  engine text not null default 'gemini',
  model text,
  options jsonb not null default '{}'::jsonb,
  analysis jsonb,             -- thời lượng, bản đồ tiếng nói, điểm cắt
  total_chunks integer not null default 0,
  done_chunks integer not null default 0,
  base_url text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index transcription_jobs_recording_idx on public.transcription_jobs (recording_id, created_at desc);

create trigger transcription_jobs_updated_at before update on public.transcription_jobs
  for each row execute function public.set_updated_at();

create table public.transcription_chunks (
  job_id uuid not null references public.transcription_jobs (id) on delete cascade,
  idx integer not null,
  kind text not null default 'main' check (kind in ('main', 'gap')),
  start_sec numeric not null,
  end_sec numeric not null,
  file_uri text,
  file_name text,
  mime_type text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'error')),
  attempts integer not null default 0,
  next_attempt_at timestamptz,  -- đoạn lỗi tạm thời: chưa được nhận lại trước thời điểm này (giãn cách thử lại)
  result jsonb,
  error text,
  claimed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (job_id, idx)
);

create trigger transcription_chunks_updated_at before update on public.transcription_chunks
  for each row execute function public.set_updated_at();

-- Nhận (claim) một đoạn để xử lý: tránh 2 worker cùng làm 1 đoạn.
-- Cho phép nhận lại đoạn 'processing' đã quá hạn (worker chết giữa chừng).
create or replace function public.claim_transcription_chunk(p_job uuid, p_idx integer, p_stale_seconds integer default 420)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.transcription_chunks
     set status = 'processing', claimed_at = now(), attempts = attempts + 1, error = null, next_attempt_at = null
   where job_id = p_job and idx = p_idx
     and (
       (status = 'pending' and (next_attempt_at is null or next_attempt_at <= now()))
       or (status = 'processing' and claimed_at < now() - make_interval(secs => p_stale_seconds))
     );
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- Nhận một bước của job (compare-and-set). Cho phép nhận lại khi bước trước bị "treo"
-- (worker chết giữa chừng: updated_at quá p_stale_seconds giây).
create or replace function public.claim_job(p_job uuid, p_from text[], p_to text, p_stale_seconds integer default 420)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.transcription_jobs
     set status = p_to
   where id = p_job
     and (
       status = any (p_from)
       or (status = p_to and updated_at < now() - make_interval(secs => p_stale_seconds))
     );
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke all on function public.claim_transcription_chunk(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.claim_job(uuid, text[], text, integer) from public, anon, authenticated;
grant execute on function public.claim_transcription_chunk(uuid, integer, integer) to service_role;
grant execute on function public.claim_job(uuid, text[], text, integer) to service_role;

-- -----------------------------------------------------------------------------
-- Template tổng hợp (template hệ thống nằm trong mã nguồn; bảng này cho template tuỳ chỉnh)
-- -----------------------------------------------------------------------------
create table public.templates (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'user' check (scope in ('org', 'group', 'user')),
  owner_id uuid references public.profiles (id) on delete cascade,
  group_id uuid references public.groups (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 150),
  description text,
  category text not null default 'chung',
  prompt text not null,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scope <> 'group' or group_id is not null)
);

create trigger templates_updated_at before update on public.templates
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Báo cáo / văn bản tổng hợp sinh từ transcript
-- -----------------------------------------------------------------------------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null references public.recordings (id) on delete cascade,
  template_key text,            -- 'sys:giao-ban' hoặc uuid của template tuỳ chỉnh
  title text not null,
  content text not null default '',
  status text not null default 'ready' check (status in ('generating', 'ready', 'error')),
  provider text,
  model text,
  is_shared boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reports_recording_idx on public.reports (recording_id, created_at desc);

create trigger reports_updated_at before update on public.reports
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Ghi chú cá nhân
-- -----------------------------------------------------------------------------
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  recording_id uuid references public.recordings (id) on delete cascade,
  title text,
  content text not null default '',
  anchor_sec numeric,          -- mốc thời gian trong bản ghi
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notes_user_idx on public.notes (user_id, updated_at desc);
create index notes_recording_idx on public.notes (recording_id);

create trigger notes_updated_at before update on public.notes
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Hỏi đáp AI (lịch sử hội thoại riêng từng người)
-- -----------------------------------------------------------------------------
create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  recording_id uuid references public.recordings (id) on delete cascade,
  group_id uuid references public.groups (id) on delete cascade,
  title text,
  source_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ai_conversations_user_idx on public.ai_conversations (user_id, updated_at desc);

create trigger ai_conversations_updated_at before update on public.ai_conversations
  for each row execute function public.set_updated_at();

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  provider text,
  model text,
  created_at timestamptz not null default now()
);

create index ai_messages_conversation_idx on public.ai_messages (conversation_id, created_at);

-- -----------------------------------------------------------------------------
-- Chat nhóm & chat 1-1
-- -----------------------------------------------------------------------------
create table public.channels (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('group', 'direct')),
  group_id uuid unique references public.groups (id) on delete cascade,
  dm_key text unique,           -- 'uuidA:uuidB' (sắp xếp) cho chat 1-1
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  check ((kind = 'group' and group_id is not null) or (kind = 'direct' and dm_key is not null))
);

create table public.channel_members (
  channel_id uuid not null references public.channels (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

create index channel_members_user_idx on public.channel_members (user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,
  content text not null default '',
  recording_id uuid references public.recordings (id) on delete set null,
  report_id uuid references public.reports (id) on delete set null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

create index messages_channel_idx on public.messages (channel_id, created_at desc);

create or replace function public.can_access_channel(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_user() and exists (
    select 1 from public.channel_members where channel_id = cid and user_id = auth.uid()
  )
$$;

create or replace function public.touch_channel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.channels set last_message_at = new.created_at where id = new.channel_id;
  return new;
end;
$$;

create trigger messages_touch_channel after insert on public.messages
  for each row execute function public.touch_channel();

-- Khi tạo nhóm: thêm chủ nhóm làm thành viên + tạo kênh chat nhóm.
create or replace function public.handle_new_group()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid;
begin
  insert into public.group_members (group_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (group_id, user_id) do update set role = 'owner';

  insert into public.channels (kind, group_id) values ('group', new.id)
  returning id into cid;

  insert into public.channel_members (channel_id, user_id)
  values (cid, new.owner_id)
  on conflict do nothing;
  return new;
end;
$$;

create trigger groups_after_insert after insert on public.groups
  for each row execute function public.handle_new_group();

-- Đồng bộ thành viên nhóm <-> thành viên kênh chat nhóm.
create or replace function public.sync_group_channel_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.channel_members (channel_id, user_id)
    select c.id, new.user_id from public.channels c where c.group_id = new.group_id
    on conflict do nothing;
    return new;
  elsif tg_op = 'DELETE' then
    delete from public.channel_members cm
     using public.channels c
     where c.group_id = old.group_id and cm.channel_id = c.id and cm.user_id = old.user_id;
    return old;
  end if;
  return null;
end;
$$;

create trigger group_members_sync_channel
  after insert or delete on public.group_members
  for each row execute function public.sync_group_channel_member();

-- -----------------------------------------------------------------------------
-- Từ điển thuật ngữ / tên riêng (tăng độ chính xác phiên âm)
-- -----------------------------------------------------------------------------
create table public.glossary_terms (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('org', 'group', 'user')),
  group_id uuid references public.groups (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  term text not null check (char_length(term) between 1 and 200),
  aliases text[] not null default '{}',
  category text,
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (scope <> 'group' or group_id is not null),
  check (scope <> 'user' or user_id is not null)
);

create index glossary_scope_idx on public.glossary_terms (scope, group_id, user_id);

-- -----------------------------------------------------------------------------
-- Kết nối AI (nhà cung cấp + base URL + khoá API mã hoá + mô hình + tham số) và
-- phân công kết nối cho từng vị trí sử dụng AI. Chỉ server (service role) truy cập.
-- -----------------------------------------------------------------------------
create table public.ai_connections (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('org', 'user')),
  user_id uuid references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  provider text not null
    check (provider in ('gemini', 'openai', 'anthropic', 'deepseek', 'openai_compatible', 'soniox')),
  base_url text,
  encrypted_key text not null,
  key_hint text,
  model text not null,
  params jsonb not null default '{}'::jsonb,   -- temperature, top_p, max_output_tokens, effort, verbosity, extra
  status text not null default 'untested' check (status in ('untested', 'ok', 'error')),
  last_tested_at timestamptz,
  last_latency_ms integer,
  last_error text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scope = 'org' and user_id is null) or (scope = 'user' and user_id is not null))
);

create index ai_connections_scope_idx on public.ai_connections (scope, user_id);

create trigger ai_connections_updated_at before update on public.ai_connections
  for each row execute function public.set_updated_at();

create table public.ai_assignments (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('org', 'user')),
  user_id uuid references public.profiles (id) on delete cascade,
  usage text not null
    check (usage in ('transcription', 'speaker_naming', 'term_correction', 'report', 'chat')),
  connection_id uuid not null references public.ai_connections (id) on delete cascade,
  updated_at timestamptz not null default now(),
  check ((scope = 'org' and user_id is null) or (scope = 'user' and user_id is not null))
);

create unique index ai_assignments_org_uq on public.ai_assignments (usage) where scope = 'org';
create unique index ai_assignments_user_uq on public.ai_assignments (user_id, usage) where scope = 'user';

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.profiles enable row level security;
alter table public.app_settings enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.recordings enable row level security;
alter table public.recording_shares enable row level security;
alter table public.upload_sessions enable row level security;
alter table public.transcripts enable row level security;
alter table public.transcription_jobs enable row level security;
alter table public.transcription_chunks enable row level security;
alter table public.templates enable row level security;
alter table public.reports enable row level security;
alter table public.notes enable row level security;
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.channels enable row level security;
alter table public.channel_members enable row level security;
alter table public.messages enable row level security;
alter table public.glossary_terms enable row level security;
alter table public.ai_connections enable row level security;
alter table public.ai_assignments enable row level security;

-- profiles: người dùng đang hoạt động xem được danh bạ; ai cũng xem được hồ sơ của mình.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_active_user());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- Chỉ cho phép sửa các cột thông tin cá nhân (không tự nâng quyền).
revoke update on public.profiles from authenticated;
grant update (full_name, title, department, avatar_url) on public.profiles to authenticated;

-- groups
create policy groups_select on public.groups for select to authenticated
  using (owner_id = auth.uid() or public.is_group_member(id));
create policy groups_insert on public.groups for insert to authenticated
  with check (owner_id = auth.uid() and public.is_active_user());
create policy groups_update on public.groups for update to authenticated
  using (public.is_group_admin(id)) with check (public.is_group_admin(id));
create policy groups_delete on public.groups for delete to authenticated
  using (owner_id = auth.uid());

-- group_members
create policy group_members_select on public.group_members for select to authenticated
  using (public.is_group_member(group_id));
create policy group_members_insert on public.group_members for insert to authenticated
  with check (public.is_group_admin(group_id) and role <> 'owner');
create policy group_members_update on public.group_members for update to authenticated
  using (public.is_group_admin(group_id) and role <> 'owner')
  with check (public.is_group_admin(group_id) and role <> 'owner');
create policy group_members_delete on public.group_members for delete to authenticated
  using ((user_id = auth.uid() and role <> 'owner') or (public.is_group_admin(group_id) and role <> 'owner'));

-- recordings
create policy recordings_select on public.recordings for select to authenticated
  using (owner_id = auth.uid() or public.can_view_recording(id));
create policy recordings_insert on public.recordings for insert to authenticated
  with check (owner_id = auth.uid() and public.is_active_user());
create policy recordings_update on public.recordings for update to authenticated
  using (public.can_edit_recording(id)) with check (public.can_edit_recording(id));
create policy recordings_delete on public.recordings for delete to authenticated
  using (owner_id = auth.uid());

-- recording_shares
create policy shares_select on public.recording_shares for select to authenticated
  using (
    public.is_recording_owner(recording_id)
    or user_id = auth.uid()
    or (group_id is not null and public.is_group_member(group_id))
  );
create policy shares_insert on public.recording_shares for insert to authenticated
  with check (
    public.is_recording_owner(recording_id)
    and shared_by = auth.uid()
    and (group_id is null or public.is_group_member(group_id))
  );
create policy shares_update on public.recording_shares for update to authenticated
  using (public.is_recording_owner(recording_id)) with check (public.is_recording_owner(recording_id));
create policy shares_delete on public.recording_shares for delete to authenticated
  using (
    public.is_recording_owner(recording_id)
    or (group_id is not null and public.is_group_admin(group_id))
  );

-- transcripts
create policy transcripts_select on public.transcripts for select to authenticated
  using (public.can_view_recording(recording_id));
create policy transcripts_insert on public.transcripts for insert to authenticated
  with check (public.can_edit_recording(recording_id));
create policy transcripts_update on public.transcripts for update to authenticated
  using (public.can_edit_recording(recording_id)) with check (public.can_edit_recording(recording_id));

-- jobs & chunks: chỉ đọc
create policy jobs_select on public.transcription_jobs for select to authenticated
  using (public.can_view_recording(recording_id));
create policy chunks_select on public.transcription_chunks for select to authenticated
  using (exists (
    select 1 from public.transcription_jobs j
    where j.id = job_id and public.can_view_recording(j.recording_id)
  ));

-- templates
create policy templates_select on public.templates for select to authenticated
  using (
    (scope = 'org' and public.is_active_user())
    or (scope = 'group' and public.is_group_member(group_id))
    or (scope = 'user' and owner_id = auth.uid())
  );
create policy templates_insert on public.templates for insert to authenticated
  with check (
    owner_id = auth.uid() and (
      (scope = 'user')
      or (scope = 'group' and public.is_group_member(group_id))
      or (scope = 'org' and public.is_admin())
    )
  );
create policy templates_update on public.templates for update to authenticated
  using (owner_id = auth.uid() or (scope = 'org' and public.is_admin()) or (scope = 'group' and public.is_group_admin(group_id)))
  with check (owner_id = auth.uid() or (scope = 'org' and public.is_admin()) or (scope = 'group' and public.is_group_admin(group_id)));
create policy templates_delete on public.templates for delete to authenticated
  using (owner_id = auth.uid() or (scope = 'org' and public.is_admin()) or (scope = 'group' and public.is_group_admin(group_id)));

-- reports
create policy reports_select on public.reports for select to authenticated
  using (public.can_view_recording(recording_id) and (is_shared or created_by = auth.uid()));
create policy reports_insert on public.reports for insert to authenticated
  with check (public.can_view_recording(recording_id) and created_by = auth.uid());
create policy reports_update on public.reports for update to authenticated
  using (created_by = auth.uid() or public.can_edit_recording(recording_id))
  with check (created_by = auth.uid() or public.can_edit_recording(recording_id));
create policy reports_delete on public.reports for delete to authenticated
  using (created_by = auth.uid() or public.is_recording_owner(recording_id));

-- notes (riêng tư)
create policy notes_select on public.notes for select to authenticated
  using (user_id = auth.uid());
create policy notes_insert on public.notes for insert to authenticated
  with check (user_id = auth.uid() and (recording_id is null or public.can_view_recording(recording_id)));
create policy notes_update on public.notes for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notes_delete on public.notes for delete to authenticated
  using (user_id = auth.uid());

-- ai conversations/messages (riêng tư)
create policy ai_conv_select on public.ai_conversations for select to authenticated
  using (user_id = auth.uid());
create policy ai_conv_insert on public.ai_conversations for insert to authenticated
  with check (
    user_id = auth.uid()
    and (recording_id is null or public.can_view_recording(recording_id))
    and (group_id is null or public.is_group_member(group_id))
  );
create policy ai_conv_update on public.ai_conversations for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ai_conv_delete on public.ai_conversations for delete to authenticated
  using (user_id = auth.uid());

create policy ai_msg_select on public.ai_messages for select to authenticated
  using (exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = auth.uid()));
create policy ai_msg_insert on public.ai_messages for insert to authenticated
  with check (exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = auth.uid()));
create policy ai_msg_delete on public.ai_messages for delete to authenticated
  using (exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = auth.uid()));

-- channels / members / messages
create policy channels_select on public.channels for select to authenticated
  using (public.can_access_channel(id));
create policy channel_members_select on public.channel_members for select to authenticated
  using (public.can_access_channel(channel_id));

create policy messages_select on public.messages for select to authenticated
  using (public.can_access_channel(channel_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.can_access_channel(channel_id)
    and (recording_id is null or public.can_view_recording(recording_id))
  );
create policy messages_update_own on public.messages for update to authenticated
  using (sender_id = auth.uid()) with check (sender_id = auth.uid() and public.can_access_channel(channel_id));

-- glossary
create policy glossary_select on public.glossary_terms for select to authenticated
  using (
    (scope = 'org' and public.is_active_user())
    or (scope = 'group' and public.is_group_member(group_id))
    or (scope = 'user' and user_id = auth.uid())
  );
create policy glossary_insert on public.glossary_terms for insert to authenticated
  with check (
    created_by = auth.uid() and (
      (scope = 'user' and user_id = auth.uid())
      or (scope = 'group' and public.is_group_member(group_id))
      or (scope = 'org' and public.is_admin())
    )
  );
create policy glossary_update on public.glossary_terms for update to authenticated
  using (
    (scope = 'user' and user_id = auth.uid())
    or (scope = 'group' and (created_by = auth.uid() or public.is_group_admin(group_id)))
    or (scope = 'org' and public.is_admin())
  );
create policy glossary_delete on public.glossary_terms for delete to authenticated
  using (
    (scope = 'user' and user_id = auth.uid())
    or (scope = 'group' and (created_by = auth.uid() or public.is_group_admin(group_id)))
    or (scope = 'org' and public.is_admin())
  );

-- Giới hạn cột được phép UPDATE từ phía client (chặn leo thang quyền qua UPDATE).
revoke update on public.groups from authenticated;
grant update (name, description, invite_enabled) on public.groups to authenticated;
revoke update on public.group_members from authenticated;
grant update (role) on public.group_members to authenticated;
revoke update on public.recordings from authenticated;
grant update (title, description, category, meeting_date, location, participants, tags, language)
  on public.recordings to authenticated;
revoke update on public.recording_shares from authenticated;
grant update (permission) on public.recording_shares to authenticated;
revoke update on public.transcripts from authenticated;
grant update (segments, speakers, search_text, version, edited_by) on public.transcripts to authenticated;
revoke update on public.templates from authenticated;
grant update (name, description, category, prompt, sort_order) on public.templates to authenticated;
revoke update on public.reports from authenticated;
grant update (title, content, is_shared) on public.reports to authenticated;
revoke update on public.notes from authenticated;
grant update (title, content, anchor_sec, pinned) on public.notes to authenticated;
revoke update on public.ai_conversations from authenticated;
grant update (title, source_ids) on public.ai_conversations to authenticated;
revoke update on public.messages from authenticated;
grant update (content, edited_at, deleted_at) on public.messages to authenticated;
revoke update on public.glossary_terms from authenticated;
grant update (term, aliases, category, note) on public.glossary_terms to authenticated;
revoke update on public.channel_members from authenticated;
revoke update on public.channels from authenticated;
revoke update on public.transcription_jobs from authenticated;
revoke update on public.transcription_chunks from authenticated;

-- =============================================================================
-- RPC
-- =============================================================================

-- Thông tin nhóm từ mã mời (hiển thị trước khi tham gia).
create or replace function public.get_group_invite(p_code text)
returns table (id uuid, name text, description text, member_count bigint, already_member boolean)
language sql
stable
security definer
set search_path = public
as $$
  select g.id, g.name, g.description,
         (select count(*) from public.group_members m where m.group_id = g.id),
         exists (select 1 from public.group_members m where m.group_id = g.id and m.user_id = auth.uid())
    from public.groups g
   where g.invite_code = p_code and g.invite_enabled and public.is_active_user()
$$;

create or replace function public.join_group_by_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  gid uuid;
begin
  if not public.is_active_user() then
    raise exception 'Tài khoản chưa được kích hoạt';
  end if;
  select id into gid from public.groups where invite_code = p_code and invite_enabled;
  if gid is null then
    raise exception 'Mã mời không hợp lệ hoặc đã bị tắt';
  end if;
  insert into public.group_members (group_id, user_id, role)
  values (gid, auth.uid(), 'member')
  on conflict (group_id, user_id) do nothing;
  return gid;
end;
$$;

create or replace function public.regenerate_invite_code(p_group uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  code text;
begin
  if not public.is_group_admin(p_group) then
    raise exception 'Không có quyền';
  end if;
  code := encode(extensions.gen_random_bytes(6), 'hex');
  update public.groups set invite_code = code where id = p_group;
  return code;
end;
$$;

-- Lấy (hoặc tạo) kênh chat 1-1 với một người dùng khác.
create or replace function public.get_or_create_dm(p_other uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  k text;
  cid uuid;
begin
  if me is null or not public.is_active_user() then
    raise exception 'Chưa đăng nhập';
  end if;
  if p_other = me then
    raise exception 'Không thể tự nhắn cho chính mình';
  end if;
  if not exists (select 1 from public.profiles where id = p_other and status = 'active') then
    raise exception 'Người dùng không tồn tại';
  end if;
  k := case when me::text < p_other::text then me::text || ':' || p_other::text
            else p_other::text || ':' || me::text end;
  select id into cid from public.channels where dm_key = k;
  if cid is null then
    insert into public.channels (kind, dm_key) values ('direct', k)
    on conflict (dm_key) do nothing
    returning id into cid;
    if cid is null then
      select id into cid from public.channels where dm_key = k;
    end if;
    insert into public.channel_members (channel_id, user_id)
    values (cid, me), (cid, p_other)
    on conflict do nothing;
  end if;
  return cid;
end;
$$;

create or replace function public.mark_channel_read(p_channel uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.channel_members set last_read_at = now()
   where channel_id = p_channel and user_id = auth.uid()
$$;

-- Danh sách kênh chat của tôi kèm tin nhắn cuối và số tin chưa đọc.
create or replace function public.my_channels()
returns table (
  channel_id uuid,
  kind text,
  group_id uuid,
  title text,
  avatar_url text,
  other_user_id uuid,
  last_message_at timestamptz,
  last_message text,
  unread_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.kind,
    c.group_id,
    case when c.kind = 'group' then g.name else coalesce(op.full_name, op.email) end,
    case when c.kind = 'group' then null else op.avatar_url end,
    op.id,
    c.last_message_at,
    (select m.content from public.messages m
      where m.channel_id = c.id and m.deleted_at is null
      order by m.created_at desc limit 1),
    (select count(*) from public.messages m
      where m.channel_id = c.id and m.created_at > me.last_read_at
        and m.sender_id is distinct from auth.uid() and m.deleted_at is null)
  from public.channel_members me
  join public.channels c on c.id = me.channel_id
  left join public.groups g on g.id = c.group_id
  left join lateral (
    select p.id, p.full_name, p.email, p.avatar_url
      from public.channel_members om
      join public.profiles p on p.id = om.user_id
     where c.kind = 'direct' and om.channel_id = c.id and om.user_id <> auth.uid()
     limit 1
  ) op on true
  where me.user_id = auth.uid() and public.is_active_user()
  order by coalesce(c.last_message_at, c.created_at) desc
$$;

-- Tìm kiếm bản ghi theo tiêu đề/mô tả/nội dung transcript (không phân biệt dấu). Tôn trọng RLS.
create or replace function public.search_recordings(p_query text, p_limit integer default 50)
returns setof public.recordings
language sql
stable
security invoker
set search_path = public
as $$
  select r.*
    from public.recordings r
    left join public.transcripts t on t.recording_id = r.id
   where public.f_unaccent(r.title) like '%' || public.like_escape(public.f_unaccent(p_query)) || '%'
      or public.f_unaccent(coalesce(r.description, '')) like '%' || public.like_escape(public.f_unaccent(p_query)) || '%'
      or coalesce(t.search_text, '') like '%' || public.like_escape(public.f_unaccent(p_query)) || '%'
   order by r.created_at desc
   limit greatest(1, least(p_limit, 200))
$$;

grant execute on function public.get_group_invite(text) to authenticated;
grant execute on function public.join_group_by_code(text) to authenticated;
grant execute on function public.regenerate_invite_code(uuid) to authenticated;
grant execute on function public.get_or_create_dm(uuid) to authenticated;
grant execute on function public.mark_channel_read(uuid) to authenticated;
grant execute on function public.my_channels() to authenticated;
grant execute on function public.search_recordings(text, integer) to authenticated;

-- =============================================================================
-- Realtime: tin nhắn chat và tiến độ phiên âm
-- =============================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
    alter publication supabase_realtime add table public.transcription_jobs;
  end if;
end;
$$;

-- =============================================================================
-- Tài khoản đã đăng ký TRƯỚC khi chạy migration (lúc đó chưa có trigger tạo hồ sơ):
-- tạo hồ sơ bù; người đăng ký sớm nhất trở thành quản trị viên.
-- =============================================================================
insert into public.profiles (id, email, full_name, avatar_url, role, status)
select u.id,
       u.email,
       coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', split_part(u.email, '@', 1)),
       coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture'),
       case
         when not exists (select 1 from public.profiles where role = 'admin')
          and row_number() over (order by u.created_at, u.id) = 1 then 'admin'
         else 'member'
       end,
       'active'
  from auth.users u
 where not exists (select 1 from public.profiles p where p.id = u.id);
