import type { Metadata, Viewport } from "next";

import "./globals.css";

const description = "Oura scores, trends, and daily health signals.";

export const metadata: Metadata = {
  title: "Oura Dashboard",
  description,
  applicationName: "Oura Dashboard",
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "Oura Dashboard",
    description,
    images: [{ url: "/oura-dashboard-social.png", width: 1734, height: 907 }],
  },
  icons: {
    icon: [
      {
        url: "/favicon-light.png",
        type: "image/png",
        sizes: "32x32",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/favicon-dark.png",
        type: "image/png",
        sizes: "32x32",
        media: "(prefers-color-scheme: dark)",
      },
    ],
    shortcut: "/favicon.ico",
    apple: {
      url: "/apple-touch-icon.png",
      type: "image/png",
      sizes: "180x180",
    },
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf8" },
    { media: "(prefers-color-scheme: dark)", color: "#11110f" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
