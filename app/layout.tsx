import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ANTS Drone Hub - HR Dashboard",
  description: "Team attendance and leave management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
