import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { supabaseServiceKey, supabaseUrl } from "./env";

/** Service-role client. Bypasses RLS: server-only, never import from client code. */
export function createAdminClient() {
  return createClient<Database>(supabaseUrl(), supabaseServiceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
