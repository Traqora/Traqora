export interface JourneyStop {
  id: string;
  airportCode: string;
  city: string;
  arrival: string;
  departure: string;
}

export interface JourneyPlan {
  id: string;
  stops: JourneyStop[];
  totalDurationMinutes: number;
  optimized: boolean;
}

export class JourneyPlanner {
  public planJourney(stops: JourneyStop[]): JourneyPlan {
    const optimized = this.optimizeRoute(stops);
    const totalDurationMinutes = this.calculateTotalDuration(optimized);

    return {
      id: `journey-${Date.now()}`,
      stops: optimized,
      totalDurationMinutes,
      optimized: true,
    };
  }

  private optimizeRoute(stops: JourneyStop[]): JourneyStop[] {
    if (stops.length <= 2) return stops;

    const start = stops[0];
    const end = stops[stops.length - 1];
    const middle = stops.slice(1, -1);

    middle.sort((a, b) => a.airportCode.localeCompare(b.airportCode));

    return [start, ...middle, end];
  }

  private calculateTotalDuration(stops: JourneyStop[]): number {
    let total = 0;
    for (let i = 0; i < stops.length - 1; i++) {
      const current = new Date(stops[i].departure).getTime();
      const next = new Date(stops[i + 1].arrival).getTime();
      total += Math.max(0, next - current);
    }
    return Math.round(total / 60000);
  }
}
