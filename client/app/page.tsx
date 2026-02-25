import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Plane,
  Shield,
  Zap,
  Users,
  ArrowRight,
  CheckCircle,
  Globe,
  Star,
  TrendingUp,
  Sparkles,
  Coins,
  Search,
  Wallet,
  CreditCard,
  FileText,
  MapPin,
} from "lucide-react"
// NEW: import the client HomeNav component with real wallet connect
import { HomeNav } from "@/components/home-nav"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* NEW: replaced static nav with client HomeNav that has real wallet connect */}
      <HomeNav />

      {/* Hero Section */}
      <section className="relative overflow-hidden gradient-warm">
        {/* Minimalist floating elements */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-20 left-10 w-2 h-2 bg-primary/30 rounded-full animate-float-gentle"></div>
          <div className="absolute top-40 right-20 w-3 h-3 bg-accent/20 rounded-full animate-float-gentle delay-200"></div>
          <div className="absolute bottom-40 left-1/4 w-1 h-1 bg-secondary/40 rounded-full animate-float-gentle delay-500"></div>
          <div className="absolute bottom-60 right-1/3 w-2 h-2 bg-primary/20 rounded-full animate-float-gentle delay-300"></div>
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-24">
          <div className="grid lg:grid-cols-12 gap-16 items-center">
            <div className="lg:col-span-7 space-y-12">
              <Badge
                variant="secondary"
                className="inline-flex items-center px-6 py-3 text-sm font-medium animate-fade-in-slow bg-card glass-card border-primary/20"
              >
                <Sparkles className="h-4 w-4 mr-2 text-primary" />
                Powered by Stellar Blockchain
              </Badge>

              <div className="space-y-6">
                <h1 className="font-serif font-black text-4xl sm:text-5xl md:text-6xl lg:text-7xl leading-[0.85] animate-slide-up">
                  <span className="block text-foreground">Book</span>
                  <span className="block text-gradient-warm">Direct.</span>
                  <span className="block text-secondary delay-200 animate-slide-up">Fly Free.</span>
                </h1>

                <p className="text-xl sm:text-2xl text-muted-foreground leading-relaxed max-w-2xl animate-fade-in-slow delay-300">
                  Skip the middlemen. Connect directly with airlines using blockchain technology.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-6 animate-scale-bounce delay-500">
                <Button
                  size="lg"
                  className="px-12 py-6 text-xl font-bold bg-primary hover:bg-primary/90 shadow-xl hover-lift-3d rounded-2xl"
                  asChild
                >
                  <a href="/search">
                    Start Booking
                    <ArrowRight className="ml-3 h-6 w-6" />
                  </a>
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="px-12 py-6 text-xl border-2 border-secondary hover:bg-secondary hover:text-secondary-foreground rounded-2xl hover-lift-3d bg-transparent"
                >
                  Learn More
                </Button>
              </div>

              <div className="grid grid-cols-3 gap-8 pt-12 animate-fade-in-slow delay-500">
                <div className="text-center">
                  <div className="text-3xl font-black text-primary">15K+</div>
                  <div className="text-sm text-muted-foreground font-medium">Flights Booked</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-black text-secondary">$3.2M</div>
                  <div className="text-sm text-muted-foreground font-medium">Fees Saved</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-black text-accent">200+</div>
                  <div className="text-sm text-muted-foreground font-medium">Airlines</div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 relative h-[400px] animate-fade-in-slow delay-300">
              <div className="relative h-full flex items-center justify-center">
                {/* Central illustration */}
                <div className="relative illustration-float">
                  <div className="w-80 h-80 rounded-full bg-gradient-to-br from-primary/10 via-card to-accent/10 glass-card flex items-center justify-center">
                    <div className="w-56 h-56 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-2xl animate-glow-pulse">
                      <Plane className="h-20 w-20 text-primary-foreground transform rotate-12" />
                    </div>
                  </div>
                </div>

                {/* Floating feature icons */}
                <div className="absolute top-12 -left-6 animate-float-gentle">
                  <div className="w-16 h-16 rounded-2xl glass-card bg-card/80 flex items-center justify-center shadow-lg">
                    <Shield className="h-8 w-8 text-primary" />
                  </div>
                </div>

                <div className="absolute -top-6 right-12 animate-float-gentle delay-200">
                  <div className="w-16 h-16 rounded-2xl glass-card bg-card/80 flex items-center justify-center shadow-lg">
                    <Zap className="h-8 w-8 text-secondary" />
                  </div>
                </div>

                <div className="absolute bottom-12 -right-6 animate-float-gentle delay-300">
                  <div className="w-16 h-16 rounded-2xl glass-card bg-card/80 flex items-center justify-center shadow-lg">
                    <Globe className="h-8 w-8 text-accent" />
                  </div>
                </div>

                <div className="absolute -bottom-6 left-12 animate-float-gentle delay-500">
                  <div className="w-16 h-16 rounded-2xl glass-card bg-card/80 flex items-center justify-center shadow-lg">
                    <Coins className="h-8 w-8 text-primary" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}

      {/* Popular Destinations Section */}
      <section id="destinations" className="py-24 sm:py-32 bg-gradient-to-br from-muted/30 via-background to-muted/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-20 space-y-6">
            <Badge
              variant="secondary"
              className="inline-flex items-center px-6 py-3 text-sm font-medium bg-card glass-card border-primary/20"
            >
              <MapPin className="h-4 w-4 mr-2 text-primary" />
              Explore the World
            </Badge>
            <h2 className="font-serif font-black text-4xl sm:text-5xl md:text-6xl text-foreground">
              Popular <span className="text-gradient-warm">Destinations</span>
            </h2>
            <p className="text-xl sm:text-2xl text-muted-foreground max-w-4xl mx-auto leading-relaxed">
              Discover amazing cities around the world and book your next adventure with zero platform fees
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
            {/* New York */}
            <Card className="group overflow-hidden border-0 shadow-xl hover:shadow-2xl transition-all duration-500 hover-lift-3d glass-card">
              <div className="relative h-64 overflow-hidden">
                <img
                  src="/new-york-city-skyline-with-empire-state-building-a.png"
                  alt="New York City skyline"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
                <div className="absolute bottom-4 left-4 text-white">
                  <h3 className="font-serif font-bold text-2xl mb-1">New York</h3>
                  <p className="text-sm opacity-90">The City That Never Sleeps</p>
                </div>
                <div className="absolute top-4 right-4">
                  <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
                    From $299
                  </Badge>
                </div>
              </div>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">JFK, LGA, EWR</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Plane className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">25+ airlines</span>
                  </div>
                </div>
                <p className="text-muted-foreground mb-4">
                  Experience the energy of Manhattan, world-class museums, Broadway shows, and iconic landmarks.
                </p>
                <Button className="w-full hover-lift-3d" asChild>
                  <a href="/search?destination=NYC">
                    Search Flights
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              </CardContent>
            </Card>

            {/* London */}
            <Card className="group overflow-hidden border-0 shadow-xl hover:shadow-2xl transition-all duration-500 hover-lift-3d glass-card">
              <div className="relative h-64 overflow-hidden">
                <img
                  src="/london-big-ben-and-thames-river-with-red-double-de.png"
                  alt="London Big Ben and Thames"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
                <div className="absolute bottom-4 left-4 text-white">
                  <h3 className="font-serif font-bold text-2xl mb-1">London</h3>
                  <p className="text-sm opacity-90">Historic Elegance Meets Modern Culture</p>
                </div>
                <div className="absolute top-4 right-4">
                  <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
                    From $399
                  </Badge>
                </div>
              </div>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">LHR, LGW, STN</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Plane className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">30+ airlines</span>
                  </div>
                </div>
                <p className="text-muted-foreground mb-4">
                  Discover royal palaces, world-class museums, charming pubs, and the vibrant West End theater scene.
                </p>
                <Button className="w-full hover-lift-3d" asChild>
                  <a href="/search?destination=LON">
                    Search Flights
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              </CardContent>
            </Card>

            {/* Tokyo */}
            <Card className="group overflow-hidden border-0 shadow-xl hover:shadow-2xl transition-all duration-500 hover-lift-3d glass-card">
              <div className="relative h-64 overflow-hidden">
                <img
                  src="/tokyo-skyline-with-mount-fuji-in-background-and-ch.png"
                  alt="Tokyo skyline with Mount Fuji"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
                <div className="absolute bottom-4 left-4 text-white">
                  <h3 className="font-serif font-bold text-2xl mb-1">Tokyo</h3>
                  <p className="text-sm opacity-90">Where Tradition Meets Innovation</p>
                </div>
                <div className="absolute top-4 right-4">
                  <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
                    From $599
                  </Badge>
                </div>
              </div>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">NRT, HND</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Plane className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">20+ airlines</span>
                  </div>
                </div>
                <p className="text-muted-foreground mb-4">
                  Experience cutting-edge technology, ancient temples, incredible cuisine, and the unique blend of old
                  and new.
                </p>
                <Button className="w-full hover-lift-3d" asChild>
                  <a href="/search?destination=TYO">
                    Search Flights
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              </CardContent>
            </Card>

            {/* Paris */}
            <Card className="group overflow-hidden border-0 shadow-xl hover:shadow-2xl transition-all duration-500 hover-lift-3d glass-card">
              <div className="relative h-64 overflow-hidden">
                <img
                  src="/paris-eiffel-tower-at-golden-hour-with-seine-river.png"
                  alt="Paris Eiffel Tower at sunset"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
                <div className="absolute bottom-4 left-4 text-white">
                  <h3 className="font-serif font-bold text-2xl mb-1">Paris</h3>
                  <p className="text-sm opacity-90">The City of Light and Love</p>
                </div>
                <div className="absolute top-4 right-4">
                  <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
                    From $449
                  </Badge>
                </div>
              </div>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">CDG, ORY</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Plane className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">28+ airlines</span>
                  </div>
                </div>
                <p className="text-muted-foreground mb-4">
                  Immerse yourself in art, fashion, cuisine, and romance in the world's most beautiful city.
                </p>
                <Button className="w-full hover-lift-3d" asChild>
                  <a href="/search?destination=PAR">
                    Search Flights
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              </CardContent>
            </Card>

            {/* Dubai */}
            <Card className="group overflow-hidden border-0 shadow-xl hover:shadow-2xl transition-all duration-500 hover-lift-3d glass-card">
              <div className="relative h-64 overflow-hidden">
                <img
                  src="/dubai-burj-khalifa-and-modern-skyline-with-luxury-.png"
                  alt="Dubai Burj Khalifa skyline"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
                <div className="absolute bottom-4 left-4 text-white">
                  <h3 className="font-serif font-bold text-2xl mb-1">Dubai</h3>
                  <p className="text-sm opacity-90">Luxury and Innovation in the Desert</p>
                </div>
                <div className="absolute top-4 right-4">
                  <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
                    From $699
                  </Badge>
                </div>
              </div>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">DXB, DWC</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Plane className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">35+ airlines</span>
                  </div>
                </div>
                <p className="text-muted-foreground mb-4">
                  Experience world-class shopping, stunning architecture, luxury resorts, and desert adventures.
                </p>
                <Button className="w-full hover-lift-3d" asChild>
                  <a href="/search?destination=DXB">
                    Search Flights
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              </CardContent>
            </Card>

            {/* Sydney */}
            <Card className="group overflow-hidden border-0 shadow-xl hover:shadow-2xl transition-all duration-500 hover-lift-3d glass-card">
              <div className="relative h-64 overflow-hidden">
                <img
                  src="/sydney-opera-house-and-harbour-bridge-with-beautif.png"
                  alt="Sydney Opera House and Harbour Bridge"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
                <div className="absolute bottom-4 left-4 text-white">
                  <h3 className="font-serif font-bold text-2xl mb-1">Sydney</h3>
                  <p className="text-sm opacity-90">Harbor City Down Under</p>
                </div>
                <div className="absolute top-4 right-4">
                  <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
                    From $899
                  </Badge>
                </div>
              </div>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">SYD</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Plane className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">22+ airlines</span>
                  </div>
                </div>
                <p className="text-muted-foreground mb-4">
                  Enjoy stunning beaches, iconic landmarks, vibrant culture, and the laid-back Australian lifestyle.
                </p>
                <Button className="w-full hover-lift-3d" asChild>
                  <a href="/search?destination=SYD">
                    Search Flights
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Call to Action */}
          <div className="text-center">
            <div className="bg-gradient-to-br from-primary/5 via-card to-accent/5 rounded-3xl p-12 glass-card max-w-4xl mx-auto">
              <h3 className="font-serif font-bold text-3xl sm:text-4xl text-foreground mb-4">
                Ready to Explore the World?
              </h3>
              <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
                Book flights to over 1,000 destinations worldwide with zero platform fees and blockchain security.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button
                  size="lg"
                  className="px-8 py-4 text-lg font-bold bg-primary hover:bg-primary/90 shadow-xl hover-lift-3d rounded-xl"
                  asChild
                >
                  <a href="/search">
                    Search All Destinations
                    <Search className="ml-2 h-5 w-5" />
                  </a>
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="px-8 py-4 text-lg border-2 border-secondary hover:bg-secondary hover:text-secondary-foreground rounded-xl hover-lift-3d bg-transparent"
                >
                  View Flight Deals
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section
        id="how-it-works"
        className="py-24 sm:py-32 bg-gradient-to-br from-background via-muted/20 to-background"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-20 space-y-6">
            <Badge
              variant="secondary"
              className="inline-flex items-center px-6 py-3 text-sm font-medium bg-card glass-card border-primary/20"
            >
              <Sparkles className="h-4 w-4 mr-2 text-primary" />
              Blockchain-Powered Flight Booking
            </Badge>
            <h2 className="font-serif font-black text-4xl sm:text-5xl md:text-6xl text-foreground">
              How <span className="text-gradient-warm">Traqora</span> Works
            </h2>
            <p className="text-xl sm:text-2xl text-muted-foreground max-w-4xl mx-auto leading-relaxed">
              Experience the future of flight booking with our revolutionary decentralized platform
            </p>
          </div>

          <div className="mb-20">
            <h3 className="font-serif font-bold text-3xl sm:text-4xl text-center text-foreground mb-12">
              Why Choose <span className="text-gradient-warm">Traqora</span>?
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
              <Card className="group border-0 shadow-lg hover:shadow-2xl transition-all duration-500 hover-lift-3d glass-card">
                <CardContent className="p-8 text-center space-y-6">
                  <div className="w-16 h-16 bg-gradient-to-br from-primary to-primary/80 rounded-2xl flex items-center justify-center mx-auto shadow-xl">
                    <Shield className="h-8 w-8 text-primary-foreground" />
                  </div>
                  <h4 className="font-serif font-bold text-xl">Zero Fees</h4>
                  <p className="text-muted-foreground">No hidden charges. Pay exactly what airlines charge.</p>
                </CardContent>
              </Card>

              <Card className="group border-0 shadow-lg hover:shadow-2xl transition-all duration-500 hover-lift-3d glass-card">
                <CardContent className="p-8 text-center space-y-6">
                  <div className="w-16 h-16 bg-gradient-to-br from-secondary to-secondary/80 rounded-2xl flex items-center justify-center mx-auto shadow-xl">
                    <Zap className="h-8 w-8 text-secondary-foreground" />
                  </div>
                  <h4 className="font-serif font-bold text-xl">Instant Refunds</h4>
                  <p className="text-muted-foreground">
                    Automated refunds processed within minutes via smart contracts.
                  </p>
                </CardContent>
              </Card>

              <Card className="group border-0 shadow-lg hover:shadow-2xl transition-all duration-500 hover-lift-3d glass-card">
                <CardContent className="p-8 text-center space-y-6">
                  <div className="w-16 h-16 bg-gradient-to-br from-accent to-accent/80 rounded-2xl flex items-center justify-center mx-auto shadow-xl">
                    <Globe className="h-8 w-8 text-accent-foreground" />
                  </div>
                  <h4 className="font-serif font-bold text-xl">Direct Booking</h4>
                  <p className="text-muted-foreground">Connect directly with airlines without intermediaries.</p>
                </CardContent>
              </Card>

              <Card className="group border-0 shadow-lg hover:shadow-2xl transition-all duration-500 hover-lift-3d glass-card">
                <CardContent className="p-8 text-center space-y-6">
                  <div className="w-16 h-16 bg-gradient-to-br from-primary to-primary/80 rounded-2xl flex items-center justify-center mx-auto shadow-xl">
                    <CheckCircle className="h-8 w-8 text-primary-foreground" />
                  </div>
                  <h4 className="font-serif font-bold text-xl">Blockchain Security</h4>
                  <p className="text-muted-foreground">Immutable booking records secured on Stellar blockchain.</p>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
            <div className="text-center space-y-6 animate-fade-in-slow">
              <div className="w-20 h-20 bg-gradient-to-br from-primary to-primary/80 rounded-2xl flex items-center justify-center mx-auto shadow-xl">
                <Search className="h-10 w-10 text-primary-foreground" />
              </div>
              <div>
                <h3 className="font-serif font-bold text-xl mb-2">1. Search Flights</h3>
                <p className="text-muted-foreground">
                  Find real-time flights from 200+ airlines with transparent pricing
                </p>
              </div>
            </div>

            <div className="text-center space-y-6 animate-fade-in-slow delay-100">
              <div className="w-20 h-20 bg-gradient-to-br from-secondary to-secondary/80 rounded-2xl flex items-center justify-center mx-auto shadow-xl">
                <Wallet className="h-10 w-10 text-secondary-foreground" />
              </div>
              <div>
                <h3 className="font-serif font-bold text-xl mb-2">2. Connect Wallet</h3>
                <p className="text-muted-foreground">
                  Secure authentication with your Stellar wallet (Freighter/Albedo)
                </p>
              </div>
            </div>

            <div className="text-center space-y-6 animate-fade-in-slow delay-200">
              <div className="w-20 h-20 bg-gradient-to-br from-accent to-accent/80 rounded-2xl flex items-center justify-center mx-auto shadow-xl">
                <CreditCard className="h-10 w-10 text-accent-foreground" />
              </div>
              <div>
                <h3 className="font-serif font-bold text-xl mb-2">3. Smart Payment</h3>
                <p className="text-muted-foreground">Pay directly to airlines with USDC or XLM tokens</p>
              </div>
            </div>

            <div className="text-center space-y-6 animate-fade-in-slow delay-300">
              <div className="w-20 h-20 bg-gradient-to-br from-primary to-primary/80 rounded-2xl flex items-center justify-center mx-auto shadow-xl">
                <FileText className="h-10 w-10 text-primary-foreground" />
              </div>
              <div>
                <h3 className="font-serif font-bold text-xl mb-2">4. Get Confirmation</h3>
                <p className="text-muted-foreground">Receive blockchain-verified booking with QR code for check-in</p>
              </div>
            </div>
          </div>

          {/* Call to Action */}
          <div className="text-center">
            <div className="bg-gradient-to-br from-primary/5 via-card to-accent/5 rounded-3xl p-12 glass-card">
              <h3 className="font-serif font-bold text-3xl sm:text-4xl text-foreground mb-6">
                Ready to Experience the Future?
              </h3>
              <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
                Join thousands of travelers who have discovered the benefits of decentralized flight booking.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button
                  size="lg"
                  className="px-8 py-4 text-lg font-bold bg-primary hover:bg-primary/90 shadow-xl hover-lift-3d rounded-xl"
                  asChild
                >
                  <a href="/search">
                    Start Booking Now
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </a>
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="px-8 py-4 text-lg border-2 border-secondary hover:bg-secondary hover:text-secondary-foreground rounded-xl hover-lift-3d bg-transparent"
                >
                  View Demo
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Governance Section */}
      <section id="governance" className="py-16 sm:py-24 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="font-serif font-bold text-2xl sm:text-3xl md:text-4xl text-foreground mb-4">Governance</h2>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto">
              Learn about the decentralized governance structure of Traqora
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="flex flex-col items-center space-y-4 p-6 rounded-lg bg-card border border-border hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                <Star className="h-8 w-8 text-primary" />
              </div>
              <h3 className="font-serif font-bold text-lg">Community Involvement</h3>
              <p className="text-muted-foreground text-center text-sm sm:text-base">
                Participate in the governance of Traqora through our DAO
              </p>
            </div>

            <div className="flex flex-col items-center space-y-4 p-6 rounded-lg bg-card border border-border hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
              <div className="w-16 h-16 bg-secondary/10 rounded-full flex items-center justify-center">
                <TrendingUp className="h-8 w-8 text-secondary" />
              </div>
              <h3 className="font-serif font-bold text-lg">Continuous Improvement</h3>
              <p className="text-muted-foreground text-center text-sm sm:text-base">
                Our governance model ensures constant updates and improvements
              </p>
            </div>

            <div className="flex flex-col items-center space-y-4 p-6 rounded-lg bg-card border border-border hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
              <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center">
                <Users className="h-8 w-8 text-accent" />
              </div>
              <h3 className="font-serif font-bold text-lg">User Empowerment</h3>
              <p className="text-muted-foreground text-center text-sm sm:text-base">
                Empower users to have full control over their travel experiences
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-card border-t border-border py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-12">
            <div className="space-y-6 sm:col-span-2 md:col-span-1">
              <div className="flex items-center space-x-3">
                <Plane className="h-8 w-8 text-primary" />
                <span className="font-serif font-bold text-2xl">Traqora</span>
              </div>
              <p className="text-muted-foreground text-lg leading-relaxed">
                Decentralized flight booking powered by Stellar blockchain technology.
              </p>
            </div>

            <div>
              <h4 className="font-serif font-bold text-xl mb-6">Product</h4>
              <ul className="space-y-4 text-muted-foreground text-lg">
                <li>
                  <a href="/search" className="hover:text-foreground transition-colors">
                    Search Flights
                  </a>
                </li>
                <li>
                  <a href="/dashboard" className="hover:text-foreground transition-colors">
                    My Bookings
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-foreground transition-colors">
                    Wallet Integration
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-serif font-bold text-xl mb-6">Resources</h4>
              <ul className="space-y-4 text-muted-foreground text-lg">
                <li>
                  <a href="#" className="hover:text-foreground transition-colors">
                    Documentation
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-foreground transition-colors">
                    API Reference
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-foreground transition-colors">
                    Support
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-serif font-bold text-xl mb-6">Community</h4>
              <ul className="space-y-4 text-muted-foreground text-lg">
                <li>
                  <a href="#" className="hover:text-foreground transition-colors">
                    DAO Governance
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-foreground transition-colors">
                    Discord
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-foreground transition-colors">
                    Twitter
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-border mt-12 pt-12 text-center text-muted-foreground text-lg">
            <p>&copy; 2024 Traqora. Built on Stellar with ❤️</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
