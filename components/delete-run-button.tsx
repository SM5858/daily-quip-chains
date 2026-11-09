"use client";

import { useActionState, useState } from "react";
import { deleteRun } from "@/app/chains/actions";
import { idleState } from "@/lib/action-state";

export default function DeleteRunButton({
  runId,
  chainId,
}: {
  runId: string;
  chainId: string;
}) {
  const [state, action] = useActionState(deleteRun, idleState);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs text-muted transition-colors hover:text-danger"
      >
        Delete run
      </button>
    );
  }

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="run_id" value={runId} />
      <input type="hidden" name="chain_id" value={chainId} />
      <span className="text-xs text-muted">Delete this run?</span>
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
      {state.message && <span className="text-xs text-danger">{state.message}</span>}
    </form>
  );
}
