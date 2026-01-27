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
            <body>{children}</body>
        </html>
    );
}
