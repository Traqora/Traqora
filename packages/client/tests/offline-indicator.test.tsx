import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { OfflineIndicator, OnlineIndicator } from '@/components/offline-indicator'

const useOfflineMock = jest.fn()

jest.mock('@/components/offline-provider', () => ({
  useOffline: () => useOfflineMock(),
}))

describe('OfflineIndicator', () => {
  beforeEach(() => {
    useOfflineMock.mockReset()
  })

  it('renders nothing while online with no pending syncs', async () => {
    useOfflineMock.mockReturnValue({ isOnline: true, hasPendingSyncs: false })
    const { container } = render(<OfflineIndicator />)
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('shows an offline message when disconnected', async () => {
    useOfflineMock.mockReturnValue({ isOnline: false, hasPendingSyncs: false })
    render(<OfflineIndicator />)
    expect(await screen.findByText(/you are offline/i)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
  })

  it('shows a syncing message when online with pending syncs', async () => {
    useOfflineMock.mockReturnValue({ isOnline: true, hasPendingSyncs: true })
    render(<OfflineIndicator />)
    expect(await screen.findByText(/syncing offline changes/i)).toBeInTheDocument()
  })
})

describe('OnlineIndicator', () => {
  beforeEach(() => {
    useOfflineMock.mockReset()
  })

  it('shows Online when connected', async () => {
    useOfflineMock.mockReturnValue({ isOnline: true })
    render(<OnlineIndicator />)
    expect(await screen.findByText('Online')).toBeInTheDocument()
  })

  it('shows Offline when disconnected', async () => {
    useOfflineMock.mockReturnValue({ isOnline: false })
    render(<OnlineIndicator />)
    expect(await screen.findByText('Offline')).toBeInTheDocument()
  })
})
