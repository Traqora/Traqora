import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import * as Sentry from '@sentry/nextjs'
import GlobalError from '@/app/global-error'

jest.mock('@sentry/nextjs', () => ({
  captureException: jest.fn(() => 'event-id-123'),
  showReportDialog: jest.fn(),
}))

describe('GlobalError (issue #334)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('reports the crash to Sentry and opens the feedback dialog', () => {
    const error = Object.assign(new Error('boom'), { digest: 'abc123' })
    render(<GlobalError error={error} reset={jest.fn()} />)

    expect(Sentry.captureException).toHaveBeenCalledWith(error)
    expect(Sentry.showReportDialog).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'event-id-123' }),
    )
  })

  it('renders a fallback message and calls reset when the retry button is clicked', () => {
    const reset = jest.fn()
    render(<GlobalError error={new Error('boom')} reset={reset} />)

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Try again'))
    expect(reset).toHaveBeenCalledTimes(1)
  })

  it('re-reports when a new error is passed in', () => {
    const error1 = new Error('first')
    const { rerender } = render(<GlobalError error={error1} reset={jest.fn()} />)
    expect(Sentry.captureException).toHaveBeenCalledTimes(1)

    const error2 = new Error('second')
    rerender(<GlobalError error={error2} reset={jest.fn()} />)
    expect(Sentry.captureException).toHaveBeenCalledTimes(2)
    expect(Sentry.captureException).toHaveBeenLastCalledWith(error2)
  })
})
