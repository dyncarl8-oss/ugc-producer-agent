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
                        key: 'Cross-Origin-Resource-Policy',
                        value: 'cross-origin',
                    },
                ],
            },
        ];
    },
};

export default nextConfig;
