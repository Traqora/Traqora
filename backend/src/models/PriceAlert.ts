import mongoose, { Schema, Document } from 'mongoose';

export interface IPriceAlert extends Document {
  userId: string;
  flightId: string;
  targetPrice: number;
  currency: string;
  notificationMethod: 'email' | 'push' | 'both';
  isActive: boolean;
  createdAt: Date;
  lastNotifiedAt?: Date;
}

const PriceAlertSchema: Schema = new Schema({
  userId: { type: String, required: true, index: true },
  flightId: { type: String, required: true, index: true },
  targetPrice: { type: Number, required: true },
  currency: { type: String, required: true, default: 'USD' },
  notificationMethod: { type: String, enum: ['email', 'push', 'both'], default: 'email' },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  lastNotifiedAt: { type: Date }
});

export default mongoose.model<IPriceAlert>('PriceAlert', PriceAlertSchema);
