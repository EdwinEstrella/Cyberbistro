import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { defaultSendResendEmail, handleRequest } from "./handler.ts";
import { createSupabaseStore } from "./store.ts";

function getEnv(name: string): string | undefined {
  // @ts-ignore Deno global in Edge runtime
  if (typeof Deno !== "undefined" && Deno.env) {
    // @ts-ignore Deno global in Edge runtime
    return Deno.env.get(name)?.trim();
  }
  if (typeof process !== "undefined" && process.env) {
    return process.env[name]?.trim();
  }
  return undefined;
}

let store: ReturnType<typeof createSupabaseStore> | null = null;

function getStore() {
  if (!store) {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in edge function environment.");
    }
    const client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    store = createSupabaseStore(client);
  }
  return store;
}

// @ts-ignore Deno global in Edge runtime
if (typeof Deno !== "undefined" && typeof Deno.serve === "function") {
  // @ts-ignore Deno.serve
  Deno.serve((req: Request) => {
    try {
      const activeStore = getStore();
      return handleRequest(req, {
        store: activeStore,
        getResendApiKey: () => getEnv("RESEND_API_KEY"),
        sendResendEmail: defaultSendResendEmail,
        log: (level, msg, detail) => {
          // Never log secrets or auth keys: log messages and public identifiers only
          console[level](`[menu-suggestion-email] ${msg}`, detail ?? "");
        },
      });
    } catch (err) {
      console.error("[menu-suggestion-email] runtime initialization failed", err);
      return new Response(JSON.stringify({ ok: false, error: "Service unavailable" }), {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json; charset=utf-8",
        },
      });
    }
  });
}
