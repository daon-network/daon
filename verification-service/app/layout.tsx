import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DAON Content Verification',
  description: 'Verify content registration on the DAON blockchain',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
