import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { AdminProfile } from "@/lib/types";

export async function getUser(): Promise<User | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

/**
 * The gate on every page and every Server Action in this app.
 *
 * `proxy.ts` already turns away signed-out visitors, and RLS is the real
 * enforcement — but neither covers the case this does: a signed-in, non-admin
 * user POSTing directly at a Server Action. Actions are reachable without ever
 * rendering a page, so the check is repeated at the entry point of each one.
 *
 * The flag itself is read through RLS, so this cannot be spoofed client-side:
 * the row only comes back with `is_superadmin = true` if it really is true.
 */
export async function requireSuperadmin(): Promise<{
  user: User;
  profile: AdminProfile;
}> {
  const user = await getUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, first_name, last_name, avatar_url, is_superadmin, created_at")
    .eq("id", user.id)
    .maybeSingle<AdminProfile>();

  if (!profile?.is_superadmin) redirect("/login?denied=1");

  return { user, profile };
}
