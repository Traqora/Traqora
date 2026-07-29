"use client";

import { useEffect, useState } from "react";
import {
  getCachedItineraries,
  type CachedItinerary,
} from "@/lib/offline-storage";
import { useOffline } from "@/components/offline-provider";
import { Plane, MapPin, Clock, AlertCircle } from "lucide-react";

/**
 * Component to display cached itineraries for offline viewing
 * Shows available bookings when user is offline
 */
export function OfflineItineraryView() {
  const [itineraries, setItineraries] = useState<CachedItinerary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { isOnline } = useOffline();

  useEffect(() => {
    // Load cached itineraries
    const cached = getCachedItineraries();
    setItineraries(cached);
    setIsLoading(false);
  }, []);

  if (isLoading) {
    return <div className="text-center py-8">Loading itineraries...</div>;
  }

  if (itineraries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 bg-amber-50 rounded-lg border border-amber-200">
        <AlertCircle className="w-12 h-12 text-amber-600 mb-4" />
        <h3 className="text-lg font-semibold text-amber-900 mb-2">
          No Offline Itineraries
        </h3>
        <p className="text-sm text-amber-700 text-center">
          No booking information available offline. View your bookings while
          online to cache them for offline access.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!isOnline && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-900">
              You are offline
            </p>
            <p className="text-sm text-red-700 mt-1">
              Viewing cached booking information. Changes will sync when you
              come back online.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4">
        {itineraries.map((itinerary) => (
          <ItineraryCard key={itinerary.bookingId} itinerary={itinerary} />
        ))}
      </div>
    </div>
  );
}

interface ItineraryCardProps {
  itinerary: CachedItinerary;
}

function ItineraryCard({ itinerary }: ItineraryCardProps) {
  const { booking } = itinerary;
  const departureTime = new Date(booking.departureTime);
  const arrivalTime = new Date(booking.arrivalTime);
  const cachedTime = new Date(itinerary.cachedAt);

  const duration = Math.round(
    (arrivalTime.getTime() - departureTime.getTime()) / (1000 * 60),
  );
  const hours = Math.floor(duration / 60);
  const minutes = duration % 60;

  return (
    <div className="border rounded-lg p-6 hover:shadow-lg transition-shadow bg-white">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="bg-blue-100 rounded-full p-2">
            <Plane className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-sm text-gray-600">
              {booking.airline} • {booking.flightNumber}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Booking ID: {booking.id}
            </p>
          </div>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-sm font-medium ${
            booking.status === "confirmed"
              ? "bg-green-100 text-green-800"
              : booking.status === "pending"
                ? "bg-yellow-100 text-yellow-800"
                : "bg-red-100 text-red-800"
          }`}
        >
          {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
        </span>
      </div>

      {/* Flight Details */}
      <div className="grid grid-cols-3 gap-4 mb-6 pb-6 border-b">
        {/* Departure */}
        <div>
          <p className="text-2xl font-bold text-gray-900">
            {departureTime.toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })}
          </p>
          <p className="text-sm text-gray-600 flex items-center gap-1 mt-1">
            <MapPin className="w-4 h-4" />
            {booking.from}
          </p>
        </div>

        {/* Duration */}
        <div className="flex flex-col items-center justify-center">
          <p className="text-xs text-gray-600 mb-1">
            {hours}h {minutes}m
          </p>
          <div className="flex items-center gap-2 w-full">
            <div className="h-0.5 flex-1 bg-gray-300" />
            <Clock className="w-4 h-4 text-gray-400" />
            <div className="h-0.5 flex-1 bg-gray-300" />
          </div>
        </div>

        {/* Arrival */}
        <div className="text-right">
          <p className="text-2xl font-bold text-gray-900">
            {arrivalTime.toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })}
          </p>
          <p className="text-sm text-gray-600 flex items-center justify-end gap-1 mt-1">
            {booking.to}
            <MapPin className="w-4 h-4" />
          </p>
        </div>
      </div>

      {/* Trip Details */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-xs text-gray-600 uppercase tracking-wide">Date</p>
          <p className="text-sm font-semibold text-gray-900 mt-1">
            {departureTime.toLocaleDateString("en-US", {
              weekday: "short",
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-600 uppercase tracking-wide">
            Passengers
          </p>
          <p className="text-sm font-semibold text-gray-900 mt-1">
            {booking.passengers}{" "}
            {booking.passengers === 1 ? "Passenger" : "Passengers"}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-600 uppercase tracking-wide">
            Total Price
          </p>
          <p className="text-sm font-semibold text-gray-900 mt-1">
            ${booking.totalPrice.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-600 uppercase tracking-wide">
            Cached
          </p>
          <p className="text-sm font-semibold text-gray-900 mt-1">
            {cachedTime.toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      </div>

      {/* Footer */}
      <p className="text-xs text-gray-500">
        Booking made:{" "}
        {new Date(booking.bookingDate).toLocaleDateString("en-US")}
      </p>
    </div>
  );
}
