import type { Metadata } from "next";

import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jearch — Direct-Contact Job Finder",
  description:
    "Search live job postings by title and country, and get the recruiter or hiring manager behind each one: name, LinkedIn, work email and phone.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="app-gradient min-h-dvh font-sans antialiased">
        <SiteHeader />
        <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">{children}</main>
        <footer className="mx-auto w-full max-w-7xl px-4 pb-10 text-xs text-muted-foreground sm:px-6">
          Postings come from public job databases. Names and profiles come from a web search — email
          addresses marked as a pattern were constructed, not confirmed, so check before you send. Follow
          the rules on unsolicited outreach that apply in your market.
        </footer>
      </body>
    </html>
  );
}
