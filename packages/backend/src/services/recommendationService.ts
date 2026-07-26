export interface DestinationRecommendation {
  destination: string;
  city: string;
  country: string;
  reason: 'preference_match' | 'booking_history' | 'trending';
  score: number;
  averagePriceCents: number;
  imageUrl?: string;
}

export interface UserPreferences {
  preferredAirlines?: string[];
  preferredRoutes?: string[];
  budgetRange?: { min: number; max: number };
  travelStyle?: 'budget' | 'standard' | 'premium';
}

export class RecommendationService {
  private trendingDestinations: Array<{ destination: string; city: string; country: string; bookings: number }> = [
    { destination: 'JFK', city: 'New York', country: 'USA', bookings: 1250 },
    { destination: 'LAX', city: 'Los Angeles', country: 'USA', bookings: 1100 },
    { destination: 'LHR', city: 'London', country: 'UK', bookings: 980 },
    { destination: 'DXB', city: 'Dubai', country: 'UAE', bookings: 920 },
    { destination: 'NRT', city: 'Tokyo', country: 'Japan', bookings: 850 },
    { destination: 'CDG', city: 'Paris', country: 'France', bookings: 800 },
    { destination: 'SIN', city: 'Singapore', country: 'Singapore', bookings: 750 },
    { destination: 'SYD', city: 'Sydney', country: 'Australia', bookings: 680 },
  ];

  public async getRecommendations(
    _userId: string,
    preferences: UserPreferences,
    bookingHistory: Array<{ route: string; amount: number }>,
  ): Promise<DestinationRecommendation[]> {
    const recommendations: DestinationRecommendation[] = [];

    for (const dest of this.trendingDestinations) {
      let score = dest.bookings / 1250;
      let reason: DestinationRecommendation['reason'] = 'trending';

      if (preferences.preferredRoutes?.some((r) => r.includes(dest.destination))) {
        score += 0.3;
        reason = 'preference_match';
      }

      const historyMatch = bookingHistory.filter((b) => b.route.includes(dest.destination)).length;
      if (historyMatch > 0) {
        score += 0.2;
        reason = historyMatch >= 2 ? 'booking_history' : reason;
      }

      if (preferences.budgetRange) {
        const price = dest.bookings * 0.5 + 100;
        if (price < preferences.budgetRange.min || price > preferences.budgetRange.max) {
          score -= 0.2;
        }
      }

      recommendations.push({
        destination: dest.destination,
        city: dest.city,
        country: dest.country,
        reason,
        score: Math.min(1, Math.max(0, score)),
        averagePriceCents: Math.round(dest.bookings * 0.5 + 10000),
      });
    }

    return recommendations.sort((a, b) => b.score - a.score).slice(0, 6);
  }
}
