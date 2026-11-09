import { createClient } from "@/lib/supabase/server";
import { supabaseEnv } from "@/lib/env";
import type {
  Chain,
  ChainRun,
  ChainRunStep,
  ChainStep,
  PublicCaption,
  RegistryModel,
} from "@/lib/types";

export const MEDIA_BUCKET = "chain-media";

/**
 * The bucket is public, so an object path turns into a URL without a round
 * trip to sign it. Paths are stored rather than URLs, so the bucket can be
 * renamed or locked down later without rewriting any rows.
 */
export function mediaUrl(path: string | null) {
  if (!path) return null;
  const { url } = supabaseEnv();
  return `${url}/storage/v1/object/public/${MEDIA_BUCKET}/${path}`;
}

export type ChainSummary = Chain & { stepCount: number; runCount: number };

/**
 * Every chain in the database, both kinds, each with how many steps it has and
 * how many times it has been run here.
 */
export async function listChains(): Promise<ChainSummary[]> {
  const supabase = await createClient();

  const [chains, steps, runs] = await Promise.all([
    supabase
      .from("prompt_chains")
      .select(
        "id, slug, name, description, kind, input_kind, mix_weight, enabled, created_at, updated_at"
      )
      .order("kind")
      .order("name")
      .returns<Chain[]>(),
    supabase.from("prompt_chain_steps").select("chain_id").returns<{ chain_id: string }[]>(),
    supabase.from("chain_runs").select("chain_id").returns<{ chain_id: string }[]>(),
  ]);

  const tally = (rows: { chain_id: string }[] | null) => {
    const counts = new Map<string, number>();
    for (const row of rows ?? []) {
      counts.set(row.chain_id, (counts.get(row.chain_id) ?? 0) + 1);
    }
    return counts;
  };

  const stepCounts = tally(steps.data);
  const runCounts = tally(runs.data);

  return (chains.data ?? []).map((chain) => ({
    ...chain,
    stepCount: stepCounts.get(chain.id) ?? 0,
    runCount: runCounts.get(chain.id) ?? 0,
  }));
}

export async function getChain(id: string): Promise<Chain | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("prompt_chains")
    .select(
      "id, slug, name, description, kind, input_kind, mix_weight, enabled, created_at, updated_at"
    )
    .eq("id", id)
    .maybeSingle<Chain>();
  return data ?? null;
}

export async function getSteps(chainId: string): Promise<ChainStep[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("prompt_chain_steps")
    .select(
      "id, chain_id, position, label, template, output_kind, model_id, notes, enabled"
    )
    .eq("chain_id", chainId)
    .order("position")
    .returns<ChainStep[]>();
  return data ?? [];
}

/** The shared model registry, so a step picks a model instead of typing one. */
export async function listModels(): Promise<RegistryModel[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("llm_models")
    .select("model_id, label, modality, is_default, sort_order, enabled")
    .order("modality")
    .order("sort_order")
    .returns<RegistryModel[]>();
  return data ?? [];
}

export async function listRuns(chainId: string, limit = 50): Promise<ChainRun[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("chain_runs")
    .select(
      "id, chain_id, user_id, input_text, input_image_path, status, final_output, final_image_path, error_message, latency_ms, created_at"
    )
    .eq("chain_id", chainId)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<ChainRun[]>();
  return data ?? [];
}

export async function getRun(
  id: string
): Promise<{ run: ChainRun; steps: ChainRunStep[] } | null> {
  const supabase = await createClient();

  const { data: run } = await supabase
    .from("chain_runs")
    .select(
      "id, chain_id, user_id, input_text, input_image_path, status, final_output, final_image_path, error_message, latency_ms, created_at"
    )
    .eq("id", id)
    .maybeSingle<ChainRun>();

  if (!run) return null;

  const { data: steps } = await supabase
    .from("chain_run_steps")
    .select(
      "id, run_id, step_id, position, label, model, prompt_sent, output_text, output_image_path, status, error_message, latency_ms, created_at"
    )
    .eq("run_id", id)
    .order("position")
    .returns<ChainRunStep[]>();

  return { run, steps: steps ?? [] };
}

/** The steps of several runs at once, so a gallery is two queries, not 2n. */
export async function stepsForRuns(
  runIds: string[]
): Promise<Map<string, ChainRunStep[]>> {
  const byRun = new Map<string, ChainRunStep[]>();
  if (runIds.length === 0) return byRun;

  const supabase = await createClient();
  const { data } = await supabase
    .from("chain_run_steps")
    .select(
      "id, run_id, step_id, position, label, model, prompt_sent, output_text, output_image_path, status, error_message, latency_ms, created_at"
    )
    .in("run_id", runIds)
    .order("position")
    .returns<ChainRunStep[]>();

  for (const step of data ?? []) {
    const list = byRun.get(step.run_id) ?? [];
    list.push(step);
    byRun.set(step.run_id, list);
  }
  return byRun;
}

/**
 * Media the PUBLIC app produced with this chain. Its captions are not written
 * by this tool at all — they are joined up through `generation_requests`, which
 * records the chain each caption's prompt was built from. That is what makes a
 * `kind = 'caption'` chain's media page show real traffic rather than nothing.
 */
export async function publicCaptionsForChain(
  chainId: string,
  limit = 50
): Promise<PublicCaption[]> {
  const supabase = await createClient();

  const { data: requests } = await supabase
    .from("generation_requests")
    .select("generation_id, created_at")
    .eq("chain_id", chainId)
    .not("generation_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<{ generation_id: string; created_at: string }[]>();

  const ids = (requests ?? []).map((row) => row.generation_id);
  if (ids.length === 0) return [];

  const { data } = await supabase
    .from("generations")
    .select("id, topic, content, model, published, created_at")
    .in("id", ids)
    .order("created_at", { ascending: false })
    .returns<PublicCaption[]>();

  return data ?? [];
}
