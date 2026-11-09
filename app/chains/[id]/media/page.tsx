import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperadmin } from "@/lib/auth";
import {
  getChain,
  listRuns,
  mediaUrl,
  publicCaptionsForChain,
  stepsForRuns,
} from "@/lib/chain-data";
import { formatDateTime, formatRelative } from "@/lib/date";
import AppNav from "@/components/app-nav";
import DeleteRunButton from "@/components/delete-run-button";
import {
  Badge,
  Card,
  Duration,
  EmptyState,
  PageHeader,
  StatTile,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ChainMediaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { profile } = await requireSuperadmin();
  const { id } = await params;

  const chain = await getChain(id);
  if (!chain) notFound();

  const runs = await listRuns(id, 60);
  const [runSteps, captions] = await Promise.all([
    stepsForRuns(runs.map((run) => run.id)),
    // Only a caption chain has public traffic to show; skip the two queries
    // for a pipeline chain rather than ask and get nothing.
    chain.kind === "caption" ? publicCaptionsForChain(id, 40) : Promise.resolve([]),
  ]);

  const succeeded = runs.filter((run) => run.status === "ok");
  const failed = runs.filter((run) => run.status === "error");
  const timed = succeeded.filter((run) => run.latency_ms !== null);
  const averageMs =
    timed.length > 0
      ? Math.round(
          timed.reduce((sum, run) => sum + (run.latency_ms ?? 0), 0) / timed.length
        )
      : null;

  return (
    <>
      <AppNav profile={profile} />

      <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <Link
          href={`/chains/${chain.id}`}
          className="mb-6 inline-flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
        >
          ← {chain.name}
        </Link>

        <PageHeader
          eyebrow="Media"
          title={`Produced by ${chain.name}`}
          description={
            chain.kind === "caption"
              ? "Two sources, both tied to this chain: runs started here, and the captions the public Daily Quip app generated from it — joined up through the generation log, which records the chain behind every prompt."
              : "Every run of this chain, newest first. Each one links to the full receipt: the prompt each step sent and what came back."
          }
        />

        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Runs" value={runs.length} />
          <StatTile label="Finished" value={succeeded.length} />
          <StatTile label="Failed" value={failed.length} />
          <StatTile
            label="Average run"
            value={averageMs === null ? "—" : `${(averageMs / 1000).toFixed(1)} s`}
            hint="Successful runs only"
          />
        </div>

        <section className="mb-10">
          <h2 className="mb-3 text-sm font-semibold">Runs from this tool</h2>

          {runs.length === 0 ? (
            <EmptyState>
              Nothing yet.{" "}
              <Link
                href={`/chains/${chain.id}`}
                className="font-medium text-accent hover:underline"
              >
                Run the chain
              </Link>{" "}
              and it shows up here.
            </EmptyState>
          ) : (
            <ul className="grid gap-4 lg:grid-cols-2">
              {runs.map((run) => {
                const steps = runSteps.get(run.id) ?? [];
                const inputImage = mediaUrl(run.input_image_path);
                const outputImage =
                  mediaUrl(run.final_image_path) ??
                  mediaUrl(
                    steps.find((step) => step.output_image_path)?.output_image_path ??
                      null
                  );

                return (
                  <li
                    key={run.id}
                    className="flex flex-col rounded-xl border border-line bg-surface p-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[11px] text-muted">
                        {formatDateTime(run.created_at)} ·{" "}
                        {formatRelative(run.created_at)}
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-muted">
                        <Duration ms={run.latency_ms} />
                        {run.status === "ok" ? (
                          <Badge tone="ok">ok</Badge>
                        ) : run.status === "error" ? (
                          <Badge tone="danger">error</Badge>
                        ) : (
                          <Badge tone="warn">running</Badge>
                        )}
                      </div>
                    </div>

                    {(inputImage || outputImage) && (
                      <div className="mt-3 flex flex-wrap gap-3">
                        {inputImage && (
                          <figure>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={inputImage}
                              alt="Input image for this run"
                              className="h-24 w-24 rounded-lg border border-line object-cover"
                            />
                            <figcaption className="mt-1 text-[10px] uppercase tracking-wide text-muted">
                              in
                            </figcaption>
                          </figure>
                        )}
                        {outputImage && (
                          <figure>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={outputImage}
                              alt="Image produced by this run"
                              className="h-24 w-24 rounded-lg border border-line object-cover"
                            />
                            <figcaption className="mt-1 text-[10px] uppercase tracking-wide text-muted">
                              out
                            </figcaption>
                          </figure>
                        )}
                      </div>
                    )}

                    {run.input_text && (
                      <p className="mt-3 text-xs text-muted">
                        <span className="font-semibold text-foreground">
                          Given:
                        </span>{" "}
                        {run.input_text}
                      </p>
                    )}

                    {run.final_output ? (
                      <div className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words text-sm leading-relaxed">
                        {run.final_output}
                      </div>
                    ) : run.error_message ? (
                      <p className="mt-3 rounded-lg bg-danger-soft p-3 text-xs text-danger">
                        {run.error_message}
                      </p>
                    ) : null}

                    <div className="mt-4 flex flex-wrap items-center gap-1.5">
                      {steps.map((step) => (
                        <span
                          key={step.id}
                          title={step.label}
                          className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                            step.status === "ok"
                              ? "bg-surface-2 text-muted"
                              : "bg-danger-soft text-danger"
                          }`}
                        >
                          {step.position}. {step.label}
                        </span>
                      ))}
                    </div>

                    <div className="mt-4 flex items-center gap-4 border-t border-line pt-3">
                      <Link
                        href={`/runs/${run.id}`}
                        className="text-xs font-medium text-accent hover:underline"
                      >
                        Full receipt
                      </Link>
                      <DeleteRunButton runId={run.id} chainId={chain.id} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {chain.kind === "caption" && (
          <section>
            <h2 className="text-sm font-semibold">
              Captions the public app wrote with this chain
            </h2>
            <p className="mb-3 mt-1 text-xs text-muted">
              Not produced here. These come from{" "}
              <code className="font-mono">generation_requests</code>, which
              records which chain built the prompt behind every caption.
            </p>

            {captions.length === 0 ? (
              <EmptyState>
                No captions yet from this chain. Either nobody has generated one
                while it was in the mix, or the mix weight is zero.
              </EmptyState>
            ) : (
              <Card>
                <ul className="flex flex-col divide-y divide-line">
                  {captions.map((caption) => (
                    <li key={caption.id} className="py-3 first:pt-0 last:pb-0">
                      <p className="text-sm leading-relaxed">{caption.content}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                        <span className="font-medium text-foreground">
                          {caption.topic}
                        </span>
                        <span className="font-mono">{caption.model}</span>
                        <span>{formatDateTime(caption.created_at)}</span>
                        {caption.published ? (
                          <Badge tone="ok">on the board</Badge>
                        ) : (
                          <Badge tone="neutral">draft</Badge>
                        )}
                      </p>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>
        )}
      </main>
    </>
  );
}
