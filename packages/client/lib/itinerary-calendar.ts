import { API_BASE_URL } from './api';

export async function downloadItineraryCalendar(bookingId: string): Promise<Blob> {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('token') : null;
  const response = await fetch(`${API_BASE_URL}/api/v1/bookings/${encodeURIComponent(bookingId)}/itinerary.ics`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error?.message || `Unable to export itinerary (${response.status})`);
  }
  return response.blob();
}
