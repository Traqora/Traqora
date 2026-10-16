import mongoose, { Schema, Document } from 'mongoose';

export interface IPriceAlert extends Document {
  userId: string;
  flightId: string;
  targetPrice: number;
  currentPrice?: number;
  currency: string;
  notificationMethod: 'email' | 'push' | 'both';
  isActive: boolean;
  createdAt: Date;
  lastNotifiedAt?: Date;
  triggeredCount: number;
}

const PriceAlertSchema: Schema = new Schema({
  userId: { type: String, required: true, index: true },
  flightId: { type: String, required: true, index: true },
  targetPrice: { type: Number, required: true },
  currentPrice: { type: Number },
  currency: { type: String, required: true, default: 'USD' },
  notificationMethod: { type: String, enum: ['email', 'push', 'both'], default: 'email' },
  isActive: { type: Boolean, default: true },
  triggeredCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  lastNotifiedAt: { type: Date },
});

// Compound index for efficient querying
PriceAlertSchema.index({ userId: 1, flightId: 1, isActive: 1 });

export default mongoose.model<IPriceAlert>('PriceAlert', PriceAlertSchema);