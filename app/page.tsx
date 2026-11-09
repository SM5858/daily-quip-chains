import Link from "next/link";
import { requireSuperadmin } from "@/lib/auth";
import { listChains, type ChainSummary } from "@/lib/chain-data";
import AppNav from "@/components/app-nav";
import ChainCreate from "@/components/chain-create";
import { Badge, EmptyState, PageHeader, StatTile } from "@/components/ui";
import { stepCountLabel } from "@/lib/types";

export const dynamic = "force-dynamic";

function ChainCard({ chain }: { chain: ChainSummary }) {
  const pipeline = chain.kind === "pipeline";

  return (
    <li className="rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/chains/${chain.id}`}
            className="text-base font-semibold tracking-tight hover:text-accent"
          >
            {chain.name}
          </Link>
          <p className="mt-0.5 font-mono text-[11px] text-muted">{chain.slug}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {pipeline ? (
            <Badge tone="accent">pipeline</Badge>
          ) : (
            <Badge tone="warn">caption</Badge>
          )}
          {chain.enabled ? (
            <Badge tone="ok">enabled</Badge>
          ) : (
            <Badge tone="neutral">off</Badge>
          )}
        </div>
      </div>

      {chain.description && (
        <p className="mt-3 text-sm text-muted">{chain.description}</p>
      )}

      <dl className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted">
        <div className="flex gap-1.5">
          <dt>Steps</dt>
          <dd className="font-semibold text-foreground">
            {stepCountLabel(chain.stepCount)}
          </dd>
        </div>
        <div className="flex gap-1.5">
          <dt>Starts with</dt>
          <dd className="font-semibold text-foreground">
            {chain.input_kind === "image"
              ? "an image"
              : chain.input_kind === "text"
                ? "text"
                : "nothing"}
          </dd>
        </div>
        <div className="flex gap-1.5">
          <dt>Runs</dt>
          <dd className="font-semibold text-foreground tabular-nums">
            {chain.runCount}
          </dd>
        </div>
        {!pipeline && (
          <div className="flex gap-1.5">
            <dt>Mix</dt>
            <dd className="font-semibold text-foreground tabular-nums">
              {chain.mix_weight}
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-4 flex items-center gap-4 text-xs font-medium">
        <Link href={`/chains/${chain.id}`} className="text-accent hover:underline">
          Edit steps
        </Link>
        <Link
          href={`/chains/${chain.id}/media`}
          className="text-accent hover:underline"
        >
          Media
        </Link>
      </div>
    </li>
  );
}

export default async function ChainsPage() {
  const { profile } = await requireSuperadmin();
  const chains = await listChains();

  const pipelines = chains.filter((chain) => chain.kind === "pipeline");
  const captions = chains.filter((chain) => chain.kind === "caption");
  const totalSteps = chains.reduce((sum, chain) => sum + chain.stepCount, 0);
  const totalRuns = chains.reduce((sum, chain) => sum + chain.runCount, 0);

  return (
    <>
      <AppNav profile={profile} />

      <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <PageHeader
          eyebrow="Prompt chains"
          title="Chains"
          description={
            <>
              A chain is an ordered list of steps. A{" "}
              <strong className="font-semibold text-foreground">pipeline</strong>{" "}
              chain runs its steps one after another, each reading the output of
              the one before it. A{" "}
              <strong className="font-semibold text-foreground">caption</strong>{" "}
              chain is the other shape: its steps are concatenated into a single
              prompt, and it is what the public Daily Quip app writes captions
              with.
            </>
          }
          action={<ChainCreate />}
        />

        <div className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Pipeline chains" value={pipelines.length} />
          <StatTile label="Caption chains" value={captions.length} />
          <StatTile label="Steps in total" value={totalSteps} />
          <StatTile label="Runs recorded" value={totalRuns} />
        </div>

        <section className="mb-10">
          <h2 className="mb-3 text-sm font-semibold">Pipeline chains</h2>
          {pipelines.length === 0 ? (
            <EmptyState>
              No pipeline chains yet. “New chain” builds one.
            </EmptyState>
          ) : (
            <ul className="grid gap-4 lg:grid-cols-2">
              {pipelines.map((chain) => (
                <ChainCard key={chain.id} chain={chain} />
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="text-sm font-semibold">Caption chains</h2>
          <p className="mb-3 mt-1 text-xs text-muted">
            These are live: the public app picks one at random, weighted by its
            mix, every time somebody generates a caption. Editing their steps
            changes what that app writes.
          </p>
          {captions.length === 0 ? (
            <EmptyState>
              None configured — the public app is falling back to its built-in
              prompt.
            </EmptyState>
          ) : (
            <ul className="grid gap-4 lg:grid-cols-2">
              {captions.map((chain) => (
                <ChainCard key={chain.id} chain={chain} />
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
