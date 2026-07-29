import type React from "react";
import type { Metadata } from "next";
import {
  Playfair_Display,
  Source_Sans_3 as Source_Sans_Pro,
} from "next/font/google";
import "./globals.css";
import { SocketProvider } from "@/components/socket/SocketProvider";
import { Toaster } from "@/components/ui/toaster";
import { ConnectionIndicator } from "@/components/connection-indicator";
import { WalletProvider } from "@/components/wallet-provider";
import { OfflineProvider } from "@/components/offline-provider";
import { OfflineIndicator } from "@/components/offline-indicator";
import { SkipNav } from "@/components/skip-nav";

const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-playfair",
  weight: ["400", "700", "900"],
});

const sourceSansPro = Source_Sans_Pro({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-source-sans",
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: "Traqora - Decentralized Flight Booking",
  description:
    "Book flights directly with airlines using blockchain technology. No intermediaries, transparent pricing, automated refunds.",
  generator: "v0.app",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Traqora",
  },
};

export const viewport = {
  themeColor: "#0f172a",
};

function A11yAnnouncer() {
  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only" id="a11y-polite-announce" />
  )
}

function A11yAssertiveAnnouncer() {
  return (
    <div aria-live="assertive" aria-atomic="true" className="sr-only" id="a11y-assertive-announce" />
  )
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${playfairDisplay.variable} ${sourceSansPro.variable} antialiased`}
    >
      <body className="font-sans">
        <SkipNav />
        <A11yAnnouncer />
        <A11yAssertiveAnnouncer />
        {/* Nesting providers ensures both Wallet and Socket functionality are available app-wide */}
        <OfflineProvider>
          <WalletProvider>
            <SocketProvider>
              <ConnectionIndicator />
              <OfflineIndicator />
              <Toaster />
              <main id="main-content" tabIndex={-1} className="outline-none">
                {children}
              </main>
            </SocketProvider>
          </WalletProvider>
        </OfflineProvider>
      </body>
    </html>
  );
}
