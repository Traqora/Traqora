"use client"

import { SearchForm } from "@/components/flight-search/search-form"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plane, Zap, Shield, Globe, Star, TrendingUp, Clock, CheckCircle, History, X } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { HomeNav } from "@/components/home-nav"
import { RecentSearches, saveRecentSearch } from "@/components/flight-search/recent-searches"


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

    </div>
  )
}
