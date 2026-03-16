import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MAESTRA Monitor',
  description: 'Live monitoring and control interface for distributed installations built on Jordan Snyder\'s Maestra framework.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="shimmer-bg" />
        {children}
      </body>
    </html>
  );
}
