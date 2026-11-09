-- Prompt chain tool — schema.
--
-- Run in the SQL editor of the SAME Supabase project the other two apps use,
-- AFTER daily-quip-admin's supabase/admin.sql (which creates the
-- `is_superadmin` flag and `public.is_superadmin()`) and supabase/platform.sql
-- (which creates `prompt_chains` and `prompt_chain_steps`). Safe to re-run.
--
-- This app ships no service_role key. Every statement below is enforced by RLS
-- against the signed-in user's own session, so the tool is exactly as locked
-- down as the policies are.

-- ===========================================================================
-- 1. Two kinds of chain, in one table
--
-- `prompt_chains` already existed, holding the chains whose steps the public
-- app CONCATENATES into a single caption prompt. A prompt chain in the sense of
-- this assignment is different: its steps RUN IN SEQUENCE, each one's output
-- feeding the next. Both are "a named, ordered list of steps", so they live in
-- one table with a discriminator rather than in two near-identical ones.
--
--   kind = 'caption'   steps are joined into one prompt   (the public app)
--   kind = 'pipeline'  steps are executed in order        (this tool)
--
-- The public app filters on `kind = 'caption'`, so a pipeline chain created
-- here can never be picked to write a caption with.
-- ===========================================================================

alter table public.prompt_chains
  add column if not exists kind       text not null default 'caption';
alter table public.prompt_chains
  add column if not exists input_kind text not null default 'none';
alter table public.prompt_chains
  add column if not exists updated_at timestamptz not null default now();

alter table public.prompt_chains drop constraint if exists prompt_chains_kind_check;
alter table public.prompt_chains add  constraint prompt_chains_kind_check
  check (kind in ('caption', 'pipeline'));

-- What a run of the chain is fed to start with.
alter table public.prompt_chains drop constraint if exists prompt_chains_input_kind_check;
alter table public.prompt_chains add  constraint prompt_chains_input_kind_check
  check (input_kind in ('none', 'text', 'image'));

-- ===========================================================================
-- 2. Steps gain the columns an executable step needs
--
-- `template` already exists and keeps its job: the text sent to the model, with
-- placeholders filled in at run time. A pipeline step's placeholders are
-- {{input}}, {{previous}} and {{step1}}..{{stepN}} (see lib/chain-runner.ts).
-- ===========================================================================

alter table public.prompt_chain_steps
  add column if not exists output_kind text not null default 'text';
-- NULL means "whatever the chain's default model is".
alter table public.prompt_chain_steps
  add column if not exists model_id   text;
alter table public.prompt_chain_steps
  add column if not exists notes      text;
alter table public.prompt_chain_steps
  add column if not exists created_at timestamptz not null default now();

alter table public.prompt_chain_steps drop constraint if exists prompt_chain_steps_output_kind_check;
alter table public.prompt_chain_steps add  constraint prompt_chain_steps_output_kind_check
  check (output_kind in ('text', 'image'));

-- ===========================================================================
-- 3. Model registry: text models and image models in the same table
--
-- The public app reads `llm_models` for its fallback order. Seeding an image
-- model into it unannotated would have the public app try to write a caption
-- with an image model, so the modality is recorded and the public app filters
-- on `modality = 'text'`.
-- ===========================================================================

alter table public.llm_models
  add column if not exists modality text not null default 'text';

alter table public.llm_models drop constraint if exists llm_models_modality_check;
alter table public.llm_models add  constraint llm_models_modality_check
  check (modality in ('text', 'image'));

insert into public.llm_models (provider_id, model_id, label, modality, enabled, is_default, sort_order, notes)
select p.id, m.model_id, m.label, 'image', m.enabled, false, m.sort_order, m.notes
from public.llm_providers p,
     (values
       ('gemini-3.1-flash-image', 'Gemini 3.1 Flash Image', true,  10,
        'Default for steps whose output is an image.'),
       ('gemini-3-pro-image',     'Gemini 3 Pro Image',     true,  20,
        'Fallback. Higher quality, tighter quota.'),
       ('gemini-2.5-flash-image', 'Gemini 2.5 Flash Image', false, 30,
        'Older generation. Disabled; enable it if the newer two are rate limited.')
     ) as m(model_id, label, enabled, sort_order, notes)
where p.slug = 'google-ai-studio'
on conflict (provider_id, model_id) do nothing;

-- ===========================================================================
-- 4. Runs — the media this tool produces, and the receipt for how
--
-- Every step of every run is kept: the exact prompt sent, the model that
-- answered, the output and how long it took. That is what makes "view the
-- media a chain produced" more than a list of pictures — you can see which
-- step turned a good run into a bad one.
-- ===========================================================================

create table if not exists public.chain_runs (
  id               uuid primary key default gen_random_uuid(),
  chain_id         uuid not null references public.prompt_chains (id) on delete cascade,
  user_id          uuid references auth.users (id) on delete set null,
  input_text       text,
  -- Object path inside the `chain-media` bucket, not a URL: the bucket can be
  -- renamed or made private later without rewriting stored rows.
  input_image_path text,
  status           text not null default 'running'
                     check (status in ('running', 'ok', 'error')),
  final_output     text,
  final_image_path text,
  error_message    text,
  latency_ms       int,
  created_at       timestamptz not null default now()
);

create index if not exists chain_runs_chain_idx
  on public.chain_runs (chain_id, created_at desc);

create table if not exists public.chain_run_steps (
  id                uuid primary key default gen_random_uuid(),
  run_id            uuid not null references public.chain_runs (id) on delete cascade,
  -- Steps can be deleted or reordered after a run; the run keeps its own copy
  -- of the position and label so old runs still read correctly.
  step_id           uuid references public.prompt_chain_steps (id) on delete set null,
  position          int  not null,
  label             text not null,
  model             text,
  prompt_sent       text not null,
  output_text       text,
  output_image_path text,
  status            text not null check (status in ('ok', 'error')),
  error_message     text,
  latency_ms        int,
  created_at        timestamptz not null default now()
);

create index if not exists chain_run_steps_run_idx
  on public.chain_run_steps (run_id, position);

-- ===========================================================================
-- 5. Row Level Security
-- ===========================================================================

alter table public.chain_runs      enable row level security;
alter table public.chain_run_steps enable row level security;

-- Runs are admin-only, read included. Nobody but an admin can reach this tool,
-- and a run holds the full prompt text of every step.
drop policy if exists "Admins manage chain runs" on public.chain_runs;
create policy "Admins manage chain runs"
  on public.chain_runs for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

drop policy if exists "Admins manage chain run steps" on public.chain_run_steps;
create policy "Admins manage chain run steps"
  on public.chain_run_steps for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

-- platform.sql already granted admins full write on `prompt_chains` and
-- `prompt_chain_steps` ("Admins write ..." for all), which is what the CRUD in
-- this tool runs on. Re-asserted here so this file is self-contained if the
-- policy was ever narrowed.
do $$
declare t text;
begin
  foreach t in array array['prompt_chains', 'prompt_chain_steps'] loop
    execute format('drop policy if exists "Admins write %1$s" on public.%1$I', t);
    execute format(
      'create policy "Admins write %1$s" on public.%1$I
         for all to authenticated
         using (public.is_superadmin()) with check (public.is_superadmin())', t);
  end loop;
end $$;

-- ===========================================================================
-- 6. Reordering
--
-- `prompt_chain_steps` has a UNIQUE (chain_id, position), so "move step 2 to
-- step 1" cannot be two UPDATEs — the first one collides. The constraint is
-- also used by ON CONFLICT in platform.sql's seed, which rules out making it
-- DEFERRABLE (ON CONFLICT cannot infer a deferrable constraint).
--
-- So the whole chain is renumbered in two phases inside one transaction: park
-- every row on its own negated position, which cannot collide with any
-- positive one, then write the final sequence. The result is always a clean
-- 1..n with no gaps, whatever the positions looked like going in.
-- ===========================================================================

create or replace function public.admin_reorder_chain_step(
  p_step uuid,
  p_to   int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chain  uuid;
  v_ids    uuid[];
  v_len    int;
  v_from   int;
  v_target int;
  v_id     uuid;
  v_pos    int := 0;
begin
  if not public.is_superadmin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select chain_id into v_chain
    from public.prompt_chain_steps where id = p_step;
  if v_chain is null then
    raise exception 'step not found';
  end if;

  select array_agg(id order by position), count(*)
    into v_ids, v_len
    from public.prompt_chain_steps
   where chain_id = v_chain;

  v_from   := array_position(v_ids, p_step);
  -- Clamp rather than fail: "move up" on the first step is a no-op, not an error.
  v_target := greatest(1, least(p_to, v_len));
  if v_from = v_target then
    return;
  end if;

  -- Pull the step out of the order, then put it back at the target index.
  v_ids := v_ids[1:v_from - 1] || v_ids[v_from + 1:v_len];
  v_ids := v_ids[1:v_target - 1] || array[p_step] || v_ids[v_target:v_len - 1];

  update public.prompt_chain_steps
     set position = -position
   where chain_id = v_chain;

  foreach v_id in array v_ids loop
    v_pos := v_pos + 1;
    update public.prompt_chain_steps set position = v_pos where id = v_id;
  end loop;

  update public.prompt_chains set updated_at = now() where id = v_chain;
end;
$$;

revoke execute on function public.admin_reorder_chain_step(uuid, int) from public, anon;
grant  execute on function public.admin_reorder_chain_step(uuid, int) to authenticated;

-- Appending a step needs the next free position, and reading max(position) in
-- the app and then inserting is a race. One statement instead.
create or replace function public.admin_add_chain_step(
  p_chain       uuid,
  p_label       text,
  p_template    text,
  p_output_kind text default 'text',
  p_model_id    text default null,
  p_notes       text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_superadmin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  insert into public.prompt_chain_steps
    (chain_id, position, label, template, output_kind, model_id, notes, enabled)
  select
    p_chain,
    coalesce(max(position), 0) + 1,
    p_label,
    p_template,
    coalesce(nullif(p_output_kind, ''), 'text'),
    nullif(btrim(coalesce(p_model_id, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    true
  from public.prompt_chain_steps
  where chain_id = p_chain
  returning id into v_id;

  update public.prompt_chains set updated_at = now() where id = p_chain;
  return v_id;
end;
$$;

revoke execute on function public.admin_add_chain_step(uuid, text, text, text, text, text) from public, anon;
grant  execute on function public.admin_add_chain_step(uuid, text, text, text, text, text) to authenticated;

-- Deleting a step leaves a hole in 1..n, which would make the next "move to
-- position 3" ambiguous. Close the gap in the same transaction.
create or replace function public.admin_delete_chain_step(p_step uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chain uuid;
  v_ids   uuid[];
  v_id    uuid;
  v_pos   int := 0;
begin
  if not public.is_superadmin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select chain_id into v_chain
    from public.prompt_chain_steps where id = p_step;
  if v_chain is null then
    return;
  end if;

  delete from public.prompt_chain_steps where id = p_step;

  -- The surviving order is read into an array before anything is written, so
  -- the renumbering below is not reading a table it is in the middle of
  -- rewriting. Same two-phase trick as admin_reorder_chain_step.
  select array_agg(id order by position) into v_ids
    from public.prompt_chain_steps where chain_id = v_chain;

  if v_ids is null then
    update public.prompt_chains set updated_at = now() where id = v_chain;
    return;
  end if;

  update public.prompt_chain_steps set position = -position where chain_id = v_chain;

  foreach v_id in array v_ids loop
    v_pos := v_pos + 1;
    update public.prompt_chain_steps set position = v_pos where id = v_id;
  end loop;

  update public.prompt_chains set updated_at = now() where id = v_chain;
end;
$$;

revoke execute on function public.admin_delete_chain_step(uuid) from public, anon;
grant  execute on function public.admin_delete_chain_step(uuid) to authenticated;

-- ===========================================================================
-- 7. Storage: the media a run reads in and writes out
-- ===========================================================================

insert into storage.buckets (id, name, public)
values ('chain-media', 'chain-media', true)
on conflict (id) do update set public = true;

-- Public read so an <img> works without minting a signed URL per render. The
-- object names are random UUID paths, and nothing private is stored here —
-- the prompts and outputs live in the admin-only tables above.
drop policy if exists "Chain media is publicly readable" on storage.objects;
create policy "Chain media is publicly readable"
  on storage.objects for select using (bucket_id = 'chain-media');

drop policy if exists "Admins manage chain media" on storage.objects;
create policy "Admins manage chain media"
  on storage.objects for all to authenticated
  using      (bucket_id = 'chain-media' and public.is_superadmin())
  with check (bucket_id = 'chain-media' and public.is_superadmin());

-- ===========================================================================
-- 8. Seed — the assignment's example chain, ready to run
-- ===========================================================================

insert into public.prompt_chains (slug, name, description, kind, input_kind, mix_weight, enabled)
values
  ('image-to-captions', 'Image → captions',
   'Describe an uploaded image, find what is funny in it, then write five captions. Three steps, each one reading the step before it.',
   'pipeline', 'image', 0, true),
  ('topic-to-captions', 'Topic → captions',
   'The same shape without an upload: take a topic, work out the angle, write five captions. Handy for demoing the runner when you have no image to hand.',
   'pipeline', 'text', 0, true)
on conflict (slug) do update
  set kind        = excluded.kind,
      input_kind  = excluded.input_kind,
      description = excluded.description;

insert into public.prompt_chain_steps
  (chain_id, position, label, template, output_kind, enabled)
select c.id, s.position, s.label, s.template, 'text', true
from public.prompt_chains c,
     (values
       (1, 'Describe the image',
        'Describe this image in plain, concrete detail: what is in it, where it looks like it was taken, and the mood of it. Four sentences at most. Do not try to be funny yet.'),
       (2, 'Find the funny',
        'Here is a description of a photo:

{{previous}}

What is funny, absurd or painfully relatable about this, to an undergraduate at Columbia University in New York? Give me the angle in two or three sentences. Still no captions.'),
       (3, 'Write five captions',
        'The photo:

{{step1}}

The angle:

{{step2}}

Write FIVE short captions for this photo.
- one sentence each, under 120 characters
- specific and observational, not a generic joke
- no hashtags, no surrounding quotation marks, at most one emoji each
- good-natured; never target a real, named person

Reply with the five captions as a numbered list and nothing else.')
     ) as s(position, label, template)
where c.slug = 'image-to-captions'
on conflict (chain_id, position) do nothing;

insert into public.prompt_chain_steps
  (chain_id, position, label, template, output_kind, enabled)
select c.id, s.position, s.label, s.template, 'text', true
from public.prompt_chains c,
     (values
       (1, 'Set the scene',
        'The topic is: "{{input}}"

Describe the scene in plain, concrete detail, the way someone who was actually there would: what it looks like, who is in it, the mood. Four sentences at most. Do not try to be funny yet.'),
       (2, 'Find the funny',
        'Here is a scene:

{{previous}}

What is funny, absurd or painfully relatable about this, to an undergraduate at Columbia University in New York? Give me the angle in two or three sentences. Still no captions.'),
       (3, 'Write five captions',
        'The scene:

{{step1}}

The angle:

{{step2}}

Write FIVE short captions.
- one sentence each, under 120 characters
- specific and observational, not a generic joke
- no hashtags, no surrounding quotation marks, at most one emoji each
- good-natured; never target a real, named person

Reply with the five captions as a numbered list and nothing else.')
     ) as s(position, label, template)
where c.slug = 'topic-to-captions'
on conflict (chain_id, position) do nothing;

-- The two chains that were already here are the public app's, and they stay
-- that way. Spelled out rather than left to the column default, so re-running
-- this file after someone has edited them is still correct.
update public.prompt_chains
   set kind = 'caption'
 where slug in ('house-voice', 'overheard');

select slug, kind, input_kind, enabled, mix_weight
  from public.prompt_chains order by kind, slug;
