import { config } from '../config';

// NOTE: This service intentionally keeps Soroban interaction minimal and client-signed.
// The backend constructs an unsigned XDR and later submits the client-signed XDR.

export type UnsignedSorobanTx = {
  xdr: string;
};

export const buildCreateBookingUnsignedXdr = async (params: {
  passenger: string;
  airline: string;
  flightNumber: string;
  fromAirport: string;
  toAirport: string;
  departureTime: number;
  price: bigint;
  token: string;
}): Promise<UnsignedSorobanTx> => {
  // Placeholder: soroban-client integration should construct a Soroban invocation transaction.
  // We still return a deterministic dummy XDR for now, so the API and tests can proceed.
  // Replace this with soroban-client transaction building using config.sorobanRpcUrl and config.contracts.booking.
  const payload = JSON.stringify({ contract: config.contracts.booking, ...params });
  const xdr = Buffer.from(payload, 'utf8').toString('base64');
  return { xdr };
};

export const submitSignedSorobanXdr = async (signedXdr: string): Promise<{ txHash: string; bookingId?: string }> => {
  // Placeholder: submit transaction using soroban-client.
  // Return a stable hash so retries are idempotent.
  const txHash = '0x' + Buffer.from(signedXdr, 'utf8').toString('hex').slice(0, 64);
  return { txHash };
};
