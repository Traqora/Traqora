import { act, renderHook } from '@testing-library/react';
import {
  Account,
  BASE_FEE,
  Contract,
  Networks,
  TransactionBuilder,
  nativeToScVal,
} from '@stellar/stellar-sdk';

const mockSignTransaction = jest.fn();
const mockGetActiveWalletContext = jest.fn();
const mockCreateBooking = jest.fn();
const mockSubmitSignedTransaction = jest.fn();
const mockGenerateIdempotencyKey = jest.fn(() => 'idem-1');
const mockAddPendingSync = jest.fn();
const mockWalletState: {
  address: string;
  network: 'testnet' | 'mainnet' | '';
  walletType: string;
  isConnected: boolean;
  publicKey: string;
} = {
  address: 'GDMVEPX5MQV3OFOSNOXQTBFZLX72HCNJ5QHLBWBQKRQTAOFT3LHLPW7U',
  network: 'testnet',
  walletType: 'Freighter',
  isConnected: true,
  publicKey: 'GDMVEPX5MQV3OFOSNOXQTBFZLX72HCNJ5QHLBWBQKRQTAOFT3LHLPW7U',
};

jest.mock('@/lib/stellar-wallet-connect', () => ({
  useWalletStore: { getState: () => mockWalletState },
  signTransaction: (...args: unknown[]) => mockSignTransaction(...args),
  getActiveWalletContext: (...args: unknown[]) => mockGetActiveWalletContext(...args),
}));

jest.mock('@/lib/api', () => ({
  apiClient: {
    createBooking: (...args: unknown[]) => mockCreateBooking(...args),
    submitSignedTransaction: (...args: unknown[]) => mockSubmitSignedTransaction(...args),
  },
  generateIdempotencyKey: () => mockGenerateIdempotencyKey(),
}));

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

jest.mock('@/lib/offline-storage', () => ({
  addPendingSync: (...args: unknown[]) => mockAddPendingSync(...args),
}));

import { useBookingFlow } from '@/hooks/use-booking-flow';

const BOOKING_ID = 'booking-1';
const CONTRACT_ID = 'CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526';

function unsignedXdr(): string {
  return new TransactionBuilder(new Account(mockWalletState.address, '0'), {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      new Contract(CONTRACT_ID).call(
        'create_booking',
        nativeToScVal(1, { type: 'u64' }),
      ),
    )
    .setTimeout(300)
    .build()
    .toXDR();
}

const createResponse = (xdr: string) => ({
  success: true,
  data: {
    data: {
      id: BOOKING_ID,
      flightId: 'flight-1',
      status: 'pending',
      price: '450',
      currency: 'USDC',
    },
    soroban: {
      unsignedXdr: xdr,
      networkPassphrase: Networks.TESTNET,
      simulation: {
        status: 'success',
        minResourceFee: '5000',
        latestLedger: 12345,
        cost: { cpuIns: '1000', memBytes: '2048' },
      },
    },
  },
});

async function createBookingInHook(
  result: { current: ReturnType<typeof useBookingFlow> },
  xdr: string,
) {
  mockCreateBooking.mockResolvedValueOnce(createResponse(xdr));
  await act(async () => {
    const ok = await result.current[1].createBooking({
      flightId: 'flight-1',
      passengerCount: 1,
      walletAddress: mockWalletState.address,
    });
    expect(ok).toBe(true);
  });
}

describe('useBookingFlow wallet approval flow (#936/#937/#938)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWalletState.isConnected = true;
    mockGetActiveWalletContext.mockResolvedValue({
      address: mockWalletState.address,
      network: 'testnet',
    });
    mockSubmitSignedTransaction.mockResolvedValue({
      success: true,
      data: {
        id: BOOKING_ID,
        flightId: 'flight-1',
        status: 'confirmed',
        price: '450',
        currency: 'USDC',
      },
    });
  });

  it('prepares a safe simulation summary before asking the wallet to sign', async () => {
    const { result } = renderHook(() => useBookingFlow());
    await createBookingInHook(result, unsignedXdr());

    expect(result.current[0].step).toBe('signing');
    expect(result.current[0].transactionSummary).toMatchObject({
      contractAction: 'create_booking',
      contractId: CONTRACT_ID,
      network: 'testnet',
      estimatedFeeStroops: 5100,
      estimatedFeeXlm: '0.00051',
    });
    expect(result.current[0].transactionSummary?.simulation.success).toBe(true);
    expect(mockSignTransaction).not.toHaveBeenCalled();
  });

  it('coalesces duplicate signing requests so the wallet and backend are called once', async () => {
    const { result } = renderHook(() => useBookingFlow());
    await createBookingInHook(result, unsignedXdr());
    mockSignTransaction.mockResolvedValue('signed-xdr');

    let first: Promise<boolean> = Promise.resolve(false);
    let second: Promise<boolean> = Promise.resolve(false);

    await act(async () => {
      first = result.current[1].signAndSubmitTransaction();
      second = result.current[1].signAndSubmitTransaction();
      await Promise.all([first, second]);
    });

    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
    expect(mockSignTransaction).toHaveBeenCalledTimes(1);
    expect(mockSubmitSignedTransaction).toHaveBeenCalledTimes(1);
    expect(result.current[0].step).toBe('confirming');
  });

  it('keeps checkout intact after a rejection and retries without creating a second booking', async () => {
    const { result } = renderHook(() => useBookingFlow());
    await createBookingInHook(result, unsignedXdr());

    mockSignTransaction.mockRejectedValueOnce(new Error('User declined the transaction'));

    await act(async () => {
      const ok = await result.current[1].signAndSubmitTransaction();
      expect(ok).toBe(false);
    });

    expect(result.current[0].step).toBe('signing');
    expect(result.current[0].booking?.id).toBe(BOOKING_ID);
    expect(result.current[0].unsignedXdr).toBeTruthy();
    expect(result.current[0].signatureRejected).toBe(true);
    expect(result.current[0].canRetrySignature).toBe(true);
    expect(result.current[0].isProcessing).toBe(false);
    expect(mockCreateBooking).toHaveBeenCalledTimes(1);

    mockSignTransaction.mockResolvedValueOnce('signed-xdr');

    await act(async () => {
      const ok = await result.current[1].retrySignature();
      expect(ok).toBe(true);
    });

    expect(result.current[0].step).toBe('confirming');
    expect(result.current[0].signatureRejected).toBe(false);
    expect(result.current[0].canRetrySignature).toBe(false);
    expect(mockCreateBooking).toHaveBeenCalledTimes(1);
    expect(mockSubmitSignedTransaction).toHaveBeenCalledTimes(1);
  });

  it('restores the checkout and allows a retry after the wallet times out', async () => {
    const { result } = renderHook(() => useBookingFlow());
    await createBookingInHook(result, unsignedXdr());

    mockSignTransaction.mockImplementationOnce(() => new Promise(() => {}));

    await act(async () => {
      const ok = await result.current[1].signAndSubmitTransaction({ timeoutMs: 20 });
      expect(ok).toBe(false);
    });

    expect(result.current[0].step).toBe('signing');
    expect(result.current[0].signingStatus).toBe('timeout');
    expect(result.current[0].canRetrySignature).toBe(true);
    expect(result.current[0].isProcessing).toBe(false);
    expect(result.current[0].booking?.id).toBe(BOOKING_ID);

    mockSignTransaction.mockResolvedValueOnce('signed-xdr');
    await act(async () => {
      const ok = await result.current[1].retrySignature();
      expect(ok).toBe(true);
    });

    expect(result.current[0].step).toBe('confirming');
    expect(mockSubmitSignedTransaction).toHaveBeenCalledTimes(1);
  });
});
