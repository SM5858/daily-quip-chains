import { mediaUrl } from "@/lib/chain-data";
import { Badge, Duration, Pre } from "@/components/ui";
import type { ChainRunStep } from "@/lib/types";

/**
 * One step of a run, as it happened: the prompt that was actually sent after
 * placeholder substitution, which model answered, how long it took, and what
 * came back. The prompt is in a <details> so the page stays readable but the
 * evidence is one click away and needs no JavaScript.
 */
export default function RunReceipt({ steps }: { steps: ChainRunStep[] }) {
  if (steps.length === 0) {
    return (
      <p className="text-sm text-muted">
        This run recorded no steps — it failed before the first model call.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-3">
      {steps.map((step) => {
        const image = mediaUrl(step.output_image_path);

        return (
          <li key={step.id} className="step-rail relative pl-11">
            <span
              className={`absolute left-0 top-4 flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold tabular-nums ${
                step.status === "ok"
                  ? "border-accent bg-accent text-accent-contrast"
                  : "border-danger bg-danger-soft text-danger"
              }`}
            >
              {step.position}
            </span>

            <div className="rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{step.label}</h3>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                  {step.model && <span className="font-mono">{step.model}</span>}
                  <Duration ms={step.latency_ms} />
                  {step.status === "ok" ? (
                    <Badge tone="ok">ok</Badge>
                  ) : (
                    <Badge tone="danger">error</Badge>
                  )}
                </div>
              </div>

              {step.error_message && (
                <p className="mt-3 rounded-lg bg-danger-soft p-3 text-xs text-danger">
                  {step.error_message}
                </p>
              )}

              {image && (
                /* The bucket is public and the file is a model output, so a
                   plain <img> is right: nothing to optimise and no layout
                   shift to avoid at this size. */
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={image}
                  alt={`Image produced by step ${step.position}`}
                  className="mt-3 max-h-80 w-auto rounded-lg border border-line"
                />
              )}

              {step.output_text && (
                <div className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">
                  {step.output_text}
                </div>
              )}

              <details className="mt-3 group">
                <summary className="cursor-pointer text-xs font-medium text-muted transition-colors hover:text-foreground">
                  The exact prompt this step sent
                </summary>
                <Pre className="mt-2 max-h-72 overflow-auto text-muted">
                  {step.prompt_sent}
                </Pre>
              </details>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
