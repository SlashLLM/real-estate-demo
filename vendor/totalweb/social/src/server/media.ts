import { createAdminClient } from "@totalweb/supabase/admin";

/** Uploads a file to the workspace's media bucket and records it in social_media_assets. */
export async function storeMedia(
  workspaceId: string,
  file: Blob & { name?: string },
  kind: "image" | "video",
  source: "upload" | "ai_generated" | "url",
  extra: Record<string, unknown> = {},
) {
  const db = createAdminClient();
  const ext = (file.name?.split(".").pop() ?? file.type.split("/")[1] ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${workspaceId}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await db.storage.from("media").upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) throw new Error(upErr.message);
  const { data, error } = await db
    .from("social_media_assets")
    .insert({ workspace_id: workspaceId, storage_path: path, kind, mime: file.type, size_bytes: file.size, source, ...extra })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}
