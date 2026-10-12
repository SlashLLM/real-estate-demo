import type { ReactNode } from "react";
import { CrmNav } from "@totalweb/crm/pages";

export default function CrmLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <CrmNav basePath="/admin/crm" />
      {children}
    </>
  );
}
