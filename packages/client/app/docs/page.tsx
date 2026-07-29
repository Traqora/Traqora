"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BookOpen,
  Code,
  Lightbulb,
  Play,
  Search,
  Users,
  FileText,
  MessageCircle,
  ExternalLink,
  ChevronRight,
} from "lucide-react";
import { NavWalletButton } from "@/components/nav-wallet-button";

export default function DocumentationPage() {
  const [selectedCategory, setSelectedCategory] = useState("overview");

  const categories = [
    {
      id: "overview",
      name: "Getting Started",
      icon: BookOpen,
      description: "Learn the basics of Traqora",
    },
    {
      id: "flights",
      name: "Flight Booking",
      icon: Play,
      description: "How to search and book flights",
    },
    {
      id: "payments",
      name: "Payments & Refunds",
      icon: Code,
      description: "Understanding payment options and refunds",
    },
    {
      id: "api",
      name: "API Documentation",
      icon: Code,
      description: "Developer API reference",
    },
    {
      id: "wallet",
      name: "Wallet Integration",
      icon: Users,
      description: "Connect and manage your wallet",
    },
    {
      id: "faq",
      name: "FAQ",
      icon: MessageCircle,
      description: "Frequently asked questions",
    },
  ];

  const gettingStartedDocs = [
    {
      title: "What is Traqora?",
      description:
        "Understand the decentralized travel booking platform built on Stellar blockchain",
      duration: "5 min read",
      difficulty: "Beginner",
    },
    {
      title: "Setting Up Your Wallet",
      description: "Connect Freighter, Albedo, or Rabet wallet to get started",
      duration: "10 min",
      difficulty: "Beginner",
    },
    {
      title: "Your First Flight Booking",
      description: "Step-by-step guide to search and book your first flight",
      duration: "15 min",
      difficulty: "Beginner",
    },
  ];

  const flightBookingDocs = [
    {
      title: "Flight Search Guide",
      description: "Learn advanced search filters and sorting options",
      duration: "8 min",
      difficulty: "Beginner",
    },
    {
      title: "Booking a Flight",
      description: "Complete walkthrough of the booking process",
      duration: "10 min",
      difficulty: "Beginner",
    },
    {
      title: "Managing Your Bookings",
      description: "View, modify, or cancel your bookings",
      duration: "7 min",
      difficulty: "Beginner",
    },
    {
      title: "Special Offers & Discounts",
      description: "How to find and apply promo codes",
      duration: "5 min",
      difficulty: "Beginner",
    },
  ];

  const paymentDocs = [
    {
      title: "Payment Methods",
      description: "Supported payment options and currencies",
      duration: "5 min",
      difficulty: "Beginner",
    },
    {
      title: "Refund Policy",
      description: "Complete refund process and timelines",
      duration: "10 min",
      difficulty: "Beginner",
    },
    {
      title: "Cancellation Guide",
      description: "How to cancel flights and receive refunds",
      duration: "8 min",
      difficulty: "Beginner",
    },
    {
      title: "Dispute Resolution",
      description: "Resolving payment disputes and chargebacks",
      duration: "10 min",
      difficulty: "Intermediate",
    },
  ];

  const apiDocs = [
    {
      title: "API Overview",
      description: "Introduction to Traqora REST API",
      duration: "10 min",
      difficulty: "Intermediate",
    },
    {
      title: "Authentication",
      description: "API key management and JWT tokens",
      duration: "15 min",
      difficulty: "Intermediate",
    },
    {
      title: "Flight Search API",
      description: "Endpoints for searching flights",
      duration: "10 min",
      difficulty: "Intermediate",
    },
    {
      title: "Booking API",
      description: "Create and manage bookings via API",
      duration: "15 min",
      difficulty: "Intermediate",
    },
  ];

  const renderDocumentCards = (docs: typeof gettingStartedDocs) => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {docs.map((doc, idx) => (
        <Card
          key={idx}
          className="hover:shadow-lg transition-shadow cursor-pointer"
        >
          <CardHeader>
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <CardTitle className="text-lg">{doc.title}</CardTitle>
              </div>
              <Badge
                variant={
                  doc.difficulty === "Beginner" ? "secondary" : "default"
                }
              >
                {doc.difficulty}
              </Badge>
            </div>
            <CardDescription className="text-sm">
              {doc.description}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {doc.duration}
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  const getSelectedDocs = () => {
    switch (selectedCategory) {
      case "overview":
        return gettingStartedDocs;
      case "flights":
        return flightBookingDocs;
      case "payments":
        return paymentDocs;
      case "api":
        return apiDocs;
      default:
        return [];
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center space-x-2">
              <BookOpen className="h-8 w-8 text-primary" />
              <span className="font-serif font-bold text-2xl text-foreground">
                Traqora Docs
              </span>
            </Link>
            <div className="hidden md:flex items-center space-x-6">
              <Link
                href="/"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Home
              </Link>
              <Link
                href="/search"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Search
              </Link>
              <Link
                href="/dashboard"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Dashboard
              </Link>
              <NavWalletButton />
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Documentation</h1>
          <p className="text-xl text-muted-foreground">
            Everything you need to know about using Traqora
          </p>
        </div>

        {/* Search Box */}
        <div className="mb-12">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-5 w-5" />
            <input
              type="text"
              placeholder="Search documentation..."
              className="w-full pl-10 pr-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        {/* Categories */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
          {categories.map((category) => {
            const Icon = category.icon;
            return (
              <Card
                key={category.id}
                className={`cursor-pointer transition-all hover:shadow-lg ${
                  selectedCategory === category.id ? "ring-2 ring-primary" : ""
                }`}
                onClick={() => setSelectedCategory(category.id)}
              >
                <CardHeader>
                  <div className="flex items-center space-x-2 mb-2">
                    <Icon className="h-6 w-6 text-primary" />
                    <CardTitle className="text-lg">{category.name}</CardTitle>
                  </div>
                  <CardDescription>{category.description}</CardDescription>
                </CardHeader>
              </Card>
            );
          })}
        </div>

        {/* Documentation Content */}
        <div>
          <div className="mb-6">
            <h2 className="text-2xl font-bold">
              {categories.find((c) => c.id === selectedCategory)?.name}
            </h2>
          </div>

          {selectedCategory === "faq" ? (
            <Card>
              <CardHeader>
                <CardTitle>Frequently Asked Questions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h4 className="font-semibold mb-2">How do I get started?</h4>
                  <p className="text-muted-foreground">
                    Download a compatible wallet (Freighter, Albedo, or Rabet),
                    create an account, and you're ready to book flights.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">
                    What wallets are supported?
                  </h4>
                  <p className="text-muted-foreground">
                    We support Freighter, Albedo, and Rabet wallets. These are
                    browser extensions that integrate with the Stellar network.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">
                    How long does a refund take?
                  </h4>
                  <p className="text-muted-foreground">
                    Most refunds are processed within 3-5 business days. Complex
                    cases may take up to 10 business days.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Is my data secure?</h4>
                  <p className="text-muted-foreground">
                    Yes, all personal data is encrypted at rest using
                    AES-256-GCM encryption. We comply with GDPR and CCPA.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">
                    Can I modify my booking?
                  </h4>
                  <p className="text-muted-foreground">
                    Yes, bookings can be modified or cancelled up to 24 hours
                    before departure. After that, refunds may not be available.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            renderDocumentCards(getSelectedDocs())
          )}
        </div>

        {/* Help Section */}
        <Card className="mt-12 bg-primary/5 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Lightbulb className="h-5 w-5" />
              <span>Need More Help?</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Can't find what you're looking for? Our support team is here to
              help.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button variant="outline">
                Contact Support
                <ExternalLink className="ml-2 h-4 w-4" />
              </Button>
              <Button variant="outline">
                View API Docs
                <ExternalLink className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
