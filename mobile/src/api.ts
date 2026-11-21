import { FlightSearchResponse, FlightSearchParams } from '../../packages/client/lib/api';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:3001';

export async function searchMobileFlights(params: FlightSearchParams): Promise<FlightSearchResponse> {
  const query = new URLSearchParams();
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  if (params.date) query.set('date', params.date);
  if (params.passengers) query.set('passengers', String(params.passengers));
  if (params.class) query.set('class', params.class);

  const response = await fetch(`${API_BASE_URL}/api/flights/search?${query.toString()}`);
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.error?.message || body?.error || 'Flight search failed');
  }
  return body as FlightSearchResponse;
}
