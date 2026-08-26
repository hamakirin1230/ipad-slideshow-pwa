import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";
import { AppProviders } from "./app-providers";
import { ServiceWorkerRegistration } from "./service-worker-registration";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "スライドショー",
  description: "iPadで安定して再生するためのスライドショーPWAです。",
  applicationName: "スライドショー",
  manifest: "/manifest.json",
  icons: {
    icon: [
      {
        url: "/icons/icon-192.png",
        type: "image/png",
        sizes: "192x192",
      },
      {
        url: "/icons/icon-512.png",
        type: "image/png",
        sizes: "512x512",
      },
    ],
    apple: {
      url: "/icons/icon-180.png",
      type: "image/png",
      sizes: "180x180",
    },
  },
  appleWebApp: {
    capable: true,
    title: "スライドショー",
    statusBarStyle: "black-translucent",
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#020617",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ServiceWorkerRegistration />
        <AppProviders>
          <AppShell>{children}</AppShell>
        </AppProviders>
      </body>
    </html>
  );
}
