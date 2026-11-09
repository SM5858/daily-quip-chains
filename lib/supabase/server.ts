import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseEnv } from "@/lib/env";

/**
 * One client per request. This app deliberately uses the anon key and the
 * caller's own session — never a service_role key — so every query is still
 * filtered by the row level security policies in supabase/admin.sql.
 */
export async function createClient() {
  const { url, anonKey } = supabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot write cookies; proxy.ts refreshes them.
        }
      },
    },
  });
}
