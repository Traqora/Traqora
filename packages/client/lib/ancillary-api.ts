import { API_BASE_URL } from '@/lib/api';

export type AncillaryServiceType =
  | 'seat_upgrade'
  | 'priority_boarding'
  | 'lounge_access'
  | 'extra_legroom';

export interface AncillaryCatalogItem {
  code: string;
  name: string;
  description: string;
  type: AncillaryServiceType;
  priceCents: number;
  availableCabins: Array<'economy' | 'premium' | 'business' | 'first'>;
  requiresAirport?: boolean;
  availableAtGate?: boolean;
}

export interface AncillaryRevenueReport {
  totalCents: number;
  purchaseCount: number;
  byType: Record<AncillaryServiceType, { totalCents: number; purchaseCount: number }>;
}

function authorizationHeaders(): HeadersInit {
  if (typeof window === 'undefined') return {};
  try {
    const stored = window.localStorage.getItem('traqora-auth');
    const parsed = stored ? JSON.parse(stored) : null;
    const token = parsed?.state?.accessToken;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function readData<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.error?.message || body?.error || 'Ancillary service request failed');
  }
  return body.data as T;
}

export async function fetchAncillaryCatalog(
  cabinClass: string,
  airport?: string,
): Promise<AncillaryCatalogItem[]> {
  const search = new URLSearchParams({ cabinClass });
  if (airport) search.set('airport', airport);
  const response = await fetch(`${API_BASE_URL}/api/v1/ancillary/catalog?${search.toString()}`);
  return readData<AncillaryCatalogItem[]>(response);
}

export async function purchaseAncillaryService(input: {
  bookingId: string;
  serviceCode: string;
  quantity?: number;
  details?: Record<string, string | number | boolean>;
}): Promise<{ id: string }> {
  const response = await fetch(`${API_BASE_URL}/api/v1/ancillary/purchases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authorizationHeaders() },
    body: JSON.stringify(input),
  });
  return readData<{ id: string }>(response);
}

export async function fetchAncillaryRevenue(
  from?: Date,
  to?: Date,
): Promise<AncillaryRevenueReport> {
  const search = new URLSearchParams();
  if (from) search.set('from', from.toISOString());
  if (to) search.set('to', to.toISOString());
  const response = await fetch(
    `${API_BASE_URL}/api/v1/ancillary/revenue?${search.toString()}`,
    { headers: authorizationHeaders() },
  );
  return readData<AncillaryRevenueReport>(response);
}
