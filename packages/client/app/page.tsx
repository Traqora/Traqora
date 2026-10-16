"use client"

import { SearchForm } from "@/components/flight-search/search-form"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plane, Zap, Shield, Globe, Star, TrendingUp, Clock, CheckCircle, History, X } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useEffect } from "react"

interface RecentSearch {
  from: string
  to: string
  departure: string
  passengers: string
  class: string
  timestamp: number
}

export default function HomePage() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([])

  useEffect(() => {
    setMounted(true)
    // Load recent searches from localStorage
    const saved = localStorage.getItem('recentSearches')
    if (saved) {
      try {
        const searches = JSON.parse(saved)
        setRecentSearches(searches.slice(0, 5)) // Keep only last 5
      } catch (e) {
        console.error('Failed to parse recent searches', e)
      }
    }
  }, [])

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

    // Save to recent searches
    const newSearch: RecentSearch = {
      from: searchData.from,
      to: searchData.to,
      departure: searchData.departure,
      passengers: searchData.passengers,
      class: searchData.class,
      timestamp: Date.now(),
    }

    const updatedSearches = [newSearch, ...recentSearches.filter(s =>
      s.from !== searchData.from || s.to !== searchData.to
    )].slice(0, 5)

    localStorage.setItem('recentSearches', JSON.stringify(updatedSearches))
    setRecentSearches(updatedSearches)

    router.push(`/search?${params.toString()}`)
  }

  const handleRecentSearch = (search: RecentSearch) => {
    const params = new URLSearchParams()
    params.set('from', search.from)
    params.set('to', search.to)
    params.set('departure', search.departure)
    params.set('passengers', search.passengers)
    params.set('class', search.class)
    router.push(`/search?${params.toString()}`)
  }

  const clearRecentSearches = () => {
    localStorage.removeItem('recentSearches')
    setRecentSearches([])
  }

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

  const stats = [
    { value: "50K+", label: "Daily Bookings", icon: TrendingUp },
    { value: "4.9★", label: "User Rating", icon: Star },
    { value: "24/7", label: "Support", icon: Clock },
  ]

  const features = [
    {
      icon: Zap,
      title: "Instant Booking",
      description: "Book flights instantly with cryptocurrency payments and smart contract automation.",
      badge: "Fast"
    },
    {
      icon: Shield,
      title: "Automated Refunds",
      description: "Smart contracts automatically process refunds for delays and cancellations.",
      badge: "Secure"
    },
    {
      icon: Globe,
      title: "Global Access",
      description: "Access flights worldwide with transparent pricing and no hidden fees.",
      badge: "Worldwide"
    },
    {
      icon: CheckCircle,
      title: "Price Match",
      description: "We guarantee the best prices with our price match guarantee.",
      badge: "Best Price"
    },
  ]

  const popularRoutes = [
    { from: "JFK", to: "LAX", route: "New York → Los Angeles", price: "$299", duration: "5h 30m" },
    { from: "ORD", to: "MIA", route: "Chicago → Miami", price: "$249", duration: "3h 15m" },
    { from: "SFO", to: "SEA", route: "San Francisco → Seattle", price: "$189", duration: "2h 45m" },
    { from: "DEN", to: "LAS", route: "Denver → Las Vegas", price: "$159", duration: "1h 50m" },
    { from: "BOS", to: "DCA", route: "Boston → Washington DC", price: "$179", duration: "1h 40m" },
    { from: "ATL", to: "MCO", route: "Atlanta → Orlando", price: "$139", duration: "1h 30m" },
  ]

  if (!mounted) {
    return null
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 sticky top-0 z-50">
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
        <div className="text-center mb-12 animate-in fade-in slide-in-from-bottom-4 duration-1000">
          <Badge variant="secondary" className="mb-4">
            ✨ New: Automated Refunds with Smart Contracts
          </Badge>
          <h1 className="text-4xl md:text-6xl font-serif font-bold text-foreground mb-6">
            Decentralized Flight Booking
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
            Book flights directly with airlines using blockchain technology.
            No intermediaries, transparent pricing, automated refunds.
          </p>

          {/* Stats */}
          <div className="flex flex-wrap justify-center gap-8 mb-8">
            {stats.map((stat) => (
              <div key={stat.label} className="flex items-center gap-2">
                <stat.icon className="h-5 w-5 text-primary" />
                <div className="text-left">
                  <div className="font-bold text-lg">{stat.value}</div>
                  <div className="text-sm text-muted-foreground">{stat.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Search Form */}
        <div className="mb-16 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-200">
          <SearchForm onSearch={handleSearch} />
        </div>

        {/* Recent Searches */}
        {recentSearches.length > 0 && (
          <div className="mb-16 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-300">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-serif font-bold">Recent Searches</h2>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearRecentSearches}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recentSearches.map((search, index) => (
                <Card
                  key={`${search.from}-${search.to}-${index}`}
                  className="border-0 bg-card/50 backdrop-blur-sm hover:shadow-lg hover:bg-card/80 transition-all duration-200 cursor-pointer"
                  onClick={() => handleRecentSearch(search)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold">
                        {search.from} → {search.to}
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {search.passengers} passenger{parseInt(search.passengers) > 1 ? 's' : ''}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <div>{new Date(search.departure).toLocaleDateString()}</div>
                      <div className="capitalize">{search.class.replace('_', ' ')}</div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {features.map((feature, index) => (
            <Card
              key={feature.title}
              className="border-0 bg-card/50 backdrop-blur-sm hover:shadow-lg transition-shadow duration-200 animate-in fade-in slide-in-from-bottom-4"
              style={{ animationDelay: `${(index + 3) * 100}ms` }}
            >
              <CardContent className="p-6 text-center">
                <div className="relative inline-block mb-4">
                  <feature.icon className="h-12 w-12 text-primary mx-auto" />
                  <Badge variant="secondary" className="absolute -top-2 -right-2 text-xs">
                    {feature.badge}
                  </Badge>
                </div>
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-sm">
                  {feature.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Popular Routes */}
        <div className="mb-16">
          <h2 className="text-2xl font-serif font-bold mb-2 text-center">Popular Routes</h2>
          <p className="text-muted-foreground text-center mb-8">Book our most searched flights at the best prices</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {popularRoutes.map((route) => (
              <Link
                key={`${route.from}-${route.to}`}
                href={`/search?from=${route.from}&to=${route.to}&departure=${new Date(Date.now() + 86400000).toISOString().split('T')[0]}&passengers=1&class=economy`}
              >
                <Card className="border-0 bg-card/50 backdrop-blur-sm hover:shadow-lg hover:bg-card/80 transition-all duration-200 cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold">{route.route}</div>
                      <Badge variant="outline">{route.duration}</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">One-way</div>
                      <div className="font-bold text-primary">{route.price}</div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        {/* CTA Section */}
        <Card className="border-0 bg-gradient-to-r from-primary/10 to-primary/5 backdrop-blur-sm">
          <CardContent className="p-12 text-center">
            <h2 className="text-3xl font-serif font-bold mb-4">Ready to Book Your Next Flight?</h2>
            <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
              Join thousands of travelers who trust Traqora for secure, transparent, and affordable flight bookings.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/search">
                <Button size="lg" className="w-full sm:w-auto">
                  <Plane className="h-4 w-4 mr-2" />
                  Search Flights
                </Button>
              </Link>
              <Link href="/auth">
                <Button size="lg" variant="outline" className="w-full sm:w-auto">
                  Create Account
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <footer className="border-t border-border mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center space-x-2">
              <Plane className="h-6 w-6 text-primary" />
              <span className="font-serif font-bold text-xl text-foreground">Traqora</span>
            </div>
            <div className="text-sm text-muted-foreground">
              © 2024 Traqora. Built with blockchain technology.
            </div>
            <div className="flex gap-4">
              <Link href="/terms" className="text-sm text-muted-foreground hover:text-foreground">
                Terms
              </Link>
              <Link href="/privacy" className="text-sm text-muted-foreground hover:text-foreground">
                Privacy
              </Link>
              <Link href="/support" className="text-sm text-muted-foreground hover:text-foreground">
                Support
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}