import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GA4Fix — Real-user tag and event monitoring',
  description:
    'Catch broken analytics tags before your CEO does. Real-user monitoring for GA4, Google Ads, Meta, TikTok and 15+ vendors.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
