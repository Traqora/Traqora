import {
  detectCurrency,
  extractCarrierCode,
  extractPricesFromDocument,
  isPlausibleFare,
  lowestSighting,
  normalizeNumericString,
  parsePrice,
} from '@/extension/src/price-extraction';

describe('normalizeNumericString', () => {
  it('parses plain integers and decimals', () => {
    expect(normalizeNumericString('499')).toBe(499);
    expect(normalizeNumericString('499.99')).toBe(499.99);
  });

  it('treats a separator followed by three digits as grouping', () => {
    expect(normalizeNumericString('1,234')).toBe(1234);
    expect(normalizeNumericString('1.234')).toBe(1234);
  });

  it('treats a separator followed by one or two digits as a decimal mark', () => {
    expect(normalizeNumericString('12,5')).toBe(12.5);
    expect(normalizeNumericString('12,50')).toBe(12.5);
  });

  it('resolves mixed separators by taking the rightmost as the decimal', () => {
    expect(normalizeNumericString('1,234.56')).toBe(1234.56);
    expect(normalizeNumericString('1.234,56')).toBe(1234.56);
    expect(normalizeNumericString('1.234.567,89')).toBe(1234567.89);
  });

  it('strips surrounding symbols and whitespace', () => {
    expect(normalizeNumericString('  $1,299.00 ')).toBe(1299);
    expect(normalizeNumericString('1 234,56 €')).toBe(1234.56);
  });

  it('returns null when there is no number', () => {
    expect(normalizeNumericString('')).toBeNull();
    expect(normalizeNumericString('Select flight')).toBeNull();
    expect(normalizeNumericString('---')).toBeNull();
  });
});

describe('detectCurrency', () => {
  it('prefers an explicit ISO code', () => {
    expect(detectCurrency('1234 SEK')).toBe('SEK');
    expect(detectCurrency('USD 1,299')).toBe('USD');
  });

  it('falls back to symbols, longest first', () => {
    expect(detectCurrency('$1,299')).toBe('USD');
    expect(detectCurrency('€1.299')).toBe('EUR');
    expect(detectCurrency('£999')).toBe('GBP');
    expect(detectCurrency('C$1,299')).toBe('CAD');
    expect(detectCurrency('R$1.299')).toBe('BRL');
  });

  it('uses the supplied fallback when nothing is recognisable', () => {
    expect(detectCurrency('1299', 'GBP')).toBe('GBP');
    expect(detectCurrency('1299')).toBe('USD');
  });
});

describe('parsePrice', () => {
  it('converts to minor units', () => {
    expect(parsePrice('$1,299.00')).toEqual({ amountCents: 129900, currency: 'USD' });
    expect(parsePrice('€1.234,56')).toEqual({ amountCents: 123456, currency: 'EUR' });
  });

  it('does not apply a cents multiplier to zero-decimal currencies', () => {
    expect(parsePrice('¥45000')).toEqual({ amountCents: 45000, currency: 'JPY' });
  });

  it('rejects non-price strings and non-positive values', () => {
    expect(parsePrice('')).toBeNull();
    expect(parsePrice('Book now')).toBeNull();
    expect(parsePrice('$0')).toBeNull();
    expect(parsePrice(null as unknown as string)).toBeNull();
  });
});

describe('isPlausibleFare', () => {
  it('accepts realistic airfares', () => {
    expect(isPlausibleFare({ amountCents: 129900, currency: 'USD' })).toBe(true);
  });

  it('rejects figures outside the plausible band', () => {
    expect(isPlausibleFare({ amountCents: 500, currency: 'USD' })).toBe(false);
    expect(isPlausibleFare({ amountCents: 9_000_000, currency: 'USD' })).toBe(false);
  });
});

describe('extractPricesFromDocument', () => {
  function documentFrom(html: string): Document {
    return new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  }

  const options = {
    source: 'www.kayak.com',
    sourceUrl: 'https://www.kayak.com/flights/JFK-LAX/2026-08-01',
    now: () => new Date('2026-07-28T12:00:00.000Z'),
  };

  it('collects fares from price-ish selectors', () => {
    const doc = documentFrom(`
      <div data-testid="price-total">$412.30</div>
      <span class="Flights-price">$389.00</span>
    `);

    const sightings = extractPricesFromDocument(doc, options);
    const amounts = sightings.map((s) => s.amountCents).sort((a, b) => a - b);

    expect(amounts).toEqual([38900, 41230]);
    expect(sightings[0].source).toBe('www.kayak.com');
    expect(sightings[0].observedAt).toBe('2026-07-28T12:00:00.000Z');
  });

  it('de-duplicates the same amount repeated across the page', () => {
    const doc = documentFrom(`
      <div class="price">$412.30</div>
      <div class="price">$412.30</div>
      <div data-price="412.30"></div>
    `);

    expect(extractPricesFromDocument(doc, options)).toHaveLength(1);
  });

  it('discards implausible and non-numeric nodes', () => {
    const doc = documentFrom(`
      <div class="price">Select</div>
      <div class="price">$2.00</div>
      <div class="price">$980,000.00</div>
      <div class="price">$599.00</div>
    `);

    const sightings = extractPricesFromDocument(doc, options);
    expect(sightings.map((s) => s.amountCents)).toEqual([59900]);
  });

  it('reads the data-price attribute and content attribute', () => {
    const doc = documentFrom(`
      <div data-price="1299.99"></div>
      <meta itemprop="price" content="450.00" />
    `);

    const amounts = extractPricesFromDocument(doc, options)
      .map((s) => s.amountCents)
      .sort((a, b) => a - b);
    expect(amounts).toEqual([45000, 129999]);
  });

  it('returns an empty list when the page has no prices', () => {
    expect(extractPricesFromDocument(documentFrom('<div>No results</div>'), options)).toEqual(
      [],
    );
  });
});

describe('extractCarrierCode', () => {
  function nodeFrom(html: string): Element {
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    const node = doc.querySelector('.price');
    if (!node) throw new Error('fixture missing .price');
    return node;
  }

  it('reads the carrier from an ancestor', () => {
    expect(
      extractCarrierCode(nodeFrom('<div data-carrier="ba"><span class="price">$1</span></div>')),
    ).toBe('BA');
    expect(
      extractCarrierCode(nodeFrom('<div data-airline="UAL"><span class="price">$1</span></div>')),
    ).toBe('UAL');
  });

  it('returns null when absent or malformed', () => {
    expect(extractCarrierCode(nodeFrom('<div><span class="price">$1</span></div>'))).toBeNull();
    expect(
      extractCarrierCode(
        nodeFrom('<div data-carrier="British Airways"><span class="price">$1</span></div>'),
      ),
    ).toBeNull();
  });
});

describe('lowestSighting', () => {
  const base = {
    currency: 'USD',
    source: 'www.kayak.com',
    sourceUrl: 'https://www.kayak.com',
    carrierCode: null,
    observedAt: '2026-07-28T12:00:00.000Z',
  };

  it('returns the cheapest entry', () => {
    const cheapest = lowestSighting([
      { ...base, amountCents: 50000 },
      { ...base, amountCents: 41230 },
      { ...base, amountCents: 62000 },
    ]);
    expect(cheapest?.amountCents).toBe(41230);
  });

  it('returns null for an empty list', () => {
    expect(lowestSighting([])).toBeNull();
  });
});
