"use server";

import { redirect } from "next/navigation";
import { createClient } from "@totalweb/supabase/server";

const safeNext = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "/admin");
  return s.startsWith("/") && !s.startsWith("//") ? s : "/admin";
};

// Email + password only. Users are created in Supabase (Authentication > Users > Add user > Create new user);
// the on_auth_user_created trigger gives each one a profile and workspace.
export async function signInWithPassword(fd: FormData) {
  const next = safeNext(fd.get("next"));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(fd.get("email") ?? "").trim(),
    password: String(fd.get("password") ?? ""),
  });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}`);
  redirect(next);
}
