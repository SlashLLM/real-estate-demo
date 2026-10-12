import type { ReactNode } from "react";
import Link from "next/link";
import { getUser } from "@totalweb/supabase/server";
import { requireWorkspace } from "@totalweb/supabase/workspace";
import { site } from "@/site.config";
import { signOut } from "./actions";
import { AdminNav } from "./AdminNav";

/** Owner area: social media manager (+ AI content engine) and CRM, styled by the site's tokens. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const [user, workspace] = await Promise.all([getUser(), requireWorkspace()]);
  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <Link href="/" className="font-semibold">
            {site.name}
          </Link>
          <span className="text-sm text-muted">{workspace.name}</span>
          <AdminNav />
          <div className="flex-1" />
          <span className="hidden text-xs text-muted sm:inline">{user?.email}</span>
          <form action={signOut}>
            <button className="text-xs text-muted hover:text-fg">Sign out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
