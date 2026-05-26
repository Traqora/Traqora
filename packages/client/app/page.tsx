"use client"

import { SearchForm } from "@/components/flight-search/search-form"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Plane, Zap, Shield, Globe } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

export default function HomePage() {
  const router = useRouter()

  const handleSearch = (searchData: any) => {
    const params = new URLSearchParams()
    params.set('from', searchData.from)
    params.set('to', searchData.to)
    params.set('departure', searchData.departure)
    params.set('passengers', searchData.passengers)
    params.set('class', searchData.class)
    if (searchData.return) {
      params.set('return', searchData.return)
    }
    
    router.push(`/search?${params.toString()}`)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <Plane className="h-8 w-8 text-primary" />
              <span className="font-serif font-bold text-2xl text-foreground">Traqora</span>
            </div>
            
            <div className="flex items-center space-x-4">
              <Link href="/search">
                <Button variant="outline">Browse Flights</Button>
              </Link>
              <Link href="/auth">
                <Button>Sign In</Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-6xl font-serif font-bold text-foreground mb-6">
            Decentralized Flight Booking
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
            Book flights directly with airlines using blockchain technology. 
            No intermediaries, transparent pricing, automated refunds.
          </p>
        </div>

        {/* Search Form */}
        <div className="mb-16">
          <SearchForm onSearch={handleSearch} />
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          <Card className="border-0 bg-card/50 backdrop-blur-sm">
            <CardContent className="p-6 text-center">
              <Zap className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Instant Booking</h3>
              <p className="text-muted-foreground">
                Book flights instantly with cryptocurrency payments and smart contract automation.
              </p>
            </CardContent>
          </Card>

          <Card className="border-0 bg-card/50 backdrop-blur-sm">
            <CardContent className="p-6 text-center">
              <Shield className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Automated Refunds</h3>
              <p className="text-muted-foreground">
                Smart contracts automatically process refunds for delays and cancellations.
              </p>
            </CardContent>
          </Card>

          <Card className="border-0 bg-card/50 backdrop-blur-sm">
            <CardContent className="p-6 text-center">
              <Globe className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Global Access</h3>
              <p className="text-muted-foreground">
                Access flights worldwide with transparent pricing and no hidden fees.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Popular Routes */}
        <div className="text-center">
          <h2 className="text-2xl font-serif font-bold mb-8">Popular Routes</h2>
          <div className="flex flex-wrap justify-center gap-4">
            {[
              { from: "JFK", to: "LAX", route: "New York → Los Angeles" },
              { from: "ORD", to: "MIA", route: "Chicago → Miami" },
              { from: "SFO", to: "SEA", route: "San Francisco → Seattle" },
              { from: "DEN", to: "LAS", route: "Denver → Las Vegas" },
            ].map((route) => (
              <Link
                key={`${route.from}-${route.to}`}
                href={`/search?from=${route.from}&to=${route.to}&departure=${new Date(Date.now() + 86400000).toISOString().split('T')[0]}&passengers=1&class=economy`}
              >
                <Button variant="outline" className="hover:bg-primary hover:text-primary-foreground">
                  {route.route}
                </Button>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}