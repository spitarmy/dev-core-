import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZENNOBATE DEV CORE",
  description: "Personal AI Development Hub",
  manifest: "/manifest.json",
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>
        {children}
      </body>
    </html>
  );
}
