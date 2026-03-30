import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scholar.AI - Research Paper Library",
  description: "AI-powered research paper management and chat",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}
