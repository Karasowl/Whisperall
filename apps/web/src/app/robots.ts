export default function robots() {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: '/dashboard' }],
    sitemap: 'https://whisperall.com/sitemap.xml',
  };
}
