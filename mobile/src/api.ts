import { FlightSearchResponse, FlightSearchParams } from '../../packages/client/lib/api';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:3001';

export interface BookingSupportContact {
  bookingReference: string;
  supportEmail: string;
  supportPhone: string | null;
}

const BOOKING_REFERENCE_PATTERN = /^[A-Z0-9]{6}$/;

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

export async function getBookingSupportContact(bookingReference: string): Promise<BookingSupportContact> {
  const reference = bookingReference.trim().toUpperCase();
  if (!BOOKING_REFERENCE_PATTERN.test(reference)) {
    throw new Error('Invalid booking reference');
  }

  const response = await fetch(
    `${API_BASE_URL}/api/bookings/${encodeURIComponent(reference)}/support-contact`,
  );
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.error?.message || body?.error || 'Failed to load support contact');
  }

  return {
    bookingReference: String(body.bookingReference),
    supportEmail: String(body.supportEmail),
    supportPhone: body.supportPhone ? String(body.supportPhone) : null,
  };
}
