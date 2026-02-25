import type React from "react"
import type { Metadata } from "next"
import { Playfair_Display, Source_Sans_3 as Source_Sans_Pro } from "next/font/google"
import "./globals.css"
import { SocketProvider } from '@/components/socket/SocketProvider'
import { Toaster } from '@/components/ui/toaster'
import { ConnectionIndicator } from '@/components/connection-indicator'
// NEW: WalletProvider to initialise StellarWalletsKit on app mount
import { WalletProvider } from "@/components/wallet-provider"

const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-playfair",
  weight: ["400", "700", "900"],
})

const sourceSansPro = Source_Sans_Pro({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-source-sans",
  weight: ["400", "600", "700"],
})

export const metadata: Metadata = {
  title: "Traqora - Decentralized Flight Booking",
  description:
    "Book flights directly with airlines using blockchain technology. No intermediaries, transparent pricing, automated refunds.",
  generator: "v0.app",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${playfairDisplay.variable} ${sourceSansPro.variable} antialiased`}>
      <body className="font-sans">
        {/* Nesting providers ensures both Wallet and Socket functionality are available app-wide */}
        <WalletProvider>
          <SocketProvider>
            <ConnectionIndicator />
            <Toaster />
            {children}
          </SocketProvider>
        </WalletProvider>
      </body>
    </html>
  )
}