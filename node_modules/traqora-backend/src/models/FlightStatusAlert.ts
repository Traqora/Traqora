import mongoose, { Schema, Document } from 'mongoose';

export type FlightStatusValue = 'on_time' | 'delayed' | 'cancelled' | 'gate_changed' | 'boarding' | 'departed';

export interface IFlightStatusAlert extends Document {
  userId: string;
  flightId: string;
  bookingId?: string;
  isActive: boolean;
  createdAt: Date;
  lastNotifiedAt?: Date;
  lastStatus?: FlightStatusValue;
}

const FlightStatusAlertSchema: Schema = new Schema({
  userId: { type: String, required: true, index: true },
  flightId: { type: String, required: true, index: true },
  bookingId: { type: String },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  lastNotifiedAt: { type: Date },
  lastStatus: {
    type: String,
    enum: ['on_time', 'delayed', 'cancelled', 'gate_changed', 'boarding', 'departed'],
  },
});

// Compound index for efficient querying, mirroring PriceAlert's convention.
FlightStatusAlertSchema.index({ userId: 1, flightId: 1, isActive: 1 });

export default mongoose.model<IFlightStatusAlert>('FlightStatusAlert', FlightStatusAlertSchema);
