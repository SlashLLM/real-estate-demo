import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import { site } from "@/site.config";
import "./globals.css";

// SmartHomes' typeface: Plus Jakarta Sans for everything, 800 for headlines, uppercase bold for labels.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  style: ["normal", "italic"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: { default: `${site.name}: free instant home valuation in Singapore`, template: `%s · ${site.name}` },
  description:
    "Free instant valuation for your HDB flat, condo or landed home in Singapore, built from recent transactions. Unlock the full report and get personal advice from your agent.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // Light only: data-theme="light" keeps the TotalWeb dark tokens from switching on in dark-mode browsers.
    <html lang={site.locale ?? "en"} data-theme="light" className={jakarta.variable}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
