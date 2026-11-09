"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { createChain } from "@/app/chains/actions";
import { idleState } from "@/lib/action-state";
import { inputClass } from "@/components/ui";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-9 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-contrast transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {pending ? "Creating…" : "Create chain"}
    </button>
  );
}

export default function ChainCreate() {
  const [state, action] = useActionState(createChain, idleState);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-9 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-contrast transition-opacity hover:opacity-90"
      >
        + New chain
      </button>
    );
  }

  return (
    <form
      action={action}
      className="flex w-full flex-col gap-3 rounded-xl border border-line bg-surface p-5"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-xs font-medium">
          Name
          <input
            name="name"
            required
            placeholder="Image → captions"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium">
          Starts with
          <select name="input_kind" defaultValue="text" className={inputClass}>
            <option value="text">A line of text</option>
            <option value="image">An uploaded image</option>
            <option value="none">Nothing — the first step is self-contained</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium sm:col-span-2">
          What it does
          <textarea
            name="description"
            rows={2}
            placeholder="Describe an uploaded image, find the funny in it, then write five captions."
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium sm:col-span-2">
          Slug
          <input
            name="slug"
            placeholder="left blank, it is derived from the name"
            className={`${inputClass} font-mono text-xs`}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Submit />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-9 rounded-lg border border-line px-4 text-sm font-medium transition-colors hover:bg-surface-2"
        >
          Cancel
        </button>
        {state.message && (
          <span
            className={`text-xs ${
              state.status === "error" ? "text-danger" : "text-ok"
            }`}
          >
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}
