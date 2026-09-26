-- -----------------------------------------------------------------------------
-- Ghi nhận token của từng lần gọi AI (theo tác vụ) để theo dõi chi phí và tỉ lệ trúng
-- prompt cache. Chỉ server (service role) ghi/đọc — quản trị viên xem tổng hợp qua API.
-- -----------------------------------------------------------------------------
create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  task text not null,                         -- report | chat | speaker_naming | term_correction
  provider text not null,
  model text not null,                        -- mô hình thực sự trả lời
  connection_id uuid references public.ai_connections (id) on delete set null,
  user_id uuid references public.profiles (id) on delete set null,
  recording_id uuid references public.recordings (id) on delete set null,
  input_tokens integer not null default 0 check (input_tokens >= 0),               -- gồm phần đọc cache
  cached_input_tokens integer not null default 0 check (cached_input_tokens >= 0),
  cache_write_tokens integer not null default 0 check (cache_write_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),             -- gồm token suy luận
  reasoning_tokens integer not null default 0 check (reasoning_tokens >= 0)
);

create index if not exists ai_usage_created_idx on public.ai_usage (created_at desc);

-- Bật RLS, KHÔNG có policy → chỉ service role truy cập (như các bảng cấu hình AI)
alter table public.ai_usage enable row level security;

-- Tổng hợp theo nhà cung cấp / mô hình / tác vụ (tính trong CSDL — API giới hạn số dòng trả về).
-- Chỉ service role gọi được.
create or replace function public.ai_usage_summary(since timestamptz)
returns table (
  provider text,
  model text,
  task text,
  calls bigint,
  input_tokens bigint,
  cached_input_tokens bigint,
  cache_write_tokens bigint,
  output_tokens bigint,
  reasoning_tokens bigint
)
language sql
stable
set search_path = public
as $$
  select u.provider, u.model, u.task, count(*),
         sum(u.input_tokens), sum(u.cached_input_tokens), sum(u.cache_write_tokens),
         sum(u.output_tokens), sum(u.reasoning_tokens)
    from public.ai_usage u
   where u.created_at >= since
   group by u.provider, u.model, u.task
   order by sum(u.input_tokens) + sum(u.output_tokens) desc;
$$;

revoke all on function public.ai_usage_summary(timestamptz) from public, anon, authenticated;
grant execute on function public.ai_usage_summary(timestamptz) to service_role;
