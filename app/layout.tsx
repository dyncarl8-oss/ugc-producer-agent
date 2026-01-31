import type { Metadata } from 'next';
import './globals.css';
import { WhopApp } from '@whop/react/components';

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
        <html lang="en" suppressHydrationWarning>
            <head>
                <meta httpEquiv="Content-Security-Policy" content="frame-src 'self' https://whop.com https://*.whop.com; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://whop.com https://*.whop.com;" />
            </head>
            <body>
                <WhopApp appearance="inherit">
                    {children}
                </WhopApp>
            </body>
        </html>
    );
}
