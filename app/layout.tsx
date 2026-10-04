import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Play Together | Rock Paper Scissors & Tic Tac Toe",
  description: "Share one room with your brother, play rock-paper-scissors or tic-tac-toe, and switch games together from anywhere.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
