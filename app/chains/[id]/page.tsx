import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperadmin } from "@/lib/auth";
import { getChain, getSteps, listModels, listRuns } from "@/lib/chain-data";
import { formatRelative } from "@/lib/date";
import AppNav from "@/components/app-nav";
import ChainSettings from "@/components/chain-settings";
import RunPanel from "@/components/run-panel";
import StepList from "@/components/step-list";
import { Badge, Card, Duration, PageHeader, Pre } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ChainPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { profile } = await requireSuperadmin();
  const { id } = await params;

  const chain = await getChain(id);
  if (!chain) notFound();

  const [steps, models, runs] = await Promise.all([
    getSteps(id),
    listModels(),
    listRuns(id, 8),
  ]);

  const enabledSteps = steps.filter((step) => step.enabled);
  const isCaption = chain.kind === "caption";

  return (
    <>
      <AppNav profile={profile} />

      <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
        >
          ← All chains
        </Link>

        <PageHeader
          eyebrow={isCaption ? "Caption chain" : "Pipeline chain"}
          title={chain.name}
          description={chain.description ?? undefined}
          action={
            <div className="flex flex-wrap items-center gap-2">
              {chain.enabled ? (
                <Badge tone="ok">enabled</Badge>
              ) : (
                <Badge tone="neutral">off</Badge>
              )}
              <Link
                href={`/chains/${chain.id}/media`}
                className="h-9 rounded-lg border border-line px-4 text-sm font-medium leading-9 transition-colors hover:bg-surface-2"
              >
                View media
              </Link>
            </div>
          }
        />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-6">
            <Card
              title={`Steps (${steps.length})`}
              hint={
                isCaption
                  ? "In order. The public app concatenates these into one prompt — the order is the order they appear in it."
                  : "In order. Each step's output is available to every step after it."
              }
            >
              <StepList chainId={chain.id} steps={steps} models={models} />
            </Card>

            {isCaption && steps.length > 0 && (
              <Card
                title="The prompt the public app builds"
                hint="Every enabled step's template, joined by a blank line. Its own placeholders — {{topic}}, {{angle}}, {{terms}}, {{examples}} — are filled in at generation time by that app, not here."
              >
                <Pre className="max-h-80 overflow-auto text-muted">
                  {enabledSteps.map((step) => step.template).join("\n\n")}
                </Pre>
              </Card>
            )}
          </div>

          <div className="flex flex-col gap-6">
            <Card
              title="Run this chain"
              hint={
                isCaption
                  ? "Careful: this executes the steps in sequence, which is not what the public app does with a caption chain. Useful for seeing what each step says on its own."
                  : undefined
              }
            >
              <RunPanel chain={chain} enabledSteps={enabledSteps.length} />
            </Card>

            <Card title="Recent runs">
              {runs.length === 0 ? (
                <p className="text-sm text-muted">
                  Nothing yet. A run is kept with every step it made, so this
                  fills up as soon as you press run.
                </p>
              ) : (
                <ul className="flex flex-col divide-y divide-line">
                  {runs.map((run) => (
                    <li key={run.id} className="py-2 first:pt-0 last:pb-0">
                      <Link
                        href={`/runs/${run.id}`}
                        className="flex items-center justify-between gap-3 text-xs hover:text-accent"
                      >
                        <span className="min-w-0 truncate">
                          {run.input_text || (run.input_image_path ? "an image" : "—")}
                        </span>
                        <span className="flex shrink-0 items-center gap-2 text-muted">
                          <Duration ms={run.latency_ms} />
                          {run.status === "ok" ? (
                            <Badge tone="ok">ok</Badge>
                          ) : run.status === "error" ? (
                            <Badge tone="danger">error</Badge>
                          ) : (
                            <Badge tone="warn">running</Badge>
                          )}
                        </span>
                      </Link>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {formatRelative(run.created_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Chain settings">
              <ChainSettings chain={chain} />
            </Card>
          </div>
        </div>
      </main>
    </>
  );
}
