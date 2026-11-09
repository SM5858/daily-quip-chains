import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Supabase redirects here with a `code` after Google sign-in. The URL must be
 * registered verbatim in Supabase and carry no query parameters of its own —
 * the allow list is matched against the whole URL.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocal = process.env.NODE_ENV === "development";
  const baseUrl = isLocal || !forwardedHost ? origin : `https://${forwardedHost}`;

  const failure = (message: string) =>
    NextResponse.redirect(`${baseUrl}/login?error=${encodeURIComponent(message)}`);

  const oauthError =
    searchParams.get("error_description") ?? searchParams.get("error");
  if (oauthError) return failure(oauthError);
  if (!code) return failure("No authorization code was returned.");

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return failure(error.message);

  return NextResponse.redirect(`${baseUrl}/`);
}
