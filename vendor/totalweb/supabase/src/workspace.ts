import { cookies } from "next/headers";
import { createClient, requireUser } from "./server";

import { WORKSPACE_COOKIE } from "./constants";
export { WORKSPACE_COOKIE };

export type Workspace = { id: string; name: string; slug: string; role: string };

/** Workspaces the signed-in user belongs to. */
export async function listWorkspaces(): Promise<Workspace[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspace_members")
    .select("role, workspaces(id, name, slug)")
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((row: any) => ({ ...row.workspaces, role: row.role }));
}

/**
 * The active workspace for this request: the cookie selection if the user is still a member,
 * otherwise their first workspace (one is auto-created on signup by `handle_new_user`).
 */
export async function requireWorkspace(): Promise<Workspace> {
  await requireUser();
  const workspaces = await listWorkspaces();
  if (!workspaces.length) throw new Error("User has no workspace");
  const selected = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  return workspaces.find((w) => w.id === selected) ?? workspaces[0];
}
