import mongoose, { Schema, Document } from 'mongoose';

export interface IPriceHistory extends Document {
  flightId: string;
  price: number;
  currency: string;
  timestamp: Date;
  source: string;
}

const PriceHistorySchema: Schema = new Schema({
  flightId: { type: String, required: true, index: true },
  price: { type: Number, required: true },
  currency: { type: String, required: true, default: 'USD' },
  timestamp: { type: Date, default: Date.now, index: true },
  source: { type: String, required: true }
});

// Compound index for efficient querying of history for a specific flight
PriceHistorySchema.index({ flightId: 1, timestamp: -1 });

export default mongoose.model<IPriceHistory>('PriceHistory', PriceHistorySchema);
