import {
  buildSearchShareLink,
  decodeSearchQueryFromJson,
  decodeSearchQueryFromUrl,
  encodeSearchQueryToJson,
} from '../lib/search-sharing';
import type { SearchMemoryQuery } from '../lib/api';

const baseQuery: SearchMemoryQuery = {
  from: 'JFK',
  to: 'LAX',
  date: '2026-09-01',
  passengers: 2,
  class: 'economy',
};

const inputQuery: SearchMemoryQuery = {
  from: 'jfk',
  to: 'lax',
  date: '2026-09-01',
  passengers: 2,
  class: 'economy',
};

describe('buildSearchShareLink', () => {
  it('produces an absolute URL with normalized airport codes and the correct path', () => {
    const { url, params } = buildSearchShareLink(inputQuery, {
      origin: 'https://traqora.example',
      pathname: '/search',
    });
    expect(url.startsWith('https://traqora.example/search?')).toBe(true);
    expect(params.get('from')).toBe('JFK');
    expect(params.get('to')).toBe('LAX');
    expect(params.get('date')).toBe('2026-09-01');
    expect(params.get('passengers')).toBe('2');
    expect(params.get('class')).toBe('economy');
  });

  it('falls back to a relative URL when no origin is supplied', () => {
    const { url } = buildSearchShareLink(inputQuery, { origin: '', pathname: '/search' });
    expect(url.startsWith('/search?')).toBe(true);
  });

  it('omits invalid passengers and dates from the link', () => {
    const { params } = buildSearchShareLink({
      ...inputQuery,
      passengers: 0,
      date: 'not-a-date',
    });
    expect(params.has('passengers')).toBe(false);
    expect(params.has('date')).toBe(false);
  });

  it('drops unsupported cabin classes', () => {
    const { params } = buildSearchShareLink({
      ...inputQuery,
      class: 'first_class' as SearchMemoryQuery['class'],
    });
    expect(params.has('class')).toBe(false);
  });

  it('uppercases trimmed airport codes', () => {
    const { params } = buildSearchShareLink({ ...inputQuery, from: '  jfk ', to: ' lax' });
    expect(params.get('from')).toBe('JFK');
    expect(params.get('to')).toBe('LAX');
  });
});

describe('decodeSearchQueryFromUrl', () => {
  it('decodes a valid search string into a SearchMemoryQuery', () => {
    const query = decodeSearchQueryFromUrl('from=JFK&to=LAX&date=2026-09-01&passengers=2&class=economy');
    expect(query).toEqual(baseQuery);
  });

  it('accepts a URLSearchParams instance', () => {
    const params = new URLSearchParams('from=JFK&to=LAX&date=2026-09-01');
    const query = decodeSearchQueryFromUrl(params);
    expect(query?.passengers).toBe(1);
    expect(query?.class).toBe('economy');
  });

  it('returns null when a required field is missing', () => {
    expect(decodeSearchQueryFromUrl('from=JFK&date=2026-09-01')).toBeNull();
    expect(decodeSearchQueryFromUrl('from=JFK&to=LAX')).toBeNull();
  });

  it('returns null when the date is malformed', () => {
    expect(decodeSearchQueryFromUrl('from=JFK&to=LAX&date=2026/09/01')).toBeNull();
  });

  it('returns null when passengers count is out of range or non-numeric', () => {
    expect(decodeSearchQueryFromUrl('from=JFK&to=LAX&date=2026-09-01&passengers=0')).toBeNull();
    expect(decodeSearchQueryFromUrl('from=JFK&to=LAX&date=2026-09-01&passengers=abc')).toBeNull();
    expect(decodeSearchQueryFromUrl('from=JFK&to=LAX&date=2026-09-01&passengers=10')).toBeNull();
  });

  it('returns null when the airport code is not three characters', () => {
    expect(decodeSearchQueryFromUrl('from=JK&to=LAX&date=2026-09-01')).toBeNull();
    expect(decodeSearchQueryFromUrl('from=JFK&to=LAXX&date=2026-09-01')).toBeNull();
  });

  it('returns null for unsupported cabin classes', () => {
    expect(
      decodeSearchQueryFromUrl('from=JFK&to=LAX&date=2026-09-01&class=space'),
    ).toBeNull();
  });
});

describe('decodeSearchQueryFromJson', () => {
  it('decodes a valid JSON payload', () => {
    const query = decodeSearchQueryFromJson({
      from: 'jfk',
      to: 'LAX',
      date: '2026-09-01',
      passengers: '3',
      class: 'business',
    });
    expect(query).toEqual({
      from: 'JFK',
      to: 'LAX',
      date: '2026-09-01',
      passengers: 3,
      class: 'business',
    });
  });

  it('returns null for non-object input', () => {
    expect(decodeSearchQueryFromJson(null)).toBeNull();
    expect(decodeSearchQueryFromJson(undefined)).toBeNull();
    expect(decodeSearchQueryFromJson('string')).toBeNull();
    expect(decodeSearchQueryFromJson(['array'])).toBeNull();
  });

  it('returns null when fields fail validation', () => {
    expect(decodeSearchQueryFromJson({ from: 'JK', to: 'LAX', date: '2026-09-01' })).toBeNull();
    expect(decodeSearchQueryFromJson({ from: 'JFK', to: 'LAX', date: 'bad' })).toBeNull();
    expect(decodeSearchQueryFromJson({ from: 'JFK', to: 'LAX', date: '2026-09-01', passengers: 'NaN' })).toBeNull();
  });
});

describe('encodeSearchQueryToJson', () => {
  it('round-trips through decodeSearchQueryFromJson', () => {
    const encoded = encodeSearchQueryToJson(inputQuery);
    const decoded = decodeSearchQueryFromJson(JSON.parse(encoded));
    expect(decoded).toEqual(baseQuery);
  });
});