import type { Metadata } from 'next';
import { Inter, Poppins, Roboto_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-inter' });
const poppins = Poppins({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-poppins' });
const robotoMono = Roboto_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-roboto-mono' });

export const metadata: Metadata = {
  title: 'GAfix — Real-user tag and event monitoring',
  description:
    'Catch broken analytics tags before your CEO does. Real-user monitoring for GA4, Google Ads, Meta, TikTok and 15+ vendors.',
  icons: {
    icon: '/gafix-logo.png',
    shortcut: '/gafix-logo.png',
    apple: '/gafix-logo.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${poppins.variable} ${robotoMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
