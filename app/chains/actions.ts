"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperadmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getChain, getSteps, listModels } from "@/lib/chain-data";
import { runChain } from "@/lib/chain-runner";
import { fail, ok, type ActionState } from "@/lib/action-state";
import type { InputKind, OutputKind } from "@/lib/types";

/**
 * Every action in this file starts with `requireSuperadmin()`. A Server Action
 * is an HTTP endpoint: it can be POSTed to without the page that renders its
 * form ever being loaded, so the page-level check does not cover it.
 *
 * RLS is still what actually enforces this — every policy on these tables
 * tests `public.is_superadmin()`, and this app holds no service_role key. The
 * check here is so a non-admin gets a redirect instead of a silent no-op.
 */

const text = (formData: FormData, name: string) =>
  String(formData.get(name) ?? "").trim();

const bool = (formData: FormData, name: string) => formData.get(name) === "on";

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "chain"
  );
}

const INPUT_KINDS: InputKind[] = ["none", "text", "image"];
const OUTPUT_KINDS: OutputKind[] = ["text", "image"];

function inputKind(formData: FormData): InputKind {
  const value = text(formData, "input_kind") as InputKind;
  return INPUT_KINDS.includes(value) ? value : "text";
}

function outputKind(formData: FormData): OutputKind {
  const value = text(formData, "output_kind") as OutputKind;
  return OUTPUT_KINDS.includes(value) ? value : "text";
}

// ===========================================================================
// Chains
// ===========================================================================

export async function createChain(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireSuperadmin();

  const name = text(formData, "name");
  if (!name) return fail("A chain needs a name.");

  const supabase = await createClient();
  const base = text(formData, "slug") || slugify(name);

  let created: { id: string } | null = null;
  let lastError = "Could not create the chain.";

  // Two tries: the slug is unique, and deriving it from the name makes a clash
  // likely enough ("Image → captions" twice) to be worth handling rather than
  // showing the admin a Postgres constraint name.
  for (const slug of [base, `${base}-${Math.random().toString(36).slice(2, 6)}`]) {
    const { data, error } = await supabase
      .from("prompt_chains")
      .insert({
        slug,
        name,
        description: text(formData, "description") || null,
        kind: "pipeline",
        input_kind: inputKind(formData),
        // A pipeline chain is never picked to write a public caption, so it
        // carries no weight in the public app's mix.
        mix_weight: 0,
        enabled: true,
      })
      .select("id")
      .maybeSingle<{ id: string }>();

    if (data) {
      created = data;
      break;
    }
    lastError = error?.message ?? lastError;
    if (error?.code !== "23505") break;
  }

  if (!created) return fail(lastError);

  revalidatePath("/");
  redirect(`/chains/${created.id}`);
}

export async function updateChain(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireSuperadmin();

  const id = text(formData, "chain_id");
  const name = text(formData, "name");
  if (!id) return fail("Missing chain.");
  if (!name) return fail("A chain needs a name.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("prompt_chains")
    .update({
      name,
      slug: text(formData, "slug") || slugify(name),
      description: text(formData, "description") || null,
      input_kind: inputKind(formData),
      enabled: bool(formData, "enabled"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return fail(error.message);

  revalidatePath("/");
  revalidatePath(`/chains/${id}`);
  return ok("Chain saved.");
}

export async function deleteChain(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireSuperadmin();

  const id = text(formData, "chain_id");
  if (!id) return fail("Missing chain.");

  const supabase = await createClient();
  // The steps and runs go with it: both tables are ON DELETE CASCADE.
  const { error } = await supabase.from("prompt_chains").delete().eq("id", id);
  if (error) return fail(error.message);

  revalidatePath("/");
  redirect("/");
}

// ===========================================================================
// Steps
// ===========================================================================

export async function addStep(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireSuperadmin();

  const chainId = text(formData, "chain_id");
  const label = text(formData, "label");
  const template = text(formData, "template");

  if (!chainId) return fail("Missing chain.");
  if (!label) return fail("A step needs a label.");
  if (!template) return fail("A step needs a prompt template.");

  const supabase = await createClient();
  // A function, not an insert: the next free position has to be read and
  // written in one statement, and (chain_id, position) is unique.
  const { error } = await supabase.rpc("admin_add_chain_step", {
    p_chain: chainId,
    p_label: label,
    p_template: template,
    p_output_kind: outputKind(formData),
    p_model_id: text(formData, "model_id") || null,
    p_notes: text(formData, "notes") || null,
  });

  if (error) return fail(error.message);

  revalidatePath(`/chains/${chainId}`);
  revalidatePath("/");
  return ok(`Added “${label}”.`);
}

export async function updateStep(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireSuperadmin();

  const chainId = text(formData, "chain_id");
  const stepId = text(formData, "step_id");
  const label = text(formData, "label");
  const template = text(formData, "template");

  if (!chainId || !stepId) return fail("Missing step.");
  if (!label) return fail("A step needs a label.");
  if (!template) return fail("A step needs a prompt template.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("prompt_chain_steps")
    .update({
      label,
      template,
      output_kind: outputKind(formData),
      model_id: text(formData, "model_id") || null,
      notes: text(formData, "notes") || null,
      enabled: bool(formData, "enabled"),
    })
    .eq("id", stepId);

  if (error) return fail(error.message);

  revalidatePath(`/chains/${chainId}`);
  return ok("Step saved.");
}

export async function deleteStep(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireSuperadmin();

  const chainId = text(formData, "chain_id");
  const stepId = text(formData, "step_id");
  if (!chainId || !stepId) return fail("Missing step.");

  const supabase = await createClient();
  // Closes the gap in 1..n left behind, so positions stay meaningful.
  const { error } = await supabase.rpc("admin_delete_chain_step", {
    p_step: stepId,
  });

  if (error) return fail(error.message);

  revalidatePath(`/chains/${chainId}`);
  revalidatePath("/");
  return ok("Step deleted.");
}

/**
 * Reordering. `to` is an absolute 1-based position, which covers both the
 * up/down buttons (current ± 1) and the "move to #" picker. The whole chain is
 * renumbered server-side in one transaction — see the function's comment in
 * supabase/chains.sql for why two UPDATEs will not do.
 */
export async function moveStep(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireSuperadmin();

  const chainId = text(formData, "chain_id");
  const stepId = text(formData, "step_id");
  const to = Number(text(formData, "to"));

  if (!chainId || !stepId) return fail("Missing step.");
  if (!Number.isInteger(to) || to < 1) return fail("That is not a position.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_reorder_chain_step", {
    p_step: stepId,
    p_to: to,
  });

  if (error) return fail(error.message);

  revalidatePath(`/chains/${chainId}`);
  return ok(`Moved to position ${to}.`);
}

// ===========================================================================
// Running the chain
// ===========================================================================

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export async function runChainAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireSuperadmin();

  const chainId = text(formData, "chain_id");
  if (!chainId) return fail("Missing chain.");

  const chain = await getChain(chainId);
  if (!chain) return fail("That chain no longer exists.");

  const steps = await getSteps(chainId);
  if (steps.filter((step) => step.enabled).length === 0) {
    return fail("Add at least one enabled step before running this chain.");
  }

  const inputText = text(formData, "input_text");
  if (chain.input_kind === "text" && !inputText) {
    return fail("This chain takes a text input. Type something to start it.");
  }

  let image: { bytes: Uint8Array; mimeType: string } | null = null;
  const upload = formData.get("input_image");

  if (upload instanceof File && upload.size > 0) {
    if (!IMAGE_TYPES.includes(upload.type)) {
      return fail("Upload a PNG, JPEG, WebP or GIF.");
    }
    if (upload.size > MAX_IMAGE_BYTES) {
      return fail("That image is larger than 6 MB.");
    }
    image = {
      bytes: new Uint8Array(await upload.arrayBuffer()),
      mimeType: upload.type,
    };
  }

  if (chain.input_kind === "image" && !image) {
    return fail("This chain takes an image. Choose a file to start it.");
  }

  let outcome;
  try {
    outcome = await runChain({
      chain,
      steps,
      registry: await listModels(),
      userId: user.id,
      inputText,
      image,
    });
  } catch (cause) {
    return fail(cause instanceof Error ? cause.message : "The run failed to start.");
  }

  revalidatePath(`/chains/${chainId}`);
  revalidatePath(`/chains/${chainId}/media`);
  revalidatePath("/");
  // Either way the run exists and has recorded what happened, so the receipt
  // is the right place to land — a failure is as much worth reading as a win.
  redirect(`/runs/${outcome.runId}`);
}

export async function deleteRun(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireSuperadmin();

  const runId = text(formData, "run_id");
  const chainId = text(formData, "chain_id");
  if (!runId) return fail("Missing run.");

  const supabase = await createClient();
  const { error } = await supabase.from("chain_runs").delete().eq("id", runId);
  if (error) return fail(error.message);

  if (chainId) {
    revalidatePath(`/chains/${chainId}`);
    revalidatePath(`/chains/${chainId}/media`);
  }
  revalidatePath("/");
  return ok("Run deleted.");
}
