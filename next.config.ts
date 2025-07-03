
import type {NextConfig} from 'next';
import { config } from 'dotenv';

// Explicitly load variables from .env.local to ensure they are available during SSR
config({ path: '.env.local' });

const nextConfig: NextConfig = {
  experimental: {
    allowedDevOrigins: [
      'https://9000-firebase-studio-1748899850016.cluster-pb4ljhlmg5hqsxnzpc56r3prxw.cloudworkstations.dev',
    ],
  },
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups', 
          },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        port: '',
        pathname: '/**',
      },
      
    ],
  },
};

export default nextConfig;
