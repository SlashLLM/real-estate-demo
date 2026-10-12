import type { ReactNode } from "react";
import { SocialNav } from "@totalweb/social/pages";

export default function SocialLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SocialNav basePath="/admin/social" />
      {children}
    </>
  );
}
