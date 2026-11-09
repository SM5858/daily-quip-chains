"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { addStep, deleteStep, moveStep, updateStep } from "@/app/chains/actions";
import { idleState, type ActionState } from "@/lib/action-state";
import { Badge, inputClass } from "@/components/ui";
import type { ChainStep, RegistryModel } from "@/lib/types";

function Submit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-9 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-contrast transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {pending ? busy : label}
    </button>
  );
}

function Message({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return (
    <span
      className={`text-xs ${state.status === "error" ? "text-danger" : "text-ok"}`}
    >
      {state.message}
    </span>
  );
}

function ModelSelect({
  models,
  value,
}: {
  models: RegistryModel[];
  value?: string | null;
}) {
  const text = models.filter((model) => model.modality === "text");
  const image = models.filter((model) => model.modality === "image");

  return (
    <label className="flex flex-col gap-1.5 text-xs font-medium">
      Model
      <select name="model_id" defaultValue={value ?? ""} className={inputClass}>
        <option value="">Whatever the registry says (recommended)</option>
        {text.length > 0 && (
          <optgroup label="Text">
            {text.map((model) => (
              <option key={model.model_id} value={model.model_id}>
                {model.label}
                {model.enabled ? "" : " — disabled"}
              </option>
            ))}
          </optgroup>
        )}
        {image.length > 0 && (
          <optgroup label="Image">
            {image.map((model) => (
              <option key={model.model_id} value={model.model_id}>
                {model.label}
                {model.enabled ? "" : " — disabled"}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </label>
  );
}

function StepFields({
  models,
  step,
}: {
  models: RegistryModel[];
  step?: ChainStep;
}) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-xs font-medium">
          Label
          <input
            name="label"
            required
            defaultValue={step?.label ?? ""}
            placeholder="Describe the image"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium">
          This step outputs
          <select
            name="output_kind"
            defaultValue={step?.output_kind ?? "text"}
            className={inputClass}
          >
            <option value="text">Text</option>
            <option value="image">An image</option>
          </select>
        </label>
        <div className="sm:col-span-2">
          <ModelSelect models={models} value={step?.model_id} />
        </div>
        <label className="flex flex-col gap-1.5 text-xs font-medium sm:col-span-2">
          Prompt template
          <textarea
            name="template"
            required
            rows={8}
            defaultValue={step?.template ?? ""}
            placeholder={
              "Here is a description of a photo:\n\n{{previous}}\n\nWhat is funny about it?"
            }
            className={`${inputClass} font-mono text-xs`}
          />
          <span className="text-[11px] font-normal text-muted">
            <code className="font-mono">{"{{input}}"}</code> is what the run was
            started with, <code className="font-mono">{"{{previous}}"}</code> the
            step before this one,{" "}
            <code className="font-mono">{"{{step1}}"}</code> any earlier step by
            position, and <code className="font-mono">{"{{image}}"}</code>{" "}
            attaches the uploaded image to this step. A step that mentions none
            of them still gets the previous output, appended at the end.
          </span>
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium sm:col-span-2">
          Note to self
          <input
            name="notes"
            defaultValue={step?.notes ?? ""}
            placeholder="Optional. Not sent to the model."
            className={inputClass}
          />
        </label>
      </div>
      {step && (
        <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" name="enabled" defaultChecked={step.enabled} />
          Enabled — a disabled step is skipped when the chain runs
        </label>
      )}
    </>
  );
}

/**
 * The reorder control. Each button is its own form posting an absolute target
 * position, so "move step 2 to step 1" is one request and the server does the
 * renumbering in one transaction.
 */
function Reorder({
  chainId,
  step,
  total,
}: {
  chainId: string;
  step: ChainStep;
  total: number;
}) {
  const [state, action] = useActionState(moveStep, idleState);
  const jumpRef = useRef<HTMLFormElement>(null);

  const arrow =
    "flex h-7 w-7 items-center justify-center rounded-md border border-line text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35";

  return (
    <div className="flex items-center gap-1.5">
      <form action={action}>
        <input type="hidden" name="chain_id" value={chainId} />
        <input type="hidden" name="step_id" value={step.id} />
        <input type="hidden" name="to" value={step.position - 1} />
        <button
          type="submit"
          disabled={step.position <= 1}
          title="Move up"
          aria-label={`Move “${step.label}” up`}
          className={arrow}
        >
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
            <path
              d="M8 3.5 3.5 8m4.5-4.5L12.5 8M8 3.5V12.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </form>

      <form action={action}>
        <input type="hidden" name="chain_id" value={chainId} />
        <input type="hidden" name="step_id" value={step.id} />
        <input type="hidden" name="to" value={step.position + 1} />
        <button
          type="submit"
          disabled={step.position >= total}
          title="Move down"
          aria-label={`Move “${step.label}” down`}
          className={arrow}
        >
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
            <path
              d="M8 12.5 3.5 8m4.5 4.5L12.5 8M8 12.5V3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </form>

      {total > 2 && (
        <form ref={jumpRef} action={action} className="flex items-center">
          <input type="hidden" name="chain_id" value={chainId} />
          <input type="hidden" name="step_id" value={step.id} />
          <select
            name="to"
            // Uncontrolled, with the position as the key: the browser keeps the
            // user's choice long enough for requestSubmit() to read it, and a
            // reorder remounts the control showing the new position.
            key={step.position}
            defaultValue={step.position}
            aria-label={`Move “${step.label}” to a position`}
            onChange={() => jumpRef.current?.requestSubmit()}
            className="h-7 rounded-md border border-line bg-background px-1.5 text-[11px] text-muted outline-none transition-colors hover:text-foreground focus:border-accent"
          >
            {Array.from({ length: total }, (_, index) => index + 1).map((slot) => (
              <option key={slot} value={slot}>
                → {slot}
              </option>
            ))}
          </select>
        </form>
      )}

      <Message state={state} />
    </div>
  );
}

function StepCard({
  chainId,
  step,
  total,
  models,
}: {
  chainId: string;
  step: ChainStep;
  total: number;
  models: RegistryModel[];
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleteState, deleteAction] = useActionState(deleteStep, idleState);

  // Wrapping the Server Action rather than watching its result in an effect:
  // this runs on the client, so closing the editor on success is part of the
  // same transition that saved it — no extra render pass showing a saved form
  // the admin then has to dismiss.
  const [saveState, saveAction] = useActionState(
    async (previous: ActionState, formData: FormData) => {
      const result = await updateStep(previous, formData);
      if (result.status === "success") setEditing(false);
      return result;
    },
    idleState
  );

  return (
    <li className="step-rail relative pl-11">
      <span
        className={`absolute left-0 top-4 flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold tabular-nums ${
          step.enabled
            ? "border-accent bg-accent text-accent-contrast"
            : "border-line bg-surface-2 text-muted"
        }`}
      >
        {step.position}
      </span>

      <div className="rounded-xl border border-line bg-surface p-4">
        {editing ? (
          <form action={saveAction} className="flex flex-col gap-3">
            <input type="hidden" name="chain_id" value={chainId} />
            <input type="hidden" name="step_id" value={step.id} />
            <StepFields models={models} step={step} />
            <div className="flex flex-wrap items-center gap-3">
              <Submit label="Save step" busy="Saving…" />
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="h-9 rounded-lg border border-line px-4 text-sm font-medium transition-colors hover:bg-surface-2"
              >
                Cancel
              </button>
              <Message state={saveState} />
            </div>
          </form>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">{step.label}</h3>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Badge tone={step.output_kind === "image" ? "accent" : "neutral"}>
                    outputs {step.output_kind}
                  </Badge>
                  {step.model_id && (
                    <Badge tone="warn">pinned to {step.model_id}</Badge>
                  )}
                  {!step.enabled && <Badge tone="danger">skipped</Badge>}
                </div>
              </div>
              <Reorder chainId={chainId} step={step} total={total} />
            </div>

            <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-2 p-3 font-mono text-[11px] leading-relaxed text-muted">
              {step.template}
            </pre>

            {step.notes && (
              <p className="mt-2 text-xs italic text-muted">{step.notes}</p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-xs font-medium text-accent hover:underline"
              >
                Edit
              </button>
              {confirming ? (
                <form action={deleteAction} className="flex items-center gap-2">
                  <input type="hidden" name="chain_id" value={chainId} />
                  <input type="hidden" name="step_id" value={step.id} />
                  <span className="text-xs text-muted">Delete this step?</span>
                  <button
                    type="submit"
                    className="text-xs font-semibold text-danger hover:underline"
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    className="text-xs text-muted hover:underline"
                  >
                    No
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="text-xs text-muted hover:text-danger"
                >
                  Delete
                </button>
              )}
              {/* The editor closes itself on success, so its confirmation is
                  shown out here where there is still something to show it on. */}
              <Message state={saveState} />
              <Message state={deleteState} />
            </div>
          </>
        )}
      </div>
    </li>
  );
}

function AddStep({
  chainId,
  models,
}: {
  chainId: string;
  models: RegistryModel[];
}) {
  const [state, action] = useActionState(addStep, idleState);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ml-11 rounded-lg border border-accent px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent-soft"
      >
        + Add a step
      </button>
    );
  }

  return (
    <form
      action={action}
      className="ml-11 flex flex-col gap-3 rounded-xl border border-line bg-surface p-4"
    >
      <input type="hidden" name="chain_id" value={chainId} />
      <StepFields models={models} />
      <div className="flex flex-wrap items-center gap-3">
        <Submit label="Add step" busy="Adding…" />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-9 rounded-lg border border-line px-4 text-sm font-medium transition-colors hover:bg-surface-2"
        >
          Cancel
        </button>
        <Message state={state} />
      </div>
    </form>
  );
}

export default function StepList({
  chainId,
  steps,
  models,
}: {
  chainId: string;
  steps: ChainStep[];
  models: RegistryModel[];
}) {
  return (
    <div className="flex flex-col gap-4">
      {steps.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">
          No steps yet. A chain with no steps has nothing to run.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {steps.map((step) => (
            <StepCard
              key={step.id}
              chainId={chainId}
              step={step}
              total={steps.length}
              models={models}
            />
          ))}
        </ol>
      )}
      <AddStep chainId={chainId} models={models} />
    </div>
  );
}
