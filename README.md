# Daily Quip — prompt chain tool

A third Next.js app and Vercel project on the **same Supabase database** as the
public [Daily Quip](https://github.com/SM5858/humor-project) app and the
[admin console](https://github.com/SM5858/daily-quip-admin). It builds, edits,
reorders and **runs** prompt chains, and keeps every run it produced.

| Route | What it does |
| --- | --- |
| `/` | Every chain, both kinds, with step and run counts. Create a chain |
| `/chains/[id]` | Edit the chain, CRUD its steps, reorder them, run it |
| `/chains/[id]/media` | The media that chain produced — runs here, plus the public app's captions |
| `/runs/[id]` | One run's receipt: every step, the exact prompt it sent, what came back |
| `/login`, `/auth/callback` | The only routes a signed-out visitor can reach |

## A chain is two different things, so the table says which

`prompt_chains` and `prompt_chain_steps` already existed — the admin console
created them, and the public app builds its caption prompt from them by
**concatenating** a chain's steps into one string.

A prompt chain in the sense of this assignment is the other thing: steps that
**run in sequence**, each one reading the output of the step before it. Both are
"a named, ordered list of steps", so rather than a second pair of near-identical
tables there is one `kind` column:

| `kind` | Steps are | Who uses it |
| --- | --- | --- |
| `caption` | joined into a single prompt | the public app, on every generation |
| `pipeline` | executed one after another | this tool |

The public app filters on `kind = 'caption'`, so a pipeline chain built here can
never be picked to write a caption — its `{{previous}}` placeholders would be
nonsense inside a concatenated prompt. Same for the model registry: `llm_models`
gained a `modality`, because an image model sitting in the fallback order would
otherwise be tried as a caption writer.

That is the point of all three apps sharing one database: a column added here
has to be answered for over there.

## How a step reads the step before it

A step's `template` is the text sent to the model, with placeholders filled in
at run time:

| Placeholder | Becomes |
| --- | --- |
| `{{input}}` | what the run was started with |
| `{{previous}}` | the output of the step immediately before |
| `{{step1}}`, `{{step2}}`… | the output of any earlier step, by position |
| `{{image}}` | attaches the uploaded image to *this* step's request |

A step that mentions none of them still receives the previous output, appended
after a separator. Forgetting the placeholder is the obvious mistake to make,
and a step silently handed nothing would look like the tool was broken rather
than the template.

The seeded **Image → captions** chain is the assignment's example, ready to run:

1. *Describe the image* — the upload goes in, a plain description comes out
2. *Find the funny* — reads `{{previous}}`, returns the angle
3. *Write five captions* — reads `{{step1}}` and `{{step2}}`, returns five

Reorder 2 and 3 and run it again: the captions come out thinner, because the
step that found the angle now runs after the step that needed it. The reordering
is not cosmetic.

## Reordering

`prompt_chain_steps` has a `UNIQUE (chain_id, position)`, so "move step 2 to
step 1" cannot be two `UPDATE`s — the first one collides. Making the constraint
`DEFERRABLE` is not an option either: `platform.sql` uses it as an `ON CONFLICT`
target, and Postgres will not infer a deferrable constraint there.

So `admin_reorder_chain_step()` renumbers the whole chain in two phases inside
one transaction: park every row on its own **negated** position, which cannot
collide with any positive one, then write the final sequence. Positions always
come out a clean `1..n`, whatever they looked like going in. `admin_delete_chain_step()`
closes the gap the same way, so "move to position 3" never means something
different from what it says.

The UI offers both ▲▼ and a "→ n" picker; both post one absolute target
position to the same function.

## The wall

Every route requires a Google login **and** `profiles.is_superadmin = true`.
Three independent layers:

1. **`proxy.ts`** — default deny. Only `/login` and `/auth/callback` are listed
   as public.
2. **`requireSuperadmin()`** — re-read on every page *and at the top of every
   Server Action*. An action is an HTTP endpoint: it can be POSTed to without
   its page ever rendering, so a page-level check would not cover it.
3. **Row Level Security** — the real enforcement. This app ships **no
   `service_role` key**. It talks to Supabase with the anon key plus the admin's
   own session, so every policy still applies and the same queries return
   nothing for a non-admin. Leaking the frontend key gives an attacker what any
   signed-out visitor already has.

Runs are admin-only to *read* as well as write: a run holds the full prompt text
of every step.

## Light / dark / system

Three modes, which is one more than a media query can express, so the dark
values are written twice in `globals.css`:

```css
:root                                         { /* light */ }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"])             { /* dark, following the OS */ }
}
:root[data-theme="dark"]                      { /* dark, forced */ }
```

The `:not()` guard is what makes "light" stick on a dark OS, and the unguarded
block is what makes "dark" stick on a light one. `color-scheme` rides along so
native controls — including `<input type="file">` — match.

**System is a real third state**, not a label for whichever of the two the OS
happens to be in: choosing it *removes* the attribute, so the page follows the
OS live if it changes afterwards. The preference is read with
`useSyncExternalStore`, which renders the server's answer during hydration and
then reconciles against `localStorage`, rather than the `useEffect` + `setState`
version that paints the wrong theme first and corrects it. An inline script in
`app/layout.tsx` sets the attribute before first paint, so a forced theme never
flashes the other one. Every read and write of `localStorage` is wrapped: it
throws in a private window with site data blocked, and the right answer there is
"follow the OS", not "break the page".

## Viewing a chain's media

`/chains/[id]/media` has two sources, and only one of them is this tool's:

- **Runs from here** — `chain_runs` and `chain_run_steps`. Every step is kept
  with the prompt it sent, the model that answered and how long it took, so a
  run that died halfway through still shows how far it got and on what.
- **Captions the public app wrote** — for a `caption` chain, joined up through
  `generation_requests`, which records the chain behind every prompt that app
  ever built. Those captions are not produced here at all; the chain is the only
  thing the two have in common.

Images live in a public `chain-media` bucket under random UUID paths. Rows store
the object **path**, not a URL, so the bucket can be renamed or locked down
later without rewriting any of them.

## Data model

| Table | Role |
| --- | --- |
| `prompt_chains` | Shared. `kind` says which of the two shapes a row is |
| `prompt_chain_steps` | Shared. Gained `output_kind`, `model_id`, `notes` |
| `llm_models` | Shared. Gained `modality` |
| `chain_runs` | One run: what it was given, what it ended with, how long |
| `chain_run_steps` | One step of one run, with its own copy of the position and label so old runs still read correctly after the chain is edited |

Functions, all `SECURITY DEFINER` with their own `is_superadmin()` check:
`admin_add_chain_step()`, `admin_reorder_chain_step()`,
`admin_delete_chain_step()`.

## Setup

1. **Schema** — in the SQL editor of the **same** Supabase project, after that
   project already has `daily-quip-admin`'s `supabase/admin.sql` and
   `supabase/platform.sql`, paste
   [`supabase/chains.sql`](supabase/chains.sql) and Run. Safe to re-run.
2. **Redirect URL** — Supabase → Authentication → URL Configuration → add, with
   no query string:
   - `http://localhost:3200/auth/callback`
   - `https://<this-app>.vercel.app/auth/callback`
3. **Environment** — `cp .env.example .env.local` and fill in:

   ```
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   GEMINI_API_KEY=            # server only
   ```

```bash
npm install
npm run dev -- --port 3200
```

Port 3200 keeps it clear of the public app on 3000 and the admin console on 3100.

## Deploying

The same three variables in **Vercel → Settings → Environment Variables**. Turn
off **Settings → Deployment Protection → Vercel Authentication** so the page
opens in Incognito — the superadmin login is this app's protection, and it is
the one worth testing.

## Notes

- Image **input** works on the free Gemini tier; image **output** depends on
  having quota for an image model. A step set to output an image records the
  API's refusal on the run rather than pretending the chain succeeded, which is
  why the run log keeps failures too.
- Each step is its own model call, so a three-step chain takes a few seconds.
  The run is written as it goes, not at the end.
