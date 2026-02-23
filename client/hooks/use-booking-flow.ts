import { useState, useCallback } from 'react';
import { apiClient, CreateBookingRequest, Booking, generateIdempotencyKey } from '@/lib/api';
import { connectFreighterWallet, signTransactionWithFreighter, WalletConnection } from '@/lib/wallet';
import { toast } from 'sonner';

export type BookingStep = 'details' | 'wallet' | 'payment' | 'signing' | 'submitting' | 'confirming' | 'success' | 'error';

interface UseBookingFlowState {
  step: BookingStep;
  booking: Booking | null;
  wallet: WalletConnection | null;
  unsignedXdr: string | null;
  networkPassphrase: string | null;
  error: string | null;
  isProcessing: boolean;
  processingMessage: string;
}

interface UseBookingFlowActions {
  connectWallet: () => Promise<boolean>;
  createBooking: (request: CreateBookingRequest) => Promise<boolean>;
  signAndSubmitTransaction: () => Promise<boolean>;
  reset: () => void;
  setStep: (step: BookingStep) => void;
}

export const useBookingFlow = (): [UseBookingFlowState, UseBookingFlowActions] => {
  const [state, setState] = useState<UseBookingFlowState>({
    step: 'details',
    booking: null,
    wallet: null,
    unsignedXdr: null,
    networkPassphrase: null,
    error: null,
    isProcessing: false,
    processingMessage: '',
  });

  const setProcessing = useCallback((isProcessing: boolean, message: string = '') => {
    setState(prev => ({ ...prev, isProcessing, processingMessage: message }));
  }, []);

  const setError = useCallback((error: string) => {
    setState(prev => ({ ...prev, error, step: 'error', isProcessing: false }));
    toast.error('Error', { description: error });
  }, []);

  const connectWallet = useCallback(async (): Promise<boolean> => {
    setProcessing(true, 'Connecting to wallet...');
    
    try {
      const wallet = await connectFreighterWallet();
      
      if (!wallet) {
        setError('Failed to connect wallet');
        return false;
      }

      setState(prev => ({
        ...prev,
        wallet,
        step: 'payment',
        isProcessing: false,
      }));

      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to connect wallet');
      return false;
    }
  }, [setProcessing, setError]);

  const createBooking = useCallback(async (request: CreateBookingRequest): Promise<boolean> => {
    setProcessing(true, 'Creating booking...');

    try {
      const idempotencyKey = generateIdempotencyKey();
      const response = await apiClient.createBooking(request, idempotencyKey);

      if (!response.success || !response.data) {
        setError(response.error?.message || 'Failed to create booking');
        return false;
      }

      setState(prev => ({
        ...prev,
        booking: response.data!.data,
        unsignedXdr: response.data!.soroban.unsignedXdr,
        networkPassphrase: response.data!.soroban.networkPassphrase,
        step: 'signing',
        isProcessing: false,
      }));

      toast.success('Booking created', {
        description: 'Please sign the transaction in your wallet',
      });

      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to create booking');
      return false;
    }
  }, [setProcessing, setError]);

  const signAndSubmitTransaction = useCallback(async (): Promise<boolean> => {
    if (!state.booking || !state.unsignedXdr || !state.networkPassphrase) {
      setError('Missing booking or transaction data');
      return false;
    }

    setProcessing(true, 'Waiting for signature...');

    try {
      // Sign transaction with wallet
      const signedXdr = await signTransactionWithFreighter(
        state.unsignedXdr,
        state.networkPassphrase
      );

      if (!signedXdr) {
        setError('Transaction signing cancelled or failed');
        return false;
      }

      setProcessing(true, 'Submitting transaction to blockchain...');

      // Submit signed transaction
      const response = await apiClient.submitSignedTransaction(
        state.booking.id,
        signedXdr
      );

      if (!response.success || !response.data) {
        setError(response.error?.message || 'Failed to submit transaction');
        return false;
      }

      setState(prev => ({
        ...prev,
        booking: response.data!,
        step: 'confirming',
        isProcessing: false,
      }));

      toast.success('Transaction submitted', {
        description: 'Waiting for blockchain confirmation...',
      });

      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to sign or submit transaction');
      return false;
    }
  }, [state.booking, state.unsignedXdr, state.networkPassphrase, setProcessing, setError]);

  const reset = useCallback(() => {
    setState({
      step: 'details',
      booking: null,
      wallet: null,
      unsignedXdr: null,
      networkPassphrase: null,
      error: null,
      isProcessing: false,
      processingMessage: '',
    });
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
      reset,
      setStep,
    },
  ];
};
