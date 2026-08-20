/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: false,
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: '/monitor.js',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Cache-Control',
            value: 'no-store, max-age=0, must-revalidate',
          },
        ],
      },
    ];
  },
};
