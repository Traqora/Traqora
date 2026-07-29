export interface TierBenefit {
  id: string;
  description: string;
  icon?: string;
}

export interface TierInfo {
  tier: string;
  name: string;
  minPoints: number;
  benefits: TierBenefit[];
  color: string;
}

export const TIERS: TierInfo[] = [
  {
    tier: 'bronze',
    name: 'Bronze',
    minPoints: 0,
    color: '#CD7F32',
    benefits: [
      { id: 'b1', description: 'Earn 1x points on all bookings', icon: 'points' },
      { id: 'b2', description: 'Access to basic rewards catalog', icon: 'gift' },
      { id: 'b3', description: 'Birthday bonus: 500 points', icon: 'cake' },
    ],
  },
  {
    tier: 'silver',
    name: 'Silver',
    minPoints: 1000,
    color: '#C0C0C0',
    benefits: [
      { id: 's1', description: 'Earn 1.25x points on all bookings', icon: 'points' },
      { id: 's2', description: 'Priority customer support', icon: 'support' },
      { id: 's3', description: 'Free seat selection', icon: 'seat' },
      { id: 's4', description: 'Priority boarding', icon: 'zap' },
      { id: 's5', description: 'Birthday bonus: 1,000 points', icon: 'cake' },
    ],
  },
  {
    tier: 'gold',
    name: 'Gold',
    minPoints: 10000,
    color: '#FFD700',
    benefits: [
      { id: 'g1', description: 'Earn 1.5x points on all bookings', icon: 'points' },
      { id: 'g2', description: 'Access to airport lounges', icon: 'lounge' },
      { id: 'g3', description: 'Complimentary checked bags (1)', icon: 'luggage' },
      { id: 'g4', description: 'Priority check-in and security', icon: 'check-circle' },
      { id: 'g5', description: '20% off partner hotels', icon: 'hotel' },
      { id: 'g6', description: 'Birthday bonus: 2,500 points', icon: 'cake' },
    ],
  },
  {
    tier: 'platinum',
    name: 'Platinum',
    minPoints: 50000,
    color: '#E5E4E2',
    benefits: [
      { id: 'p1', description: 'Earn 2x points on all bookings', icon: 'points' },
      { id: 'p2', description: 'Access to premium lounges worldwide', icon: 'lounge' },
      { id: 'p3', description: 'Complimentary checked bags (2)', icon: 'luggage' },
      { id: 'p4', description: 'Guaranteed seat availability', icon: 'seat' },
      { id: 'p5', description: 'Dedicated concierge service', icon: 'concierge' },
      { id: 'p6', description: '30% off partner hotels and car rentals', icon: 'car' },
      { id: 'p7', description: 'Annual bonus: 10,000 points', icon: 'gift' },
      { id: 'p8', description: 'Birthday bonus: 5,000 points', icon: 'cake' },
    ],
  },
  {
    tier: 'diamond',
    name: 'Diamond',
    minPoints: 200000,
    color: '#B9F2FF',
    benefits: [
      { id: 'd1', description: 'Earn 2.5x points on all bookings', icon: 'points' },
      { id: 'd2', description: 'Exclusive access to first-class lounges', icon: 'lounge' },
      { id: 'd3', description: 'Unlimited checked bags', icon: 'luggage' },
      { id: 'd4', description: 'Free seat selection (including extra legroom)', icon: 'seat' },
      { id: 'd5', description: 'Guaranteed same-day confirmed booking', icon: 'check-circle' },
      { id: 'd6', description: 'Personal travel advisor', icon: 'concierge' },
      { id: 'd7', description: '50% off all partner services', icon: 'percent' },
      { id: 'd8', description: 'Quarterly bonus: 25,000 points', icon: 'gift' },
      { id: 'd9', description: 'Birthday bonus: 10,000 points', icon: 'cake' },
    ],
  },
];