import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource-variable/jetbrains-mono';
import 'material-symbols/outlined.css';
import './globals.css';
import { AppToaster } from '@/components/ui/app-toaster';
import { ServiceWorkerRegister } from '@/components/pwa/service-worker-register';

export const metadata: Metadata = {
  title: {
    default: 'Cue & Tap — POS Billiard + Cafe',
    template: '%s · Cue & Tap',
  },
  description:
    'Sistem kasir, billing sesi billiard, self-order QR, kitchen display, dan laporan shift untuk billiard hall + cafe.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Cue & Tap POS',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Cue & Tap',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#0b1326',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className="dark">
      <body className="min-h-dvh bg-background font-sans text-on-surface antialiased">
        <div
          aria-hidden
          className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent"
        />
        {children}
        <AppToaster />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
