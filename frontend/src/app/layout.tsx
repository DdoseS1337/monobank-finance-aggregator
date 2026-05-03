import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { TokenProvider } from "@/providers/token-provider";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin", "cyrillic"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: "ФінДашборд — Аналіз витрат Monobank",
  description: "Аналітичний дашборд для відстеження витрат та доходів з Monobank",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="uk"
      className={`${inter.variable} ${jetbrainsMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <TokenProvider>{children}</TokenProvider>
      </body>
    </html>
  );
}
