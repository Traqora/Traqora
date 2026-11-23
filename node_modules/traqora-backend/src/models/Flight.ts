import mongoose, { Schema, Document } from 'mongoose';

export interface IFlight extends Document {
  flightNumber: string;
  airline: string;
  origin: string;
  destination: string;
  departureTime: Date;
  arrivalTime: Date;
  basePrice: number;
  currency: string;
  isActive: boolean;
}

const FlightSchema: Schema = new Schema({
  flightNumber: { type: String, required: true, unique: true, index: true },
  airline: { type: String, required: true },
  origin: { type: String, required: true, index: true },
  destination: { type: String, required: true, index: true },
  departureTime: { type: Date, required: true },
  arrivalTime: { type: Date, required: true },
  basePrice: { type: Number, required: true },
  currency: { type: String, default: 'USD' },
  isActive: { type: Boolean, default: true }
});

export default mongoose.model<IFlight>('Flight', FlightSchema);
