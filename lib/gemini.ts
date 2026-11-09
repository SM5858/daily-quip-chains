/**
 * The model call. One function serves all three shapes a chain step can take:
 * text in / text out, image + text in / text out, and text in / image out.
 *
 * Server-only: `GEMINI_API_KEY` has no `NEXT_PUBLIC_` prefix, so it never
 * reaches the browser.
 */

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

/**
 * Used when the `llm_models` registry has nothing enabled for a modality, so a
 * misconfigured or empty database cannot take the runner down.
 */
export const FALLBACK_TEXT_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash"];
export const FALLBACK_IMAGE_MODELS = [
  "gemini-3.1-flash-image",
  "gemini-3-pro-image",
];

/** A bare model id, e.g. `gemini-3.6-flash`. */
const MODEL_ID = /^[a-z0-9][a-z0-9.\-]*$/i;

/**
 * A model name goes straight into the request path, so a stray quote or a
 * `models/` prefix produces "unexpected model name format" from Google. Clean
 * up the common paste mistakes and drop the value if it still does not look
 * like a model id — a bad row in the registry should not break a run when
 * there are working defaults behind it.
 */
export function normalizeModel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^models\//, "")
    .trim();
  return MODEL_ID.test(cleaned) ? cleaned : null;
}

export type Attachment = {
  mimeType: string;
  /** base64, without a data: prefix. */
  data: string;
};

export type ModelOutput = {
  model: string;
  text: string | null;
  image: { mimeType: string; base64: string } | null;
  latencyMs: number;
  httpStatus: number;
};

/** One entry per model actually called, successful or not. Kept for the run log. */
export type Attempt = {
  model: string;
  httpStatus: number | null;
  errorMessage: string | null;
  latencyMs: number;
};

type GeminiPart = {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mimeType?: string; mime_type?: string; data?: string };
};

type GeminiResponse = {
  candidates?: {
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string };
};

function partsFrom(prompt: string, attachments: Attachment[]) {
  // Images first: Gemini follows the instruction better when the text that
  // refers to the attachment comes after it.
  return [
    ...attachments.map((file) => ({
      inlineData: { mimeType: file.mimeType, data: file.data },
    })),
    { text: prompt },
  ];
}

function readParts(payload: GeminiResponse) {
  const parts = payload.candidates?.[0]?.content?.parts ?? [];

  const text = parts
    .map((part) => part.text ?? "")
    .join("")
    .trim();

  let image: { mimeType: string; base64: string } | null = null;
  for (const part of parts) {
    // The REST API has used both spellings over the years; accept either.
    const inline = part.inlineData ?? part.inline_data;
    const data = inline?.data;
    if (!data) continue;
    const mimeType =
      inline?.mimeType ??
      (inline as { mime_type?: string } | undefined)?.mime_type ??
      "image/png";
    image = { mimeType, base64: data };
    break;
  }

  return { text: text || null, image };
}

/**
 * `429`/`503` mean busy or rate limited and `404`/"model ..." means this
 * particular model is unusable — both are worth trying the next model. Anything
 * else (a bad key, a blocked prompt) would fail identically for all of them.
 */
function worthRetrying(status: number, message: string) {
  if (status === 429 || status === 503 || status === 404) return true;
  return /model/i.test(message);
}

export async function callModel({
  prompt,
  models,
  attachments = [],
  wantImage = false,
  baseUrl = DEFAULT_BASE_URL,
}: {
  prompt: string;
  models: string[];
  attachments?: Attachment[];
  wantImage?: boolean;
  baseUrl?: string;
}): Promise<{ output: ModelOutput; attempts: Attempt[] }> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      "Missing GEMINI_API_KEY. Add it to .env.local and to the Vercel project settings."
    );
  }

  const chain = models.map(normalizeModel).filter((m): m is string => m !== null);
  if (chain.length === 0) {
    throw new Error("No usable model is configured for this step.");
  }

  const attempts: Attempt[] = [];
  let lastError = "The model call failed.";

  for (const model of chain) {
    const startedAt = Date.now();

    const body: Record<string, unknown> = {
      contents: [{ role: "user", parts: partsFrom(prompt, attachments) }],
      generationConfig: wantImage
        ? { responseModalities: ["IMAGE"] }
        : {
            temperature: 1.05,
            maxOutputTokens: 2048,
            candidateCount: 1,
            // Gemini thinks before answering and that thinking counts against
            // maxOutputTokens, which can otherwise return an empty response.
            thinkingConfig: { thinkingBudget: 0 },
          },
    };

    let response: Response;
    try {
      response = await fetch(
        `${baseUrl.replace(/\/$/, "")}/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": process.env.GEMINI_API_KEY as string,
          },
          cache: "no-store",
          body: JSON.stringify(body),
        }
      );
    } catch (cause) {
      const latencyMs = Date.now() - startedAt;
      lastError = cause instanceof Error ? cause.message : "Network error.";
      attempts.push({ model, httpStatus: null, errorMessage: lastError, latencyMs });
      continue;
    }

    const latencyMs = Date.now() - startedAt;
    const raw = await response.text();

    let payload: GeminiResponse = {};
    try {
      payload = raw ? (JSON.parse(raw) as GeminiResponse) : {};
    } catch {
      payload = {};
    }

    if (!response.ok) {
      lastError =
        payload.error?.message ??
        (raw ? raw.slice(0, 200) : `The model returned ${response.status}.`);
      attempts.push({
        model,
        httpStatus: response.status,
        errorMessage: lastError,
        latencyMs,
      });
      if (worthRetrying(response.status, lastError)) continue;
      throw new Error(lastError.slice(0, 400));
    }

    if (payload.promptFeedback?.blockReason) {
      lastError = `The model blocked that prompt (${payload.promptFeedback.blockReason}).`;
      attempts.push({
        model,
        httpStatus: response.status,
        errorMessage: lastError,
        latencyMs,
      });
      throw new Error(lastError);
    }

    const { text, image } = readParts(payload);
    const gotWhatWeAsked = wantImage ? image !== null : text !== null;

    if (gotWhatWeAsked) {
      attempts.push({ model, httpStatus: response.status, errorMessage: null, latencyMs });
      return {
        output: { model, text, image, latencyMs, httpStatus: response.status },
        attempts,
      };
    }

    lastError = wantImage
      ? `${model} returned no image (finishReason: ${
          payload.candidates?.[0]?.finishReason ?? "unknown"
        }).`
      : `${model} returned no text (finishReason: ${
          payload.candidates?.[0]?.finishReason ?? "unknown"
        }).`;
    attempts.push({
      model,
      httpStatus: response.status,
      errorMessage: lastError,
      latencyMs,
    });
  }

  const error = new Error(lastError.slice(0, 400));
  // Carried so the caller can log every model it tried, not just the last one.
  (error as Error & { attempts?: Attempt[] }).attempts = attempts;
  throw error;
}
