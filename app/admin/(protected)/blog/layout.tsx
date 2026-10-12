import type { ReactNode } from "react";
import { BlogNav } from "@totalweb/blog/pages";

export default function BlogLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <BlogNav basePath="/admin/blog" />
      {children}
    </>
  );
}
