'use client';

import React, { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient, CheckInWindow } from '@/lib/api';
import { useCheckInOffline } from '@/hooks/use-check-in-offline';
import { BoardingPassView } from '@/src/components/BoardingPassView';

export default function CheckInPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const resolvedParams = use(params);
  const bookingId = resolvedParams.bookingId;
  const router = useRouter();

  const {
    checkIn,
    isLoading,
    isFromCache,
    error: checkInError,
    applyCheckIn,
  } = useCheckInOffline(bookingId);

  const [windowInfo, setWindowInfo] = useState<CheckInWindow | null>(null);
  const [seatNumber, setSeatNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchWindow() {
      try {
        setError(null);
        const res = await apiClient.getCheckInWindow(bookingId);
        if (res.success && res.data) {
          setWindowInfo(res.data);
        } else {
          setError(res.error?.message || 'Failed to fetch check-in window.');
        }
      } catch (err: any) {
        setError(err.message || 'Network error while loading check-in details.');
      }
    }

    if (bookingId) {
      fetchWindow();
    }
  }, [bookingId]);

  useEffect(() => {
    if (checkIn?.seatNumber) {
      setSeatNumber(checkIn.seatNumber);
    }
  }, [checkIn]);

  const handleCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await apiClient.checkIn(bookingId, seatNumber.trim() || undefined);
      if (res.success && res.data) {
        applyCheckIn(res.data);
      } else {
        setError(
          res.error?.message ||
            'Check-in failed. Please verify your details and try again.',
        );
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during check-in.');
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading && !checkIn) {
    return (
      <main className="min-h-screen p-8 max-w-2xl mx-auto" aria-busy="true" aria-label="Loading check-in details">
        <h1 className="text-2xl font-bold mb-4">Flight Check-In</h1>
        <p className="text-gray-600">Loading your trip details...</p>
      </main>
    );
  }

  const displayError = error || checkInError;

  return (
    <main className="min-h-screen p-8 max-w-2xl mx-auto">
      <header className="mb-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">Flight Check-In</h1>
        <p className="text-sm text-gray-600 mt-1">Booking Reference: <span className="font-mono font-medium">{bookingId}</span></p>
      </header>

      {displayError && (
        <div role="alert" className="mb-6 p-4 bg-red-50 border border-red-200 text-red-800 rounded-lg">
          <p className="font-semibold">Error</p>
          <p className="text-sm mt-1">{displayError}</p>
        </div>
      )}

      {checkIn && checkIn.status === 'checked_in' ? (
        <section aria-labelledby="success-heading" className="space-y-6">
          <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-green-900">
            <h2 id="success-heading" className="text-xl font-bold text-green-800 mb-2">You are Checked In!</h2>
            <p className="text-sm">Your boarding pass has been successfully issued.</p>
          </div>

          <BoardingPassView bookingId={bookingId} checkIn={checkIn} isFromCache={isFromCache} />

          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="w-full bg-gray-900 hover:bg-gray-800 text-white font-medium py-2.5 px-4 rounded-lg transition focus:outline-none focus:ring-2 focus:ring-gray-700 focus:ring-offset-2"
          >
            Return to Dashboard
          </button>
        </section>
      ) : (
        <div className="space-y-6">
          {windowInfo && (
            <section aria-labelledby="window-heading" className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <h2 id="window-heading" className="text-lg font-semibold text-gray-900 mb-2">Check-In Window Status</h2>
              <div className="flex items-center space-x-2">
                <span className={`inline-block w-3 h-3 rounded-full ${windowInfo.isOpen ? 'bg-green-500' : 'bg-amber-500'}`} aria-hidden="true" />
                <span className="font-medium text-gray-800">
                  {windowInfo.isOpen ? 'Check-in window is currently OPEN' : 'Check-in window is CLOSED or not yet active'}
                </span>
              </div>
            </section>
          )}

          <form onSubmit={handleCheckIn} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Passenger Check-In</h2>
            <div>
              <label htmlFor="seatNumber" className="block text-sm font-medium text-gray-700 mb-1">
                Preferred Seat Number (Optional)
              </label>
              <input
                id="seatNumber"
                type="text"
                maxLength={8}
                value={seatNumber}
                onChange={(e) => setSeatNumber(e.target.value)}
                placeholder="e.g. 12A"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || (windowInfo ? !windowInfo.isOpen : false)}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2.5 px-4 rounded-lg transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {submitting ? 'Processing Check-In...' : 'Complete Check-In'}
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
