import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperadmin } from "@/lib/auth";
import { getChain, getRun, mediaUrl } from "@/lib/chain-data";
import { formatDateTime } from "@/lib/date";
import AppNav from "@/components/app-nav";
import DeleteRunButton from "@/components/delete-run-button";
import RunReceipt from "@/components/run-receipt";
import { Badge, Card, Duration, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function RunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { profile } = await requireSuperadmin();
  const { id } = await params;

  const found = await getRun(id);
  if (!found) notFound();

  const { run, steps } = found;
  const chain = await getChain(run.chain_id);
  const inputImage = mediaUrl(run.input_image_path);
  const finalImage = mediaUrl(run.final_image_path);

  return (
    <>
      <AppNav profile={profile} />

      <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
        <Link
          href={chain ? `/chains/${chain.id}` : "/"}
          className="mb-6 inline-flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
        >
          ← {chain ? chain.name : "All chains"}
        </Link>

        <PageHeader
          eyebrow="Run"
          title={run.status === "ok" ? "Run finished" : "Run failed"}
          description={`${formatDateTime(run.created_at)} · ${steps.length} step${
            steps.length === 1 ? "" : "s"
          } recorded`}
          action={
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-muted">
                <Duration ms={run.latency_ms} />
              </span>
              {run.status === "ok" ? (
                <Badge tone="ok">ok</Badge>
              ) : run.status === "error" ? (
                <Badge tone="danger">error</Badge>
              ) : (
                <Badge tone="warn">running</Badge>
              )}
              <DeleteRunButton runId={run.id} chainId={run.chain_id} />
            </div>
          }
        />

        <div className="flex flex-col gap-6">
          <Card title="What it was given">
            {inputImage && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={inputImage}
                alt="The image this run was started with"
                className="mb-3 max-h-72 w-auto rounded-lg border border-line"
              />
            )}
            {run.input_text ? (
              <p className="text-sm">{run.input_text}</p>
            ) : (
              !inputImage && (
                <p className="text-sm text-muted">
                  Nothing — the first step is self-contained.
                </p>
              )
            )}
          </Card>

          {run.error_message && (
            <div className="rounded-xl border border-danger bg-danger-soft p-5">
              <p className="text-sm font-semibold text-danger">
                The run stopped here
              </p>
              <p className="mt-1 text-sm text-danger">{run.error_message}</p>
            </div>
          )}

          <Card
            title="Every step, in order"
            hint="Each step's prompt is the template with its placeholders already filled in — what the model actually received."
          >
            <RunReceipt steps={steps} />
          </Card>

          {(run.final_output || finalImage) && (
            <Card title="Final output" hint="What the last step produced.">
              {finalImage && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={finalImage}
                  alt="The image this run produced"
                  className="mb-3 max-h-96 w-auto rounded-lg border border-line"
                />
              )}
              {run.final_output && (
                <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                  {run.final_output}
                </div>
              )}
            </Card>
          )}
        </div>
      </main>
    </>
  );
}
