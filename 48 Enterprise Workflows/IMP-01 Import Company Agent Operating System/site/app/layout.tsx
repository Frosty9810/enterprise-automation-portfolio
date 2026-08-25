import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://port-os-import-agent-network.gabrielacoata.chatgpt.site'),
  title: 'PORT / OS — Import Company Agent Network',
  description: 'A functional reference implementation of a seven-department, 137-agent operating system for an import company.',
  openGraph: {
    title: 'PORT / OS — Import Company Agent Network',
    description: '137 agents. 7 departments. One company brain. A functional reference implementation for import operations.',
    url: '/',
    type: 'website',
    images: [{ url: '/og.png', width: 1728, height: 912, alt: 'PORT / OS — 137 agents, 7 departments, one company brain' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PORT / OS — Import Company Agent Network',
    description: '137 agents. 7 departments. One company brain.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
