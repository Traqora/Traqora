import Stripe from 'stripe';

const apiKey = process.env.STRIPE_SECRET_KEY || '';

export const stripe = new Stripe(apiKey, {
  apiVersion: '2024-06-20',
});

export const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
