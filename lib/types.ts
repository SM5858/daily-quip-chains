export type AdminProfile = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  is_superadmin: boolean;
  created_at: string;
};

/** `'caption'` chains belong to the public app; `'pipeline'` chains to this tool. */
export type ChainKind = "caption" | "pipeline";

/** What a run is fed to begin with. */
export type InputKind = "none" | "text" | "image";

export type OutputKind = "text" | "image";

export type Chain = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  kind: ChainKind;
  input_kind: InputKind;
  mix_weight: number;
  enabled: boolean;
  created_at: string;
  updated_at: string | null;
};

export type ChainStep = {
  id: string;
  chain_id: string;
  position: number;
  label: string;
  template: string;
  output_kind: OutputKind;
  model_id: string | null;
  notes: string | null;
  enabled: boolean;
};

export type RunStatus = "running" | "ok" | "error";

export type ChainRun = {
  id: string;
  chain_id: string;
  user_id: string | null;
  input_text: string | null;
  input_image_path: string | null;
  status: RunStatus;
  final_output: string | null;
  final_image_path: string | null;
  error_message: string | null;
  latency_ms: number | null;
  created_at: string;
};

export type ChainRunStep = {
  id: string;
  run_id: string;
  step_id: string | null;
  position: number;
  label: string;
  model: string | null;
  prompt_sent: string;
  output_text: string | null;
  output_image_path: string | null;
  status: "ok" | "error";
  error_message: string | null;
  latency_ms: number | null;
  created_at: string;
};

/** A model as the shared `llm_models` registry lists it. */
export type RegistryModel = {
  model_id: string;
  label: string;
  modality: "text" | "image";
  is_default: boolean;
  sort_order: number;
  enabled: boolean;
};

/**
 * A caption the public app produced. Shown on a chain's media page for
 * `kind = 'caption'` chains, which is where that app's generations come from.
 */
export type PublicCaption = {
  id: string;
  topic: string;
  content: string;
  model: string;
  published: boolean;
  created_at: string;
};

export function displayName(profile: {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}) {
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ");
  return name || profile.email || "Unnamed";
}

export function stepCountLabel(count: number) {
  return count === 1 ? "1 step" : `${count} steps`;
}
