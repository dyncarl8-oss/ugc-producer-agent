/** @type {import('next').NextConfig} */
const nextConfig = {
    env: {
        API_KEY: process.env.GEMINI_API_KEY,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    },
    async headers() {
        return [
            {
                source: '/(.*)',
                headers: [
                    {
                        key: 'Cross-Origin-Embedder-Policy',
                        value: 'credentialless',
                    },
                    {
                        key: 'Cross-Origin-Opener-Policy',
                        value: 'same-origin-allow-popups',
                    },
                    {
                        key: 'Cross-Origin-Resource-Policy',
                        value: 'cross-origin',
                    },
                ],
            },
        ];
    },
};

export default nextConfig;
