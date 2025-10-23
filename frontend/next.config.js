/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const isMockMode = (process.env.NEXT_PUBLIC_MOCK_MODE ?? '0').toString() === '1';

    if (isMockMode) {
      return [];
    }

    return [{ source: '/api/:path*', destination: 'http://backend:8000/:path*' }];
  }
};

module.exports = nextConfig;
