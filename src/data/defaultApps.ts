import { WebAppItem } from '../types';

export const DEFAULT_APPS: WebAppItem[] = [
  {
    id: 'facebook',
    name: 'Facebook',
    url: 'https://facebook.com',
    iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/0/05/Facebook_Logo_%282019%29.png',
    category: 'Social',
    description: 'Connect with friends, family, and communities around the world.',
    openMode: 'external',
    isDefault: true,
    accentColor: '#1877F2',
    createdAt: 1700000000000,
    knownBlockedIframe: true
  },
  {
    id: 'instagram',
    name: 'Instagram',
    url: 'https://instagram.com',
    iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/e/e7/Instagram_logo_2016.svg',
    category: 'Social',
    description: 'Share photos, reels, and stories with your network.',
    openMode: 'external',
    isDefault: true,
    accentColor: '#E4405F',
    createdAt: 1700000001000,
    knownBlockedIframe: true
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    url: 'https://linkedin.com',
    iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/8/81/LinkedIn_icon.svg',
    category: 'Social',
    description: 'Professional social network, jobs, business news, and careers.',
    openMode: 'external',
    isDefault: true,
    accentColor: '#0A66C2',
    createdAt: 1700000002000,
    knownBlockedIframe: true
  },
  {
    id: 'wikipedia',
    name: 'Wikipedia',
    url: 'https://en.m.wikipedia.org',
    iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/6/63/Wikipedia-logo.png',
    category: 'Utilities',
    description: 'The free encyclopedia with millions of articles in every language.',
    openMode: 'iframe',
    isDefault: true,
    accentColor: '#636466',
    createdAt: 1700000003000,
    knownBlockedIframe: false
  },
  {
    id: 'excalidraw',
    name: 'Excalidraw',
    url: 'https://excalidraw.com',
    iconUrl: 'https://excalidraw.com/favicon-32x32.png',
    category: 'Productivity',
    description: 'Virtual collaborative whiteboard tool with hand-drawn aesthetic.',
    openMode: 'iframe',
    isDefault: true,
    accentColor: '#6965DB',
    createdAt: 1700000004000,
    knownBlockedIframe: false
  },
  {
    id: 'hackernews',
    name: 'Hacker News',
    url: 'https://news.ycombinator.com',
    iconUrl: 'https://news.ycombinator.com/y18.svg',
    category: 'News',
    description: 'Tech, startup news, and insightful developer discussions.',
    openMode: 'iframe',
    isDefault: true,
    accentColor: '#FF6600',
    createdAt: 1700000005000,
    knownBlockedIframe: false
  },
  {
    id: 'github',
    name: 'GitHub',
    url: 'https://github.com',
    iconUrl: 'https://github.githubassets.com/favicons/favicon.svg',
    category: 'Productivity',
    description: 'Software development, repositories, and developer collaboration.',
    openMode: 'external',
    isDefault: true,
    accentColor: '#24292F',
    createdAt: 1700000006000,
    knownBlockedIframe: true
  },
  {
    id: '2048',
    name: '2048 Game',
    url: 'https://play2048.co',
    iconUrl: 'https://play2048.co/favicon.ico',
    category: 'Games',
    description: 'Classic puzzle game - join the numbers to reach the 2048 tile!',
    openMode: 'iframe',
    isDefault: true,
    accentColor: '#EDC22E',
    createdAt: 1700000007000,
    knownBlockedIframe: false
  }
];
