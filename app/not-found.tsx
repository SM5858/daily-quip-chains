import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-widest text-accent">
        404
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">
        That chain is not here
      </h1>
      <p className="mt-2 text-sm text-muted">
        It may have been deleted, or the link may be from a different database.
      </p>
      <Link
        href="/"
        className="mt-6 h-9 rounded-lg bg-accent px-4 text-sm font-semibold leading-9 text-accent-contrast transition-opacity hover:opacity-90"
      >
        All chains
      </Link>
    </main>
  );
}
