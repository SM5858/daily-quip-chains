import { createClient } from "@/lib/supabase/server";
import { MEDIA_BUCKET } from "@/lib/chain-data";
import {
  callModel,
  FALLBACK_IMAGE_MODELS,
  FALLBACK_TEXT_MODELS,
  normalizeModel,
  type Attachment,
} from "@/lib/gemini";
import type { Chain, ChainStep, RegistryModel } from "@/lib/types";

/**
 * Placeholders a step template may use. This is the whole contract between one
 * step and the ones before it:
 *
 *   {{input}}     what the run was started with (the text box)
 *   {{previous}}  the output of the step immediately before this one
 *   {{step1}}..   the output of any earlier step, by its position at run time
 *   {{image}}     attach the uploaded image to THIS step's request
 *
 * A step that mentions none of them and is not the first still receives the
 * previous output, appended after a separator — forgetting the placeholder is
 * the obvious mistake to make, and silently sending a step nothing to work
 * with would look like the chain is broken rather than the template.
 */
const REFERENCES_EARLIER = /\{\{\s*(input|previous|step\s*\d+)\s*\}\}/i;
const IMAGE_MARKER = /\{\{\s*image\s*\}\}/gi;
/** Same pattern without `g`, so `.test()` has no `lastIndex` to carry over. */
const HAS_IMAGE_MARKER = /\{\{\s*image\s*\}\}/i;

export type StepContext = {
  /** What the run was started with. */
  input: string;
  /** Output of each completed step, indexed by position (1-based). */
  outputs: string[];
};

export function fillTemplate(template: string, context: StepContext): string {
  const previous = context.outputs.length
    ? context.outputs[context.outputs.length - 1]
    : "";

  let filled = template
    .replace(IMAGE_MARKER, "")
    .replace(/\{\{\s*input\s*\}\}/gi, context.input)
    .replace(/\{\{\s*previous\s*\}\}/gi, previous)
    .replace(/\{\{\s*step\s*(\d+)\s*\}\}/gi, (_match, index: string) => {
      return context.outputs[Number(index) - 1] ?? "";
    });

  const mentionsEarlier = REFERENCES_EARLIER.test(template);
  if (!mentionsEarlier && previous) {
    filled = `${filled.trim()}\n\n---\n\n${previous}`;
  }

  return filled.trim();
}

/** Which models this step may use, best first, with the built-in defaults behind. */
function modelsFor(
  step: ChainStep,
  registry: RegistryModel[]
): string[] {
  const modality = step.output_kind === "image" ? "image" : "text";
  const fallbacks =
    modality === "image" ? FALLBACK_IMAGE_MODELS : FALLBACK_TEXT_MODELS;

  const fromRegistry = registry
    .filter((model) => model.enabled && model.modality === modality)
    .sort(
      (a, b) =>
        Number(b.is_default) - Number(a.is_default) || a.sort_order - b.sort_order
    )
    .map((model) => model.model_id);

  const pinned = normalizeModel(step.model_id);
  const chain = pinned
    ? [pinned, ...fromRegistry, ...fallbacks]
    : [...fromRegistry, ...fallbacks];

  // De-duplicate while keeping the order.
  return [...new Set(chain)];
}

function extensionFor(mimeType: string) {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("gif")) return "gif";
  return "jpg";
}

export type RunOutcome = {
  runId: string;
  status: "ok" | "error";
  message: string;
};

/**
 * Executes a chain: every enabled step in `position` order, each one's output
 * available to the next. Both the run and each individual step are written to
 * the database as they happen, so a run that dies halfway through still shows
 * exactly how far it got and with what.
 */
export async function runChain({
  chain,
  steps,
  registry,
  userId,
  inputText,
  image,
}: {
  chain: Chain;
  steps: ChainStep[];
  registry: RegistryModel[];
  userId: string;
  inputText: string;
  image: { bytes: Uint8Array; mimeType: string } | null;
}): Promise<RunOutcome> {
  const supabase = await createClient();
  const enabled = steps.filter((step) => step.enabled);

  const { data: run, error: runError } = await supabase
    .from("chain_runs")
    .insert({
      chain_id: chain.id,
      user_id: userId,
      input_text: inputText || null,
      status: "running",
    })
    .select("id")
    .single<{ id: string }>();

  if (runError || !run) {
    throw new Error(runError?.message ?? "Could not start the run.");
  }

  const runId = run.id;
  const startedAt = Date.now();

  const fail = async (message: string) => {
    await supabase
      .from("chain_runs")
      .update({
        status: "error",
        error_message: message.slice(0, 1000),
        latency_ms: Date.now() - startedAt,
      })
      .eq("id", runId);
    return { runId, status: "error" as const, message };
  };

  // The uploaded image is stored before the first model call, so it is on the
  // run even if the chain then fails.
  let inputImagePath: string | null = null;
  let attachment: Attachment | null = null;

  if (image) {
    inputImagePath = `inputs/${runId}.${extensionFor(image.mimeType)}`;
    const { error } = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(inputImagePath, image.bytes, {
        contentType: image.mimeType,
        upsert: true,
      });

    if (error) return fail(`Could not store the uploaded image: ${error.message}`);

    await supabase
      .from("chain_runs")
      .update({ input_image_path: inputImagePath })
      .eq("id", runId);

    attachment = {
      mimeType: image.mimeType,
      data: Buffer.from(image.bytes).toString("base64"),
    };
  }

  if (enabled.length === 0) {
    return fail("This chain has no enabled steps.");
  }

  const context: StepContext = { input: inputText, outputs: [] };
  let lastText: string | null = null;
  let lastImagePath: string | null = null;
  let attachmentSpent = false;

  for (const [index, step] of enabled.entries()) {
    const prompt = fillTemplate(step.template, context);

    // The image goes to the step that asks for it with {{image}}; failing that,
    // to the first step of an image-input chain.
    const wantsImage =
      HAS_IMAGE_MARKER.test(step.template) ||
      (index === 0 && chain.input_kind === "image");

    const attachments = attachment && wantsImage && !attachmentSpent ? [attachment] : [];
    if (attachments.length > 0) attachmentSpent = true;

    const models = modelsFor(step, registry);

    try {
      const { output } = await callModel({
        prompt,
        models,
        attachments,
        wantImage: step.output_kind === "image",
      });

      let outputImagePath: string | null = null;
      if (output.image) {
        outputImagePath = `runs/${runId}/${step.position}.${extensionFor(
          output.image.mimeType
        )}`;
        const { error } = await supabase.storage
          .from(MEDIA_BUCKET)
          .upload(outputImagePath, Buffer.from(output.image.base64, "base64"), {
            contentType: output.image.mimeType,
            upsert: true,
          });
        if (error) throw new Error(`Could not store the generated image: ${error.message}`);
      }

      await supabase.from("chain_run_steps").insert({
        run_id: runId,
        step_id: step.id,
        position: step.position,
        label: step.label,
        model: output.model,
        prompt_sent: prompt,
        output_text: output.text,
        output_image_path: outputImagePath,
        status: "ok",
        latency_ms: output.latencyMs,
      });

      // An image-output step has no text to pass on, so the next step keeps
      // reading the last text there was — otherwise inserting a picture in the
      // middle of a chain would blank everything after it.
      context.outputs.push(output.text ?? context.outputs.at(-1) ?? "");
      if (output.text) lastText = output.text;
      if (outputImagePath) lastImagePath = outputImagePath;
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "The model call failed.";

      await supabase.from("chain_run_steps").insert({
        run_id: runId,
        step_id: step.id,
        position: step.position,
        label: step.label,
        model: models[0] ?? null,
        prompt_sent: prompt,
        status: "error",
        error_message: message.slice(0, 1000),
      });

      return fail(`Step ${step.position} (${step.label}) failed: ${message}`);
    }
  }

  await supabase
    .from("chain_runs")
    .update({
      status: "ok",
      final_output: lastText,
      final_image_path: lastImagePath,
      latency_ms: Date.now() - startedAt,
    })
    .eq("id", runId);

  return {
    runId,
    status: "ok",
    message: `Ran ${enabled.length} step${enabled.length === 1 ? "" : "s"}.`,
  };
}
