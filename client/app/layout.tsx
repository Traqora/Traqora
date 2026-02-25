import type React from "react"
import type { Metadata } from "next"
import { Playfair_Display, Source_Sans_3 as Source_Sans_Pro } from "next/font/google"
import "./globals.css"
// NEW: import WalletProvider to initialise StellarWalletsKit on app mount
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
      {/* NEW: WalletProvider initialises the Stellar wallet kit before children render */}
      <body className="font-sans">
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  )
}