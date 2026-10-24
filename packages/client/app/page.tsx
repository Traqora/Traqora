"use client"

import { SearchForm } from "@/components/flight-search/search-form"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Plane, Zap, Shield, Globe } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { HomeNav } from "@/components/home-nav"
import { RecentSearches, saveRecentSearch } from "@/components/flight-search/recent-searches"

export default function HomePage() {
  const router = useRouter()

  const handleSearch = (searchData: any) => {
    // Save to recent searches
    saveRecentSearch(searchData)

    const params = new URLSearchParams()
    params.set('tripType', searchData.tripType)
    params.set('from', searchData.from)
    params.set('to', searchData.to)
    params.set('departure', searchData.departure)
    params.set('passengers', searchData.passengers)
    params.set('class', searchData.class)
    if (searchData.tripType === 'roundtrip' && searchData.return) {
      params.set('return', searchData.return)
    }

    router.push(`/search?${params.toString()}`)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <HomeNav />

      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-16">
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
        <div className="mb-8">
          <SearchForm onSearch={handleSearch} />
        </div>

        {/* Recent Searches */}
        <div className="mb-16">
          <RecentSearches onSelect={handleSearch} />
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
        <div className="text-center mb-16">
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

        {/* How It Works Section */}
        <div id="how-it-works" className="py-16">
          <h2 className="text-3xl font-serif font-bold text-center mb-12">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              {
                step: "1",
                title: "Search Flights",
                description: "Enter your travel details and find available flights from our extensive network of airlines."
              },
              {
                step: "2",
                title: "Connect Wallet",
                description: "Connect your Stellar wallet to enable secure, blockchain-based transactions."
              },
              {
                step: "3",
                title: "Book & Pay",
                description: "Complete your booking with cryptocurrency payment through smart contracts."
              },
              {
                step: "4",
                title: "Fly & Earn",
                description: "Enjoy your flight and earn loyalty rewards on the blockchain."
              }
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl font-bold text-primary">{item.step}</span>
                </div>
                <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
                <p className="text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}