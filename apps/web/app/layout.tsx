import type { Metadata } from "next";

import { SiteHeader } from "../components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Civic Registry & Transparency Engine",
    template: "%s | Civic Registry",
  },
  description:
    "Reusable civic infrastructure for searchable public registries and transparency workflows.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <SiteHeader />
        {process.env.CIVIC_REGISTRY_DEMO === "true" ? (
          <aside className="demo-notice" aria-label="Demonstration data">
            Demonstration registry · The bundled catalog contains fictional
            example records, not an official government registry.
          </aside>
        ) : null}
        {children}
        <footer className="site-footer">
          <div>
            <strong>Civic Registry &amp; Transparency Engine</strong>
            <span>
              Configurable open infrastructure for public records.
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
