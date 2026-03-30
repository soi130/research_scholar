import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scholar.AI",
  description: "AI-powered research paper management and chat",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen font-sans bg-[var(--background)] text-[var(--foreground)]">{children}</body>
    </html>
  );
}
