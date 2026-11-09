import { getUser } from "@/lib/auth";
import { signOut } from "@/app/auth/actions";
import ThemeToggle from "@/components/theme-toggle";
import GoogleButton from "./google-button";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const denied = params.denied === "1";
  const error = typeof params.error === "string" ? params.error : null;
  const user = denied ? await getUser() : null;

  return (
    <div className="flex min-h-dvh flex-col px-6">
      <div className="flex justify-end py-4">
        <ThemeToggle />
      </div>

      <div className="flex flex-1 items-center justify-center pb-16">
        <main className="w-full max-w-sm">
          <div className="mb-8">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-sm font-bold text-accent-contrast">
              DQ
            </span>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight">
              Prompt chains
            </h1>
            <p className="mt-2 text-sm text-muted">
              The tool that builds the prompts behind Daily Quip. Sign in with
              the Google account that owns a superadmin profile.
            </p>
          </div>

          {error && (
            <div className="mb-6 rounded-lg border border-danger px-4 py-3 text-sm text-danger">
              {error}
            </div>
          )}

          {denied ? (
            <div className="rounded-lg border border-danger bg-danger-soft p-5">
              <p className="font-semibold">This account is not an admin.</p>
              <p className="mt-2 text-sm text-muted">
                You are signed in as{" "}
                <span className="font-medium text-foreground">{user?.email}</span>
                , but <code className="font-mono">profiles.is_superadmin</code>{" "}
                is not set for it. Access is granted in the Supabase SQL editor,
                or by an existing admin from the console&rsquo;s Users page.
              </p>
              <form action={signOut} className="mt-4">
                <button
                  type="submit"
                  className="rounded-lg border border-line px-4 py-2 text-sm font-medium transition-colors hover:bg-surface-2"
                >
                  Sign in as someone else
                </button>
              </form>
            </div>
          ) : (
            <GoogleButton />
          )}
        </main>
      </div>
    </div>
  );
}
