import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'VlogStudio - Handheld Engine',
    description: 'Generate authentic social ads shot-by-shot with AI',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <head>
                <meta httpEquiv="Content-Security-Policy" content="frame-src 'self' https://whop.com https://*.whop.com; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://whop.com https://*.whop.com;" />
            </head>
            <body>{children}</body>
        </html>
    );
}
