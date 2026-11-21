import { render, screen } from '@testing-library/react'
import { TransactionStatusTracker } from '@/components/transaction-status-tracker'
import { useTransactionStatus } from '@/hooks/use-transaction-status'
import { announce } from '@/lib/accessibility'
import type { BookingTransactionStatusResponse } from '@/lib/api'

jest.mock('@/hooks/use-transaction-status', () => ({
  useTransactionStatus: jest.fn(),
}))

jest.mock('@/lib/accessibility', () => ({
  announce: jest.fn(),
}))

jest.mock('@/lib/wallet', () => ({
  getStellarExpertUrl: jest.fn(
    (txHash: string, network: 'testnet' | 'mainnet' = 'testnet') =>
      `https://stellar.expert/explorer/${network}/tx/${txHash}`,
  ),
}))

const mockedUseTransactionStatus = useTransactionStatus as jest.MockedFunction<
  typeof useTransactionStatus
>

function mockHook(
  overrides: Partial<ReturnType<typeof useTransactionStatus>> = {},
) {
  mockedUseTransactionStatus.mockReturnValue({
    status: null,
    isPolling: false,
    error: null,
    refetch: jest.fn(),
    stopPolling: jest.fn(),
    ...overrides,
  })
}

function confirmedStatus(): BookingTransactionStatusResponse {
  return {
    bookingStatus: 'confirmed',
    transactionStatus: { status: 'success', txHash: 'abc123def456' },
  }
}

function failedStatus(): BookingTransactionStatusResponse {
  return {
    bookingStatus: 'failed',
    transactionStatus: { status: 'failed', error: 'insufficient balance' },
  }
}

describe('TransactionStatusTracker booking confirmation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('shows the initializing state while there is no transaction status yet', () => {
    mockHook()

    render(<TransactionStatusTracker bookingId="booking-1" />)

    expect(screen.getByText('Initializing transaction...')).toBeInTheDocument()
  })

  it('shows the pending state while waiting for blockchain confirmation', () => {
    mockHook({
      status: { bookingStatus: 'onchain_submitted', transactionStatus: { status: 'pending' } },
      isPolling: true,
    })

    render(<TransactionStatusTracker bookingId="booking-1" />)

    expect(screen.getByText('Waiting for blockchain confirmation...')).toBeInTheDocument()
    expect(screen.getByText('Checking transaction status...')).toBeInTheDocument()
  })

  it('confirms the booking, announces it, and calls onSuccess when the transaction succeeds', () => {
    const onSuccess = jest.fn()
    mockHook({ status: confirmedStatus(), isPolling: false })

    render(<TransactionStatusTracker bookingId="booking-1" onSuccess={onSuccess} />)

    expect(
      screen.getByText('Transaction confirmed on blockchain!'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Your booking has been confirmed and recorded on the Stellar blockchain\./),
    ).toBeInTheDocument()
    expect(
      screen.getByText('View on Stellar Expert'),
    ).toBeInTheDocument()
    expect(announce).toHaveBeenCalledWith('Transaction confirmed on blockchain', 'polite')
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('shows the failure message and calls onError when the transaction fails', () => {
    const onError = jest.fn()
    mockHook({ status: failedStatus(), isPolling: false })

    render(<TransactionStatusTracker bookingId="booking-1" onError={onError} />)

    expect(screen.getAllByText('insufficient balance')).toHaveLength(2)
    expect(onError).toHaveBeenCalledWith('insufficient balance')
  })

  it('renders a destructive alert when the status check itself errors', () => {
    mockHook({ error: 'Network error' })

    render(<TransactionStatusTracker bookingId="booking-1" />)

    expect(screen.getByText('Network error')).toBeInTheDocument()
  })
})