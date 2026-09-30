import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import {
  DEFAULT_TIMELOCK_SECONDS,
  formatDuration,
  resolveQuorumTimelockStatus,
  type QuorumTimelockProposal,
} from '@/lib/governance/quorum-timelock-status'
import { QuorumTimelockStatus } from '@/components/governance/quorum-timelock-status'

const HOUR = 60 * 60 * 1000
const votingStart = '2026-09-01T00:00:00.000Z'
const votingEnd = '2026-09-08T00:00:00.000Z'
const endMs = new Date(votingEnd).getTime()

const makeProposal = (overrides: Partial<QuorumTimelockProposal> = {}): QuorumTimelockProposal => ({
  votingStart,
  votingEnd,
  yesVotes: 8000,
  noVotes: 4000,
  quorum: 10000,
  status: 'passed',
  executed: false,
  ...overrides,
})

describe('resolveQuorumTimelockStatus', () => {
  it('reports pending before voting starts', () => {
    const status = resolveQuorumTimelockStatus(makeProposal({ status: 'active' }), new Date('2026-08-31T00:00:00Z'))
    expect(status.phase).toBe('pending')
  })

  it('reports voting with quorum progress while the window is open', () => {
    const status = resolveQuorumTimelockStatus(
      makeProposal({ status: 'active', yesVotes: 3000, noVotes: 2000 }),
      new Date('2026-09-05T00:00:00Z'),
    )
    expect(status.phase).toBe('voting')
    expect(status.quorumPercent).toBe(50)
    expect(status.quorumMet).toBe(false)
    expect(status.timelockEndsAt).toBeNull()
  })

  it('reports timelocked with remaining time after a passing vote', () => {
    const status = resolveQuorumTimelockStatus(makeProposal(), new Date(endMs + 12 * HOUR))
    expect(status.phase).toBe('timelocked')
    expect(status.quorumMet).toBe(true)
    expect(status.timelockEndsAt).toBe(new Date(endMs + DEFAULT_TIMELOCK_SECONDS * 1000).toISOString())
    expect(status.timelockRemainingMs).toBe(36 * HOUR)
  })

  it('reports ready once the timelock has elapsed', () => {
    const status = resolveQuorumTimelockStatus(makeProposal(), new Date(endMs + 49 * HOUR))
    expect(status.phase).toBe('ready')
    expect(status.timelockRemainingMs).toBe(0)
  })

  it('prefers the API executionEta over the derived delay', () => {
    const executionEta = new Date(endMs + 2 * HOUR).toISOString()
    const status = resolveQuorumTimelockStatus(makeProposal({ executionEta }), new Date(endMs + HOUR))
    expect(status.phase).toBe('timelocked')
    expect(status.timelockEndsAt).toBe(executionEta)
    expect(status.timelockRemainingMs).toBe(HOUR)
  })

  it('honours a custom timelock delay', () => {
    const status = resolveQuorumTimelockStatus(makeProposal(), new Date(endMs + HOUR), 0)
    expect(status.phase).toBe('ready')
  })

  it('reports executed regardless of the clock', () => {
    const status = resolveQuorumTimelockStatus(makeProposal({ executed: true }), new Date(endMs + HOUR))
    expect(status.phase).toBe('executed')
  })

  it('does not enter the timelock when quorum was not met, even with a yes majority', () => {
    const status = resolveQuorumTimelockStatus(
      makeProposal({ yesVotes: 900, noVotes: 100, status: 'passed' }),
      new Date(endMs + HOUR),
    )
    expect(status.phase).toBe('quorum_not_met')
    expect(status.timelockEndsAt).toBeNull()
  })

  it('reports rejected when quorum is met but yes does not exceed no', () => {
    const status = resolveQuorumTimelockStatus(
      makeProposal({ yesVotes: 5000, noVotes: 5000, status: 'rejected' }),
      new Date(endMs + HOUR),
    )
    expect(status.phase).toBe('rejected')
  })

  it.each([
    [{ votingEnd: 'not-a-date' }, 'Voting window has an invalid date'],
    [{ votingEnd: '2026-08-01T00:00:00Z' }, 'Voting end is before voting start'],
    [{ yesVotes: -1 }, 'Vote counts must be non-negative numbers'],
    [{ quorum: Number.NaN }, 'Quorum must be a non-negative number'],
    [{ executionEta: 'garbage' }, 'Execution ETA has an invalid date'],
  ])('returns invalid for malformed data %p', (overrides, error) => {
    const status = resolveQuorumTimelockStatus(makeProposal(overrides as Partial<QuorumTimelockProposal>), new Date(endMs))
    expect(status.phase).toBe('invalid')
    expect(status.error).toBe(error)
    expect(status.timelockEndsAt).toBeNull()
  })
})

describe('formatDuration', () => {
  it('formats days, hours and minutes', () => {
    expect(formatDuration(36 * HOUR)).toBe('1d 12h')
    expect(formatDuration(90 * 60 * 1000)).toBe('1h 30m')
    expect(formatDuration(5 * 60 * 1000)).toBe('5m')
    expect(formatDuration(0)).toBe('0m')
  })
})

describe('<QuorumTimelockStatus />', () => {
  it('shows the timelock countdown for a passed proposal', () => {
    render(<QuorumTimelockStatus proposal={makeProposal()} now={new Date(endMs + 12 * HOUR)} />)
    expect(screen.getByTestId('quorum-timelock-status')).toHaveAttribute('data-phase', 'timelocked')
    expect(screen.getByText('In timelock')).toBeInTheDocument()
    expect(screen.getByText('Executable in')).toBeInTheDocument()
    expect(screen.getByText('1d 12h')).toBeInTheDocument()
  })

  it('shows quorum not met without a timelock row', () => {
    render(
      <QuorumTimelockStatus
        proposal={makeProposal({ yesVotes: 900, noVotes: 100 })}
        now={new Date(endMs + HOUR)}
      />,
    )
    expect(screen.getByText('Quorum not met')).toBeInTheDocument()
    expect(screen.queryByText('Executable in')).not.toBeInTheDocument()
  })

  it('surfaces an error alert for malformed proposal data', () => {
    render(<QuorumTimelockStatus proposal={makeProposal({ votingEnd: 'not-a-date' })} now={new Date(endMs)} />)
    expect(screen.getByText('Status unavailable')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Voting window has an invalid date')
  })
})
