export default function sitemap() {
  return [
    { url: 'https://whisperall.com', lastModified: new Date(), changeFrequency: 'weekly' as const, priority: 1.0 },
    { url: 'https://whisperall.com/pricing', lastModified: new Date(), changeFrequency: 'monthly' as const, priority: 0.8 },
    { url: 'https://whisperall.com/download', lastModified: new Date(), changeFrequency: 'monthly' as const, priority: 0.8 },
    { url: 'https://whisperall.com/privacy', lastModified: new Date(), changeFrequency: 'yearly' as const, priority: 0.3 },
    { url: 'https://whisperall.com/terms', lastModified: new Date(), changeFrequency: 'yearly' as const, priority: 0.3 },
  ];
}
