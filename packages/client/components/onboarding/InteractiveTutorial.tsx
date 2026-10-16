"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";

interface VideoTutorial {
  id: string;
  title: string;
  description: string;
  duration: number;
  category: string;
  thumbnail: string;
  videoUrl: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  views: number;
}

const tutorials: VideoTutorial[] = [
  {
    id: "getting-started",
    title: "Getting Started with Traqora",
    description:
      "Learn how to set up your wallet and make your first booking in just 5 minutes.",
    duration: 300,
    category: "Basics",
    thumbnail: "/thumbnails/getting-started.jpg",
    videoUrl: "https://example.com/videos/getting-started.mp4",
    difficulty: "beginner",
    views: 2500,
  },
  {
    id: "advanced-search",
    title: "Advanced Flight Search",
    description:
      "Master the flight search filters to find the perfect flight every time.",
    duration: 480,
    category: "Flights",
    thumbnail: "/thumbnails/advanced-search.jpg",
    videoUrl: "https://example.com/videos/advanced-search.mp4",
    difficulty: "intermediate",
    views: 1200,
  },
  {
    id: "wallet-security",
    title: "Wallet Security Best Practices",
    description:
      "Everything you need to know about keeping your wallet and funds secure.",
    duration: 420,
    category: "Security",
    thumbnail: "/thumbnails/wallet-security.jpg",
    videoUrl: "https://example.com/videos/wallet-security.mp4",
    difficulty: "beginner",
    views: 3100,
  },
  {
    id: "refunds-explained",
    title: "Understanding Refunds",
    description:
      "How refunds work on Traqora and what to expect during the process.",
    duration: 360,
    category: "Payments",
    thumbnail: "/thumbnails/refunds.jpg",
    videoUrl: "https://example.com/videos/refunds.mp4",
    difficulty: "beginner",
    views: 1800,
  },
  {
    id: "api-integration",
    title: "API Integration Guide",
    description:
      "Integrate Traqora's API into your application for seamless booking.",
    duration: 600,
    category: "Developer",
    thumbnail: "/thumbnails/api-integration.jpg",
    videoUrl: "https://example.com/videos/api-integration.mp4",
    difficulty: "advanced",
    views: 890,
  },
  {
    id: "dispute-resolution",
    title: "Resolving Disputes",
    description:
      "Step-by-step guide to resolving booking and payment disputes.",
    duration: 540,
    category: "Support",
    thumbnail: "/thumbnails/disputes.jpg",
    videoUrl: "https://example.com/videos/disputes.mp4",
    difficulty: "intermediate",
    views: 650,
  },
];

interface VideoPlayerProps {
  tutorial: VideoTutorial;
}

function VideoPlayer({ tutorial }: VideoPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="bg-black rounded-lg overflow-hidden">
      <div className="relative w-full bg-gray-900 aspect-video flex items-center justify-center">
        <img
          src={tutorial.thumbnail}
          alt={tutorial.title}
          className="w-full h-full object-cover opacity-20"
        />
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className="absolute inset-0 flex items-center justify-center hover:bg-black/20 transition-colors"
        >
          <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors">
            {isPlaying ? (
              <Pause className="h-8 w-8 text-white fill-white" />
            ) : (
              <Play className="h-8 w-8 text-white fill-white ml-1" />
            )}
          </div>
        </button>

        {/* Video Controls */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4">
          <div className="w-full h-1 bg-gray-700 rounded-full mb-4">
            <div
              className="h-full bg-red-500 rounded-full"
              style={{ width: "35%" }}
            />
          </div>
          <div className="flex justify-between items-center">
            <span className="text-white text-sm">
              {formatDuration(tutorial.duration / 2)}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="text-white hover:text-red-500 transition-colors"
              >
                {isMuted ? (
                  <VolumeX className="h-5 w-5" />
                ) : (
                  <Volume2 className="h-5 w-5" />
                )}
              </button>
            </div>
            <span className="text-white text-sm">
              {formatDuration(tutorial.duration)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function InteractiveTutorial() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedTutorial, setSelectedTutorial] =
    useState<VideoTutorial | null>(null);

  const categories = [
    "All",
    "Basics",
    "Flights",
    "Payments",
    "Security",
    "Developer",
    "Support",
  ];
  const filteredTutorials =
    selectedCategory && selectedCategory !== "All"
      ? tutorials.filter((t) => t.category === selectedCategory)
      : tutorials;

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "beginner":
        return "bg-green-500/10 text-green-700";
      case "intermediate":
        return "bg-yellow-500/10 text-yellow-700";
      case "advanced":
        return "bg-red-500/10 text-red-700";
      default:
        return "bg-gray-500/10 text-gray-700";
    }
  };

  return (
    <div className="space-y-8">
      {selectedTutorial ? (
        // Video Player View
        <div>
          <button
            onClick={() => setSelectedTutorial(null)}
            className="text-primary hover:underline mb-4"
          >
            ← Back to Tutorials
          </button>
          <VideoPlayer tutorial={selectedTutorial} />

          <div className="mt-6">
            <h2 className="text-2xl font-bold mb-2">
              {selectedTutorial.title}
            </h2>
            <div className="flex flex-wrap gap-2 mb-4">
              <Badge variant="outline">{selectedTutorial.category}</Badge>
              <Badge
                className={getDifficultyColor(selectedTutorial.difficulty)}
              >
                {selectedTutorial.difficulty}
              </Badge>
              <Badge variant="secondary">
                {formatDuration(selectedTutorial.duration)}
              </Badge>
              <Badge variant="secondary">
                {selectedTutorial.views.toLocaleString()} views
              </Badge>
            </div>
            <p className="text-muted-foreground text-lg">
              {selectedTutorial.description}
            </p>
          </div>
        </div>
      ) : (
        // Tutorials Grid View
        <>
          {/* Category Filter */}
          <div className="space-y-4">
            <h3 className="font-semibold">Filter by Category</h3>
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <Button
                  key={category}
                  variant={
                    selectedCategory === category ||
                    (!selectedCategory && category === "All")
                      ? "default"
                      : "outline"
                  }
                  onClick={() =>
                    setSelectedCategory(category === "All" ? null : category)
                  }
                >
                  {category}
                </Button>
              ))}
            </div>
          </div>

          {/* Tutorials Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTutorials.map((tutorial) => (
              <Card
                key={tutorial.id}
                className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => setSelectedTutorial(tutorial)}
              >
                {/* Thumbnail */}
                <div className="relative w-full bg-gray-900 aspect-video flex items-center justify-center overflow-hidden group">
                  <img
                    src={tutorial.thumbnail}
                    alt={tutorial.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                  <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                    <Play className="h-12 w-12 text-white fill-white group-hover:scale-110 transition-transform" />
                  </div>
                  <Badge className="absolute top-2 right-2 bg-red-500">
                    {Math.floor(tutorial.duration / 60)}m
                  </Badge>
                </div>

                {/* Content */}
                <CardHeader className="pb-3">
                  <CardTitle className="text-base line-clamp-2">
                    {tutorial.title}
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {tutorial.description}
                  </p>

                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="text-xs">
                      {tutorial.category}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={`text-xs ${getDifficultyColor(tutorial.difficulty)}`}
                    >
                      {tutorial.difficulty}
                    </Badge>
                  </div>

                  <div className="text-xs text-muted-foreground">
                    {tutorial.views.toLocaleString()} views
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredTutorials.length === 0 && (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">
                No tutorials found for this category. Try selecting a different
                one.
              </p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  return `${mins}m`;
}
