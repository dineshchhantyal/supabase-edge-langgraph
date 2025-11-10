// src/server/supabaseClient.ts
// @ts-ignore: Supabase client types resolve at runtime in Edge / Node.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/supabase.ts";
import { requireEnv } from "./env.ts";

export function createServiceClient(): SupabaseClient<Database> {
  const url = requireEnv("SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createClient<Database>(url, serviceKey, {
    auth: {
      persistSession: false,
    },
    global: {
      headers: {
        "X-LangLLM-Service": "edge-chat",
      },
    },
  });
}
