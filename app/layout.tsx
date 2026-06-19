import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Search People",
    template: "%s | Search People",
  },
  description:
    "AI-based people search for public and licensed-record lookup with privacy controls.",
  robots: {
    index: true,
    follow: true,
  },
};

const footerLinks = [
  ["Privacy", "/privacy"],
  ["Terms", "/terms"],
  ["Opt Out", "/opt-out"],
  ["Do Not Sell or Share", "/do-not-sell"],
  ["FCRA", "/fcra"],
  ["Contact", "/contact"],
] as const;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div className="site-shell">
          <header className="site-header">
            <div className="header-inner">
              <Link href="/" className="brand" aria-label="Search People home">
                <span className="brand-mark">
                  <Search size={18} aria-hidden="true" />
                </span>
                <span>Search People</span>
              </Link>
              <nav className="nav" aria-label="Primary navigation">
                <Link href="/opt-out">Opt Out</Link>
                <Link href="/fcra">FCRA</Link>
                <Link href="/contact">Contact</Link>
              </nav>
            </div>
          </header>
          <main className="main">{children}</main>
          <footer className="site-footer">
            <div className="footer-inner">
              <span>AI-based public lookup. Not a consumer reporting agency.</span>
              <nav className="footer-links" aria-label="Footer navigation">
                {footerLinks.map(([label, href]) => (
                  <Link key={href} href={href}>
                    {label}
                  </Link>
                ))}
              </nav>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
