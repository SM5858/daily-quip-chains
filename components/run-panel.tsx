"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { runChainAction } from "@/app/chains/actions";
import { idleState } from "@/lib/action-state";
import { inputClass } from "@/components/ui";
import type { Chain } from "@/lib/types";

function Submit({ steps }: { steps: number }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        disabled={pending || steps === 0}
        className="h-10 rounded-lg bg-accent px-5 text-sm font-semibold text-accent-contrast transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Running the chain…" : `Run ${steps} step${steps === 1 ? "" : "s"}`}
      </button>
      {pending && (
        <span className="text-xs text-muted">
          Each step is its own model call, so this takes a few seconds per step.
          Hold on — you will land on the run&rsquo;s receipt.
        </span>
      )}
    </div>
  );
}

export default function RunPanel({
  chain,
  enabledSteps,
}: {
  chain: Chain;
  enabledSteps: number;
}) {
  const [state, action] = useActionState(runChainAction, idleState);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const wantsImage = chain.input_kind === "image";
  const wantsText = chain.input_kind !== "image";

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="chain_id" value={chain.id} />

      {wantsImage && (
        <label className="flex flex-col gap-2 text-xs font-medium">
          Image to feed the first step
          <input
            type="file"
            name="input_image"
            accept="image/png,image/jpeg,image/webp,image/gif"
            required
            onChange={(event) => {
              const file = event.target.files?.[0];
              setFileName(file?.name ?? null);
              setPreview(file ? URL.createObjectURL(file) : null);
            }}
            className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-accent-soft file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-accent"
          />
          {preview && (
            <span className="mt-1 flex items-center gap-3">
              {/* A blob: URL from the file the admin just picked — next/image
                  cannot optimise it, and there is nothing to optimise. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt=""
                className="h-20 w-20 rounded-lg border border-line object-cover"
              />
              <span className="font-normal text-muted">{fileName}</span>
            </span>
          )}
        </label>
      )}

      {wantsText && (
        <label className="flex flex-col gap-1.5 text-xs font-medium">
          {chain.input_kind === "text"
            ? "Input for the first step"
            : "Optional input"}
          <input
            name="input_text"
            required={chain.input_kind === "text"}
            placeholder="The dorm laundry room on a Sunday night"
            className={inputClass}
          />
          <span className="text-[11px] font-normal text-muted">
            Reaches the steps that use{" "}
            <code className="font-mono">{"{{input}}"}</code>.
          </span>
        </label>
      )}

      {/* An image-input chain can still take a line of text alongside the
          upload — useful for steering a run without editing the template. */}
      {wantsImage && (
        <label className="flex flex-col gap-1.5 text-xs font-medium">
          Extra steer (optional)
          <input
            name="input_text"
            placeholder="Lean into how cold it is"
            className={inputClass}
          />
        </label>
      )}

      <Submit steps={enabledSteps} />

      {state.message && (
        <p
          className={`text-sm ${
            state.status === "error" ? "text-danger" : "text-ok"
          }`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
