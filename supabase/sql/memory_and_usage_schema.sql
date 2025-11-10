-- Memory and usage schema bootstrap
-- Run this script once in your Supabase database (or adapt it per environment).

begin;

-- Ensure UUID helpers are available for gen_random_uuid().
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Short-term context helper
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.chat_messages') is not null then
    execute $v$
      create or replace view public.recent_chat_messages as
      select
        ordered.id,
        ordered.channel_id,
        ordered.sender_id,
        ordered.content,
        ordered.created_at,
        ordered.expires_at,
        ordered.sources,
        ordered.position
      from (
        select
          cm.*,
          row_number() over (partition by cm.channel_id order by cm.created_at desc) as position
        from public.chat_messages cm
      ) as ordered
      where ordered.position <= 40
      order by ordered.channel_id, ordered.created_at desc;
    $v$;
  else
    raise notice 'Skipping recent_chat_messages view creation; table public.chat_messages not found. Run the chat schema first, then rerun this script.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rolling conversation summaries
-- ---------------------------------------------------------------------------
create table if not exists public.memory_summaries (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  summary_type text not null default 'daily',
  summary text not null,
  coverage_start timestamptz not null,
  coverage_end timestamptz not null,
  source_message_ids uuid[] not null default '{}',
  token_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memory_summaries_coverage_chk check (coverage_end >= coverage_start)
);

create index if not exists idx_memory_summaries_channel_range
  on public.memory_summaries (channel_id, coverage_start desc, coverage_end desc);

-- ---------------------------------------------------------------------------
-- Durable user facts (long-term memory)
-- ---------------------------------------------------------------------------
create table if not exists public.memory_long_term (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel_id uuid null references public.chat_channels(id) on delete set null,
  fact_type text not null,
  statement text not null,
  confidence numeric(3,2) not null default 0.75,
  freshness_horizon interval null,
  source_message_ids uuid[] not null default '{}',
  metadata jsonb not null default '{}',
  first_seen_at timestamptz not null default now(),
  last_updated_at timestamptz not null default now(),
  archived_at timestamptz null,
  constraint memory_long_term_confidence_chk check (confidence between 0 and 1)
);

create index if not exists idx_memory_long_term_user
  on public.memory_long_term (user_id, fact_type, archived_at);

create index if not exists idx_memory_long_term_channel
  on public.memory_long_term (channel_id, archived_at)
  where channel_id is not null;

-- ---------------------------------------------------------------------------
-- Usage tracking ledgers (daily, weekly, monthly)
-- ---------------------------------------------------------------------------
create table if not exists public.usage_ledgers (
  user_id uuid not null references auth.users(id) on delete cascade,
  period text not null,
  period_start date not null,
  tokens_used bigint not null default 0,
  seconds_active bigint not null default 0,
  runs integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint usage_ledgers_period_chk check (period in ('daily', 'weekly', 'monthly')),
  constraint usage_ledgers_pkey primary key (user_id, period, period_start)
);

create index if not exists idx_usage_ledgers_period
  on public.usage_ledgers (period, period_start desc);

commit;
