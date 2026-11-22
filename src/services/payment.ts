import { Request, Response } from 'express';

const processedEvents = new Set<string>();

export async function handlePaymentCallback(req: Request, res: Response): Promise<void> {
  const eventId = req.body?.eventId || req.headers['x-event-id'];
  if (!eventId) {
    res.status(400).json({ error: 'Missing event ID' });
    return;
  }
  if (processedEvents.has(eventId)) {
    res.status(200).json({ status: 'already_processed' });
    return;
  }
  processedEvents.add(eventId);
  // Process payment fulfillment logic here
  res.status(200).json({ status: 'success' });
}

export async function validateWalletNetwork(network: string, expectedNetwork: string): Promise<boolean> {
  if (network !== expectedNetwork) {
    throw new Error(`Invalid network. Connected to ${network}, but expected ${expectedNetwork}. Please switch your wallet network and try again.`);
  }
  return true;
}
