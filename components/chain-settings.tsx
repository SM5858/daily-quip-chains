"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { deleteChain, updateChain } from "@/app/chains/actions";
import { idleState } from "@/lib/action-state";
import { inputClass } from "@/components/ui";
import type { Chain } from "@/lib/types";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-9 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-contrast transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {pending ? "Saving…" : "Save chain"}
    </button>
  );
}

export default function ChainSettings({ chain }: { chain: Chain }) {
  const [saveState, saveAction] = useActionState(updateChain, idleState);
  const [deleteState, deleteAction] = useActionState(deleteChain, idleState);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <form action={saveAction} className="flex flex-col gap-3">
        <input type="hidden" name="chain_id" value={chain.id} />

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-xs font-medium">
            Name
            <input
              name="name"
              required
              defaultValue={chain.name}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium">
            Slug
            <input
              name="slug"
              defaultValue={chain.slug}
              className={`${inputClass} font-mono text-xs`}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium sm:col-span-2">
            What it does
            <textarea
              name="description"
              rows={2}
              defaultValue={chain.description ?? ""}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium">
            Starts with
            <select
              name="input_kind"
              defaultValue={chain.input_kind}
              className={inputClass}
            >
              <option value="text">A line of text</option>
              <option value="image">An uploaded image</option>
              <option value="none">Nothing</option>
            </select>
          </label>
        </div>

        <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" name="enabled" defaultChecked={chain.enabled} />
          Enabled
          {chain.kind === "caption" && (
            <span>— turning this off takes it out of the public app&rsquo;s mix</span>
          )}
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <Submit />
          {saveState.message && (
            <span
              className={`text-xs ${
                saveState.status === "error" ? "text-danger" : "text-ok"
              }`}
            >
              {saveState.message}
            </span>
          )}
        </div>
      </form>

      <div className="border-t border-line pt-4">
        {confirming ? (
          <form action={deleteAction} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="chain_id" value={chain.id} />
            <p className="text-xs text-muted">
              Delete <strong className="text-foreground">{chain.name}</strong>,
              its steps and every run recorded against it? This cannot be undone.
            </p>
            <button
              type="submit"
              className="h-9 rounded-lg bg-danger px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Delete it
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="h-9 rounded-lg border border-line px-4 text-sm font-medium transition-colors hover:bg-surface-2"
            >
              Keep it
            </button>
            {deleteState.message && (
              <span className="text-xs text-danger">{deleteState.message}</span>
            )}
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="text-xs font-medium text-muted hover:text-danger"
          >
            Delete this chain
          </button>
        )}
      </div>
    </div>
  );
}
