import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ANTS Drone Hub - HR Dashboard",
  description: "ANTS Drone Hub HR Dashboard — Attendance & Leave Management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
