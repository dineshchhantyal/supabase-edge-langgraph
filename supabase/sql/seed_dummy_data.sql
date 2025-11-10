-- Demo data seeding script
-- Run after memory_and_usage_schema.sql to populate a sample user, channel, and usage metrics.

begin;

do $$
declare
  demo_user_id uuid;
  demo_channel_id uuid;
  base_time timestamptz := now();
  summary_id uuid;
  fact_id uuid;
begin
  -- Ensure pgcrypto extension for gen_random_uuid/crypt is available
  perform 1 from pg_extension where extname = 'pgcrypto';
  if not found then
    raise exception 'Extension pgcrypto is required. Run memory_and_usage_schema.sql first.';
  end if;

  -- Create or fetch a demo auth user.
  select id into demo_user_id from auth.users where email = 'demo@example.com';

  if demo_user_id is null then
    insert into auth.users (
      id,
      email,
      raw_app_meta_data,
      raw_user_meta_data,
      aud,
      role,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at
    )
    values (
      gen_random_uuid(),
      'demo@example.com',
      jsonb_build_object('provider', 'email', 'providers', to_jsonb(array['email'])),
      jsonb_build_object('display_name', 'Demo User'),
      'authenticated',
      'authenticated',
      crypt('Password123!', gen_salt('bf')),
      base_time,
      base_time,
      base_time
    )
    returning id into demo_user_id;
  end if;

  -- Create or fetch a demo channel.
  select id into demo_channel_id from public.chat_channels where topic = 'Demo Channel';
  if demo_channel_id is null then
    insert into public.chat_channels (id, topic, created_at, updated_at)
    values (gen_random_uuid(), 'Demo Channel', base_time, base_time)
    returning id into demo_channel_id;
  end if;

  -- Ensure the user profile exists.
  insert into public.user_profiles (
    id,
    user_id,
    display_name,
    active_subscriptions,
    onboarding_completed,
    created_at,
    updated_at
  )
  values (
    gen_random_uuid(),
    demo_user_id,
    'Demo User',
    array['core-plan'],
    true,
    base_time,
    base_time
  )
  on conflict (user_id) do update
    set display_name = excluded.display_name,
        active_subscriptions = excluded.active_subscriptions,
        onboarding_completed = excluded.onboarding_completed,
        updated_at = excluded.updated_at;

  -- Seed two chat messages if none exist yet for the channel.
  if not exists (
    select 1 from public.chat_messages where channel_id = demo_channel_id
  ) then
    insert into public.chat_messages (
      id,
      channel_id,
      sender_id,
      content,
      created_at,
      expires_at
    )
    values
      (
        gen_random_uuid(),
        demo_channel_id,
        demo_user_id,
        'Hey Jarvis, give me a quick update on the Nepal cabinet.',
        base_time - interval '5 minutes',
        base_time + interval '30 days'
      ),
      (
        gen_random_uuid(),
        demo_channel_id,
        demo_user_id,
        'Thanks, that helps! Can you remind me tomorrow?',
        base_time - interval '4 minutes',
        base_time + interval '30 days'
      );
  end if;

  -- Create or refresh a rolling summary for the channel.
  insert into public.memory_summaries (
    channel_id,
    summary_type,
    summary,
    coverage_start,
    coverage_end,
    source_message_ids,
    token_count
  )
  values (
    demo_channel_id,
    'daily',
    'Recapped cabinet changes in Nepal and logged a reminder request from the user.',
    base_time - interval '1 day',
    base_time,
    array(select id from public.chat_messages where channel_id = demo_channel_id order by created_at desc limit 5),
    180
  )
  on conflict do nothing;

  -- Insert a durable fact.
  select id into fact_id from public.memory_long_term
  where user_id = demo_user_id and fact_type = 'preference' and statement = 'User watches South Asian politics closely.';

  if fact_id is null then
    insert into public.memory_long_term (
      user_id,
      channel_id,
      fact_type,
      statement,
      confidence,
      freshness_horizon,
      source_message_ids,
      metadata
    )
    values (
      demo_user_id,
      demo_channel_id,
      'preference',
      'User watches South Asian politics closely.',
      0.85,
      interval '90 days',
      array(select id from public.chat_messages where channel_id = demo_channel_id order by created_at desc limit 5),
      jsonb_build_object('captured_at', base_time)
    )
    returning id into fact_id;
  end if;

  -- Upsert usage ledgers for daily/weekly/monthly periods.
  insert into public.usage_ledgers (
    user_id,
    period,
    period_start,
    tokens_used,
    seconds_active,
    runs,
    updated_at
  )
  values
    (demo_user_id, 'daily', date_trunc('day', base_time)::date, 1250, 90, 2, base_time),
    (demo_user_id, 'weekly', date_trunc('week', base_time)::date, 4100, 360, 6, base_time),
    (demo_user_id, 'monthly', date_trunc('month', base_time)::date, 15500, 1200, 18, base_time)
  on conflict (user_id, period, period_start) do update
    set tokens_used = excluded.tokens_used,
        seconds_active = excluded.seconds_active,
        runs = excluded.runs,
        updated_at = excluded.updated_at;

  raise notice 'Seeded demo data for user % in channel %.', demo_user_id, demo_channel_id;
end;
$$;

commit;
