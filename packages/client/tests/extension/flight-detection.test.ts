import {
  detectItinerary,
  expandShortDate,
  isSameItinerary,
  isValidIsoDate,
  normalizeCabinClass,
} from '@/extension/src/flight-detection';

describe('normalizeCabinClass', () => {
  it('maps site-specific aliases onto the canonical values', () => {
    expect(normalizeCabinClass('coach')).toBe('economy');
    expect(normalizeCabinClass('Premium Economy')).toBe('premium_economy');
    expect(normalizeCabinClass('premium-economy')).toBe('premium_economy');
    expect(normalizeCabinClass('BUSINESS')).toBe('business');
    expect(normalizeCabinClass('f')).toBe('first');
  });

  it('defaults to economy for unknown or missing values', () => {
    expect(normalizeCabinClass(null)).toBe('economy');
    expect(normalizeCabinClass('')).toBe('economy');
    expect(normalizeCabinClass('sleeper')).toBe('economy');
  });
});

describe('isValidIsoDate', () => {
  it('accepts real calendar dates', () => {
    expect(isValidIsoDate('2026-08-01')).toBe(true);
    expect(isValidIsoDate('2028-02-29')).toBe(true);
  });

  it('rejects malformed or impossible dates', () => {
    expect(isValidIsoDate('2026-8-1')).toBe(false);
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('2026-02-30')).toBe(false);
    expect(isValidIsoDate('not-a-date')).toBe(false);
  });
});

describe('expandShortDate', () => {
  it('expands YYMMDD into an ISO date', () => {
    expect(expandShortDate('260801')).toBe('2026-08-01');
  });

  it('rejects wrong-length or invalid input', () => {
    expect(expandShortDate('26081')).toBeNull();
    expect(expandShortDate('261301')).toBeNull();
    expect(expandShortDate('')).toBeNull();
  });
});

describe('detectItinerary', () => {
  it('reads a Kayak round trip', () => {
    const result = detectItinerary(
      'https://www.kayak.com/flights/JFK-LAX/2026-08-01/2026-08-10?cabin=business',
    );

    expect(result).toMatchObject({
      origin: 'JFK',
      destination: 'LAX',
      departureDate: '2026-08-01',
      returnDate: '2026-08-10',
      cabinClass: 'business',
      source: 'www.kayak.com',
    });
  });

  it('reads a Kayak one way', () => {
    const result = detectItinerary('https://www.kayak.com/flights/JFK-LAX/2026-08-01');
    expect(result?.returnDate).toBeNull();
    expect(result?.cabinClass).toBe('economy');
    expect(result?.passengers).toBe(1);
  });

  it('reads a Skyscanner URL with short dates', () => {
    const result = detectItinerary(
      'https://www.skyscanner.net/transport/flights/jfk/lax/260801/260810/?adults=2&cabinclass=premium',
    );

    expect(result).toMatchObject({
      origin: 'JFK',
      destination: 'LAX',
      departureDate: '2026-08-01',
      returnDate: '2026-08-10',
      cabinClass: 'premium_economy',
      passengers: 2,
    });
  });

  it('reads an Expedia leg-encoded search', () => {
    const result = detectItinerary(
      'https://www.expedia.com/Flights-Search?leg1=from%3AJFK%2Cto%3ALAX%2Cdeparture%3A2026-08-01TANYT&leg2=from%3ALAX%2Cto%3AJFK%2Cdeparture%3A2026-08-10TANYT',
    );

    expect(result).toMatchObject({
      origin: 'JFK',
      destination: 'LAX',
      departureDate: '2026-08-01',
      returnDate: '2026-08-10',
    });
  });

  it('falls back to generic query parameters', () => {
    const result = detectItinerary(
      'https://flights.example.com/search?origin=SFO&destination=ORD&departureDate=2026-09-15&cabinClass=first&passengers=3',
    );

    expect(result).toMatchObject({
      origin: 'SFO',
      destination: 'ORD',
      departureDate: '2026-09-15',
      cabinClass: 'first',
      passengers: 3,
      source: 'flights.example.com',
    });
  });

  it('returns null without a departure date', () => {
    expect(detectItinerary('https://www.kayak.com/flights/JFK-LAX')).toBeNull();
    expect(
      detectItinerary('https://flights.example.com/search?origin=SFO&destination=ORD'),
    ).toBeNull();
  });

  it('returns null for non-flight pages and malformed URLs', () => {
    expect(detectItinerary('https://www.kayak.com/hotels')).toBeNull();
    expect(detectItinerary('https://news.example.com/article/123')).toBeNull();
    expect(detectItinerary('not a url')).toBeNull();
  });

  it('rejects same-airport routes and impossible airport codes', () => {
    expect(detectItinerary('https://www.kayak.com/flights/JFK-JFK/2026-08-01')).toBeNull();
    expect(detectItinerary('https://www.kayak.com/flights/JF-LAX/2026-08-01')).toBeNull();
  });

  it('drops a return date that precedes departure', () => {
    expect(
      detectItinerary('https://www.kayak.com/flights/JFK-LAX/2026-08-10/2026-08-01'),
    ).toBeNull();
  });

  it('ignores an out-of-range passenger count', () => {
    const result = detectItinerary(
      'https://flights.example.com/search?origin=SFO&destination=ORD&departureDate=2026-09-15&passengers=99',
    );
    expect(result?.passengers).toBe(1);
  });
});

describe('isSameItinerary', () => {
  const base = detectItinerary('https://www.kayak.com/flights/JFK-LAX/2026-08-01/2026-08-10');

  it('matches identical routes', () => {
    const other = detectItinerary(
      'https://www.skyscanner.net/transport/flights/jfk/lax/260801/260810/',
    );
    expect(isSameItinerary(base, other)).toBe(true);
  });

  it('separates different dates or cabins', () => {
    const differentDate = detectItinerary(
      'https://www.kayak.com/flights/JFK-LAX/2026-08-02/2026-08-10',
    );
    const differentCabin = detectItinerary(
      'https://www.kayak.com/flights/JFK-LAX/2026-08-01/2026-08-10?cabin=business',
    );

    expect(isSameItinerary(base, differentDate)).toBe(false);
    expect(isSameItinerary(base, differentCabin)).toBe(false);
  });

  it('is false when either side is null', () => {
    expect(isSameItinerary(base, null)).toBe(false);
    expect(isSameItinerary(null, base)).toBe(false);
  });
});
