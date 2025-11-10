-- Memory and usage schema bootstrap
-- Run this script once in your Supabase database (or adapt it per environment).

begin;

-- Ensure UUID helpers are available for gen_random_uuid().
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Core chat primitives (created if missing)
-- ---------------------------------------------------------------------------

create table if not exists public.chat_channels (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  topic text null,
  archived_at timestamptz null
);

-- ---------------------------------------------------------------------------
-- User profile metadata (created if missing)
-- ---------------------------------------------------------------------------

create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  display_name text null,
  avatar_url text null,
  theme_preference text null default 'system',
  user_type text null,
  specialization text null,
  onboarding_completed boolean null default false,
  interests text null,
  full_name text null,
  school text null,
  has_customized_dashboard boolean null default false,
  last_customization_date timestamp null,
  company text null,
  background_color_preference text null default 'default',
  custom_background_id uuid null,
  light_background_color text null default 'default',
  dark_background_color text null default 'default',
  custom_background_enabled boolean null default false,
  background_migrated boolean null default false,
  username varchar(50) null unique,
  is_discoverable boolean null default true,
  stripe_customer_id text null,
  active_subscriptions text[] null default '{}'::text[],
  default_background_enabled boolean null default true,
  email_visible_to_friends boolean null default true,
  constraint user_profiles_user_id_key unique (user_id)
);

create index if not exists idx_user_profiles_onboarding
  on public.user_profiles (user_id, onboarding_completed);

create index if not exists idx_user_profiles_active_subscriptions
  on public.user_profiles using gin (active_subscriptions);

do $$
begin
  if to_regprocedure('public.add_social_proof_activity()') is not null then
    if not exists (select 1 from pg_trigger where tgname = 'auto_add_social_proof') then
      execute 'create trigger auto_add_social_proof after insert on public.user_profiles for each row execute function public.add_social_proof_activity()';
    end if;
    if not exists (select 1 from pg_trigger where tgname = 'trigger_add_social_proof') then
      execute 'create trigger trigger_add_social_proof after update on public.user_profiles for each row execute function public.add_social_proof_activity()';
    end if;
  else
    raise notice 'Skipping social proof triggers; function public.add_social_proof_activity() not found.';
  end if;

  if to_regprocedure('public.update_modified_column()') is not null then
    if not exists (select 1 from pg_trigger where tgname = 'update_user_profiles_modtime') then
      execute 'create trigger update_user_profiles_modtime before update on public.user_profiles for each row execute function public.update_modified_column()';
    end if;
  else
    raise notice 'Skipping update_user_profiles_modtime trigger; function public.update_modified_column() not found.';
  end if;

  if to_regclass('public.user_backgrounds') is not null then
    begin
      execute 'alter table public.user_profiles add constraint user_profiles_custom_background_id_fkey foreign key (custom_background_id) references public.user_backgrounds(id)';
    exception when duplicate_object then
      null;
    end;
  else
    raise notice 'Skipping custom background foreign key; table public.user_backgrounds not found.';
  end if;
end;
$$;

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  sources jsonb null,
  constraint chat_messages_content_length_chk check (
    (char_length(content) > 0) and (char_length(content) <= 5000)
  )
);
create index if not exists idx_chat_messages_channel_created
  on public.chat_messages using btree (channel_id, created_at desc);

create index if not exists idx_chat_messages_expires_at
  on public.chat_messages using btree (expires_at);

do $$
begin
  if to_regprocedure('public.update_channel_timestamp()') is not null then
    if not exists (
      select 1 from pg_trigger where tgname = 'trigger_update_channel_on_message'
    ) then
      execute 'create trigger trigger_update_channel_on_message after insert on public.chat_messages for each row execute function public.update_channel_timestamp()';
    end if;
  else
    raise notice 'Skipping trigger_update_channel_on_message; function public.update_channel_timestamp() not found.';
  end if;
end;
$$;

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
