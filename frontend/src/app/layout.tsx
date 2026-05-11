import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({
  variable: '--font-sans',
  subsets: ['latin', 'cyrillic'],
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin', 'cyrillic'],
});

export const metadata: Metadata = {
  title: 'PFOS — Personal Financial Operating System',
  description:
    'AI-augmented керування персональними фінансами: бюджети, цілі, прогноз cashflow, проактивні рекомендації.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="uk"
      className={`${inter.variable} ${jetbrainsMono.variable} dark h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
