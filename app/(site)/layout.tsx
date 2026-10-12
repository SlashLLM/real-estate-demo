import type { ReactNode } from "react";
import { ChatWidget } from "@totalweb/ui";
import { site } from "@/site.config";
import { Cta } from "@/components/site/Cta";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-fg">
        Skip to content
      </a>
      <Header primary={<Cta id="header-primary" size="sm" />} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer />
      {/* "Chat now" button wired to the client's Dograh chat workflow; hidden when the env var is empty. */}
      <ChatWidget widgetUrl={process.env.NEXT_PUBLIC_DOGRAH_WIDGET_URL} title={site.name} />
    </div>
  );
}
