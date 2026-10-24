import { useState, useCallback, useRef } from "react";
import { apiClient, CreateBookingRequest, Booking, generateIdempotencyKey } from "@/lib/api";
import type { WalletConnection } from "@/lib/wallet";
import { getActiveWalletContext, useWalletStore, signTransaction } from "@/lib/stellar-wallet-connect";
import { toast } from "sonner";
import { addPendingSync } from "@/lib/offline-storage";
import { walletContextMatches } from "@/lib/wallet-context";
import {
  buildWalletTransactionSummary,
  type WalletTransactionSummary,
} from "@/lib/wallet-transaction";
import {
  SigningRequestBusyError,
  SigningRequestGate,
  SigningRequestTimeoutError,
  isWalletSignatureRejection,
  type SigningRequestOptions,
} from "@/lib/signing-request-gate";

export type BookingStep = 'details' | 'wallet' | 'payment' | 'signing' | 'submitting' | 'confirming' | 'success' | 'error';

export type SigningStatus =
  | 'idle'
  | 'pending'
  | 'success'
  | 'rejected'
  | 'timeout'
  | 'error';

interface UseBookingFlowState {
  step: BookingStep;
  booking: Booking | null;
  wallet: WalletConnection | null;
  unsignedXdr: string | null;
  networkPassphrase: string | null;
  transactionSummary: WalletTransactionSummary | null;
  error: string | null;
  isProcessing: boolean;
  processingMessage: string;
  signingStatus: SigningStatus;
  /** True only when the user actively rejected the wallet prompt. */
  signatureRejected: boolean;
  /** Retrying re-uses the existing booking and unsigned transaction. */
  canRetrySignature: boolean;
}

interface UseBookingFlowActions {
  connectWallet: () => Promise<boolean>;
  createBooking: (request: CreateBookingRequest) => Promise<boolean>;
  signAndSubmitTransaction: (options?: SigningRequestOptions) => Promise<boolean>;
  retrySignature: (options?: SigningRequestOptions) => Promise<boolean>;
  clearSignatureState: () => void;
  reset: () => void;
  setStep: (step: BookingStep) => void;
}

const INITIAL_STATE: UseBookingFlowState = {
  step: 'details',
  booking: null,
  wallet: null,
  unsignedXdr: null,
  networkPassphrase: null,
  transactionSummary: null,
  error: null,
  isProcessing: false,
  processingMessage: '',
  signingStatus: 'idle',
  signatureRejected: false,
  canRetrySignature: false,
};

const errorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    if (typeof record.message === 'string' && record.message) return record.message;
    if (typeof record.error === 'string' && record.error) return record.error;
  }
  return fallback;
};

export const useBookingFlow = (): [UseBookingFlowState, UseBookingFlowActions] => {
  const [state, setState] = useState<UseBookingFlowState>(INITIAL_STATE);
  const signingGate = useRef<SigningRequestGate | null>(null);
  if (!signingGate.current) {
    signingGate.current = new SigningRequestGate();
  }

  const setProcessing = useCallback((isProcessing: boolean, message: string = '') => {
    setState(prev => ({ ...prev, isProcessing, processingMessage: message }));
  }, []);

  const setError = useCallback((error: string) => {
    setState(prev => ({
      ...prev,
      error,
      step: 'error',
      isProcessing: false,
      processingMessage: '',
    }));
    toast.error('Error', { description: error });
  }, []);

  const connectWallet = useCallback(async (): Promise<boolean> => {
    setProcessing(true, 'Checking wallet connection...');

    try {
      const storeState = useWalletStore.getState();

      if (!storeState.isConnected || !storeState.address) {
        setError('No wallet connected. Please connect your wallet first.');
        return false;
      }

      const wallet: WalletConnection = {
        publicKey: storeState.address,
        isConnected: true,
        walletType: (storeState.walletType as WalletConnection['walletType']) || null,
      };

      setState(prev => ({
        ...prev,
        wallet,
        step: 'payment',
        isProcessing: false,
        processingMessage: '',
        error: null,
      }));

      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to connect wallet');
      return false;
    }
  }, [setProcessing, setError]);

  const createBooking = useCallback(async (request: CreateBookingRequest): Promise<boolean> => {
    setProcessing(true, 'Creating booking...');

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      addPendingSync('booking', request);
      setError('You are offline. Your booking has been saved and will be processed when you reconnect.');
      return false;
    }

    try {
      const idempotencyKey = generateIdempotencyKey();
      const response = await apiClient.createBooking(request, idempotencyKey);

      if (!response.success || !response.data) {
        setError(response.error?.message || 'Failed to create booking');
        return false;
      }

      const payload = response.data as any;
      const booking: Booking = payload?.data ?? payload;
      const soroban = payload?.soroban ?? payload?.data?.soroban ?? payload;
      const unsignedXdr: string | null =
        soroban?.unsignedXdr ?? payload?.unsignedXdr ?? null;
      const networkPassphrase: string | null =
        soroban?.networkPassphrase ?? payload?.networkPassphrase ?? null;
      const simulation = soroban?.simulation ?? soroban?.simulationResult ?? null;

      let transactionSummary: WalletTransactionSummary | null = null;
      if (unsignedXdr && networkPassphrase) {
        try {
          transactionSummary = buildWalletTransactionSummary({
            unsignedXdr,
            networkPassphrase,
            simulation,
          });
        } catch (summaryError) {
          setError(
            errorMessage(
              summaryError,
              'Unable to prepare a safe transaction summary. Please try again.',
            ),
          );
          return false;
        }
      }

      setState(prev => ({
        ...prev,
        booking,
        unsignedXdr,
        networkPassphrase,
        transactionSummary,
        step: 'signing',
        isProcessing: false,
        processingMessage: '',
        error: null,
        signingStatus: 'idle',
        signatureRejected: false,
        canRetrySignature: false,
      }));

      toast.success('Booking created', {
        description: transactionSummary
          ? 'Review the contract action and network fee before approving in your wallet.'
          : 'Please review the transaction before approving in your wallet.',
      });

      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to create booking');
      return false;
    }
  }, [setProcessing, setError]);

  const handleSignatureFailure = useCallback((error: unknown) => {
    if (
      error instanceof SigningRequestBusyError ||
      (error && typeof error === 'object' && (error as { code?: string }).code === 'SIGNING_BUSY')
    ) {
      toast.info('Signature already in progress', {
        description: 'Finish or cancel the wallet prompt that is already open.',
      });
      return;
    }

    const timedOut =
      error instanceof SigningRequestTimeoutError ||
      (error && typeof error === 'object' && (error as { code?: string }).code === 'SIGNING_TIMEOUT');
    const rejected = isWalletSignatureRejection(error);
    const message = errorMessage(error, 'Failed to sign or submit transaction');

    setState(prev => {
      const keepCheckout = Boolean(prev.booking && prev.unsignedXdr);

      if (timedOut) {
        return {
          ...prev,
          step: keepCheckout ? 'signing' : 'error',
          isProcessing: false,
          processingMessage: '',
          signingStatus: 'timeout',
          signatureRejected: false,
          canRetrySignature: keepCheckout,
          error:
            'The wallet did not respond in time. Your booking and itinerary are saved — retry signing when ready.',
        };
      }

      if (rejected) {
        return {
          ...prev,
          step: keepCheckout ? 'signing' : 'error',
          isProcessing: false,
          processingMessage: '',
          signingStatus: 'rejected',
          signatureRejected: true,
          canRetrySignature: keepCheckout,
          error:
            'Signature request was rejected. Your booking and itinerary are saved — retry signing when ready.',
        };
      }

      return {
        ...prev,
        step: keepCheckout ? 'signing' : 'error',
        isProcessing: false,
        processingMessage: '',
        signingStatus: 'error',
        signatureRejected: false,
        canRetrySignature: keepCheckout,
        error: message,
      };
    });

    if (timedOut) {
      toast.error('Wallet request timed out', {
        description: 'Your checkout is safe. You can retry the signature without creating another booking.',
      });
    } else if (rejected) {
      toast.error('Signature rejected', {
        description: 'Your checkout is still here. Retry signing when you are ready.',
      });
    } else {
      toast.error('Error', { description: message });
    }
  }, []);

  const signAndSubmitTransaction = useCallback(async (
    options: SigningRequestOptions = {},
  ): Promise<boolean> => {
    const booking = state.booking;
    const unsignedXdr = state.unsignedXdr;
    const networkPassphrase = state.networkPassphrase;

    if (!booking || !unsignedXdr || !networkPassphrase) {
      setError('Missing booking or transaction data');
      return false;
    }

    if (state.step === 'confirming' || state.step === 'success') {
      return false;
    }

    const gate = signingGate.current!;
    const signingKey = `${booking.id}:${unsignedXdr}`;

    try {
      return await gate.run(signingKey, async (signal) => {
        setState(prev => ({
          ...prev,
          isProcessing: true,
          processingMessage: 'Waiting for signature...',
          error: null,
          signingStatus: 'pending',
          signatureRejected: false,
          canRetrySignature: false,
        }));

        try {
          const storeState = useWalletStore.getState();
          let signedXdr: string;
          try {
            signedXdr = await signTransaction({
              unsignedTransaction: unsignedXdr,
              address: storeState.address,
            });
          } catch (signError) {
            if (signal.aborted) {
              throw signal.reason instanceof Error
                ? signal.reason
                : new SigningRequestTimeoutError(options.timeoutMs ?? 0);
            }
            throw signError;
          }

          // The wallet may have approved after the UI timed out. Never submit a
          // late signature in that case.
          if (signal.aborted) {
            throw signal.reason instanceof Error
              ? signal.reason
              : new SigningRequestTimeoutError(options.timeoutMs ?? 0);
          }

          const currentStoreState = useWalletStore.getState();
          let activeContext: { address: string; network: 'testnet' | 'mainnet' | '' };
          try {
            activeContext = await getActiveWalletContext();
          } catch {
            throw new Error(
              'Unable to verify the active wallet after signing. Please reconnect and try again.',
            );
          }

          const activeAddress = activeContext.address || currentStoreState.address;
          const activeNetwork = activeContext.network || currentStoreState.network;
          const expectedNetwork = networkPassphrase.includes('Test SDF') ? 'testnet' : 'mainnet';
          const expectedAddress = state.wallet?.publicKey || currentStoreState.address;

          if (!walletContextMatches({
            isConnected: currentStoreState.isConnected,
            expectedAddress,
            expectedNetwork,
            activeAddress,
            activeNetwork,
          })) {
            throw new Error(
              'Wallet account or network changed while signing. Please reconnect and try again.',
            );
          }

          setProcessing(true, 'Submitting transaction to blockchain...');

          if (typeof navigator !== 'undefined' && !navigator.onLine) {
            addPendingSync('booking', { bookingId: booking.id, signedXdr });
            setState(prev => ({
              ...prev,
              isProcessing: false,
              processingMessage: '',
              signingStatus: 'error',
              error:
                'You are offline. Your transaction has been saved and will be submitted when you reconnect.',
            }));
            return false;
          }

          const response = await apiClient.submitSignedTransaction(booking.id, signedXdr);

          if (!response.success || !response.data) {
            throw new Error(response.error?.message || 'Failed to submit transaction');
          }

          const updatedBooking = (response.data as any)?.data ?? response.data;

          setState(prev => ({
            ...prev,
            booking: updatedBooking,
            step: 'confirming',
            isProcessing: false,
            processingMessage: '',
            error: null,
            signingStatus: 'success',
            signatureRejected: false,
            canRetrySignature: false,
          }));

          toast.success('Transaction submitted', {
            description: 'Waiting for blockchain confirmation...',
          });

          return true;
        } catch (error) {
          handleSignatureFailure(error);
          return false;
        }
      }, { timeoutMs: options.timeoutMs });
    } catch (error) {
      // Gate-level failures (busy or timeout) happen outside the operation's
      // own catch block.
      handleSignatureFailure(error);
      return false;
    }
  }, [
    state.booking,
    state.unsignedXdr,
    state.networkPassphrase,
    state.wallet,
    state.step,
    setProcessing,
    setError,
    handleSignatureFailure,
  ]);

  const retrySignature = useCallback(
    (options?: SigningRequestOptions) => signAndSubmitTransaction(options),
    [signAndSubmitTransaction],
  );

  const clearSignatureState = useCallback(() => {
    setState(prev => ({
      ...prev,
      error: null,
      signingStatus: 'idle',
      signatureRejected: false,
      canRetrySignature: false,
    }));
  }, []);

  const reset = useCallback(() => {
    signingGate.current?.reset();
    setState(INITIAL_STATE);
  }, []);

  const setStep = useCallback((step: BookingStep) => {
    setState(prev => ({ ...prev, step }));
  }, []);

  return [
    state,
    {
      connectWallet,
      createBooking,
      signAndSubmitTransaction,
      retrySignature,
      clearSignatureState,
      reset,
      setStep,
    },
  ];
};
