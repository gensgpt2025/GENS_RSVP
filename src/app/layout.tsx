import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GENS Schedule",
  description: "Private schedule and RSVP management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
