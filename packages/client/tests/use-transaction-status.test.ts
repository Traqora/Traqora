import { renderHook, act, waitFor } from '@testing-library/react'
import { useTransactionStatus } from '../hooks/use-transaction-status'
import { apiClient, BookingTransactionStatusResponse } from '../lib/api'

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { toast } = jest.requireMock('sonner')

function pendingStatus(): BookingTransactionStatusResponse {
  return { bookingStatus: 'onchain_submitted', transactionStatus: { status: 'pending' } }
}

function successStatus(): BookingTransactionStatusResponse {
  return { bookingStatus: 'confirmed', transactionStatus: { status: 'success' } }
}

function failedStatus(): BookingTransactionStatusResponse {
  return { bookingStatus: 'failed', transactionStatus: { status: 'failed', error: 'insufficient balance' } }
}

describe('useTransactionStatus', () => {
  beforeEach(() => {
    jest.restoreAllMocks()
    jest.clearAllMocks()
  })

  it('does nothing when bookingId is null', () => {
    const spy = jest.spyOn(apiClient, 'getTransactionStatus')
    const { result } = renderHook(() => useTransactionStatus({ bookingId: null }))

    expect(spy).not.toHaveBeenCalled()
    expect(result.current.isPolling).toBe(false)
  })

  it('stops polling and calls onSuccess when the transaction succeeds', async () => {
    jest.spyOn(apiClient, 'getTransactionStatus').mockResolvedValue({ success: true, data: successStatus() })
    const onSuccess = jest.fn()

    const { result } = renderHook(() =>
      useTransactionStatus({ bookingId: 'booking-1', pollingInterval: 1000, onSuccess }),
    )

    await waitFor(() => expect(result.current.isPolling).toBe(false))

    expect(result.current.status?.bookingStatus).toBe('confirmed')
    expect(result.current.error).toBeNull()
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalled()
  })

  it('stops polling and calls onError when the transaction fails', async () => {
    jest.spyOn(apiClient, 'getTransactionStatus').mockResolvedValue({ success: true, data: failedStatus() })
    const onError = jest.fn()

    const { result } = renderHook(() =>
      useTransactionStatus({ bookingId: 'booking-2', pollingInterval: 1000, onError }),
    )

    await waitFor(() => expect(result.current.isPolling).toBe(false))

    expect(result.current.error).toBe('insufficient balance')
    expect(onError).toHaveBeenCalledWith('insufficient balance')
    expect(toast.error).toHaveBeenCalled()
  })

  it('times out and calls onError after maxAttempts of a pending status', async () => {
    jest.spyOn(apiClient, 'getTransactionStatus').mockResolvedValue({ success: true, data: pendingStatus() })
    const onError = jest.fn()

    const { result } = renderHook(() =>
      useTransactionStatus({ bookingId: 'booking-3', pollingInterval: 5, maxAttempts: 1, onError }),
    )

    await waitFor(() => expect(result.current.isPolling).toBe(false), { timeout: 3000 })

    expect(result.current.error).toMatch(/timed out/i)
    expect(onError).toHaveBeenCalled()
    expect(toast.warning).toHaveBeenCalled()
  })

  it('refetch resets the attempt counter and fetches again', async () => {
    const spy = jest.spyOn(apiClient, 'getTransactionStatus').mockResolvedValue({ success: true, data: pendingStatus() })

    const { result } = renderHook(() =>
      useTransactionStatus({ bookingId: 'booking-4', pollingInterval: 100000, maxAttempts: 60 }),
    )

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1))

    await act(async () => {
      await result.current.refetch()
    })

    expect(spy).toHaveBeenCalledTimes(2)
  })
})
