import { supabase } from "./supabase";

/**
 * Signs out only the current device. supabase.auth.signOut() defaults to
 * scope "global", which revokes every session of the user, so logging out on
 * the web also kicked the desktop app (and vice versa) and stopped its sync.
 */
export async function signOutThisDevice(): Promise<{ error: Error | null }> {
  const { error } = await supabase.auth.signOut({ scope: "local" });
  return { error };
}
