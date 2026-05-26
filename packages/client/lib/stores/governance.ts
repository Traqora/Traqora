import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { defaultManager as socketManager } from '@/lib/socket'

interface Proposal {
  id: number
  proposer: string
  title: string
  description: string
  proposalType: string
  votingStart: string
  votingEnd: string
  yesVotes: number
  noVotes: number
  status: string
  executed: boolean
  quorum: number
  totalVoters: number
}

interface Vote {
  voter: string
  proposalId: number
  support: boolean
  votingPower: number
  timestamp: string
}

interface GovernanceState {
  // Proposals
  proposals: Proposal[]
  proposalsLoading: boolean
  activeProposals: Proposal[]
  passedProposals: Proposal[]
  rejectedProposals: Proposal[]

  // Current proposal details
  currentProposal: Proposal | null
  currentProposalVotes: Vote[]
  proposalLoading: boolean

  // Voting power
  votingPower: {
    baseBalance: number
    delegatedToUser: number
    delegatedAway: number
    totalVotingPower: number
  }
  votingPowerLoading: boolean

  // Delegations
  delegations: any[]
  delegationsLoading: boolean

  // Actions
  setProposals: (proposals: Proposal[]) => void
  setProposalsLoading: (loading: boolean) => void
  refreshProposals: () => Promise<void>
  setCurrentProposal: (proposal: Proposal | null) => void
  setCurrentProposalVotes: (votes: Vote[]) => void
  refreshProposal: (id: number) => Promise<void>
  setVotingPower: (power: GovernanceState['votingPower']) => void
  setVotingPowerLoading: (loading: boolean) => void
  refreshVotingPower: (address: string) => Promise<void>
  setDelegations: (delegations: any[]) => void
  setDelegationsLoading: (loading: boolean) => void
  refreshDelegations: (address: string) => Promise<void>
  castVote: (proposalId: number, support: boolean, votingPower: number) => Promise<boolean>
  createProposal: (data: any) => Promise<Proposal | null>
  delegate: (delegator: string, delegate: string, amount: number) => Promise<boolean>
  revokeDelegation: (delegator: string) => Promise<boolean>
}

export const useGovernanceStore = create<GovernanceState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    proposals: [],
    proposalsLoading: false,
    activeProposals: [],
    passedProposals: [],
    rejectedProposals: [],

    currentProposal: null,
    currentProposalVotes: [],
    proposalLoading: false,

    votingPower: {
      baseBalance: 0,
      delegatedToUser: 0,
      delegatedAway: 0,
      totalVotingPower: 0
    },
    votingPowerLoading: false,

    delegations: [],
    delegationsLoading: false,

    // Actions
    setProposals: (proposals) => {
      const active = proposals.filter(p => p.status === 'active')
      const passed = proposals.filter(p => p.status === 'passed')
      const rejected = proposals.filter(p => p.status === 'rejected')
      set({
        proposals,
        activeProposals: active,
        passedProposals: passed,
        rejectedProposals: rejected
      })
    },

    setProposalsLoading: (loading) => set({ proposalsLoading: loading }),

    refreshProposals: async () => {
      set({ proposalsLoading: true })
      try {
        const res = await fetch('/api/v1/governance/proposals')
        if (res.ok) {
          const data = await res.json()
          get().setProposals(data.data)
        }
      } catch (error) {
        console.error('Failed to refresh proposals:', error)
      } finally {
        set({ proposalsLoading: false })
      }
    },

    setCurrentProposal: (proposal) => set({ currentProposal: proposal }),

    setCurrentProposalVotes: (votes) => set({ currentProposalVotes: votes }),

    refreshProposal: async (id: number) => {
      set({ proposalLoading: true })
      try {
        const [proposalRes, votesRes] = await Promise.all([
          fetch(`/api/v1/governance/proposals/${id}`),
          fetch(`/api/v1/governance/proposals/${id}/votes`)
        ])

        if (proposalRes.ok) {
          const proposalData = await proposalRes.json()
          set({ currentProposal: proposalData.data })
        }

        if (votesRes.ok) {
          const votesData = await votesRes.json()
          set({ currentProposalVotes: votesData.data })
        }
      } catch (error) {
        console.error('Failed to refresh proposal:', error)
      } finally {
        set({ proposalLoading: false })
      }
    },

    setVotingPower: (power) => set({ votingPower: power }),

    setVotingPowerLoading: (loading) => set({ votingPowerLoading: loading }),

    refreshVotingPower: async (address: string) => {
      set({ votingPowerLoading: true })
      try {
        const res = await fetch(`/api/v1/governance/voting-power/${address}`)
        if (res.ok) {
          const data = await res.json()
          set({ votingPower: data.data })
        }
      } catch (error) {
        console.error('Failed to refresh voting power:', error)
      } finally {
        set({ votingPowerLoading: false })
      }
    },

    setDelegations: (delegations) => set({ delegations }),

    setDelegationsLoading: (loading) => set({ delegationsLoading: loading }),

    refreshDelegations: async (address: string) => {
      set({ delegationsLoading: true })
      try {
        const res = await fetch(`/api/v1/governance/delegations/${address}`)
        if (res.ok) {
          const data = await res.json()
          set({ delegations: data.data.delegatedBy })
        }
      } catch (error) {
        console.error('Failed to refresh delegations:', error)
      } finally {
        set({ delegationsLoading: false })
      }
    },

    castVote: async (proposalId: number, support: boolean, votingPower: number) => {
      try {
        const res = await fetch(`/api/v1/governance/proposals/${proposalId}/vote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ voter: 'current-user', support, votingPower })
        })
        if (res.ok) {
          // Refresh proposal data
          await get().refreshProposal(proposalId)
          await get().refreshProposals()
          return true
        }
      } catch (error) {
        console.error('Failed to cast vote:', error)
      }
      return false
    },

    createProposal: async (data) => {
      try {
        const res = await fetch('/api/v1/governance/proposals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        })
        if (res.ok) {
          const result = await res.json()
          await get().refreshProposals()
          return result.data
        }
      } catch (error) {
        console.error('Failed to create proposal:', error)
      }
      return null
    },

    delegate: async (delegator: string, delegate: string, amount: number) => {
      try {
        const res = await fetch('/api/v1/governance/delegate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ delegator, delegate, amount })
        })
        if (res.ok) {
          await get().refreshVotingPower(delegator)
          await get().refreshDelegations(delegator)
          return true
        }
      } catch (error) {
        console.error('Failed to delegate:', error)
      }
      return false
    },

    revokeDelegation: async (delegator: string) => {
      try {
        const res = await fetch('/api/v1/governance/delegate', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ delegator })
        })
        if (res.ok) {
          await get().refreshVotingPower(delegator)
          await get().refreshDelegations(delegator)
          return true
        }
      } catch (error) {
        console.error('Failed to revoke delegation:', error)
      }
      return false
    }
  }))
)

// WebSocket event listeners for real-time updates
socketManager.on('proposal_created', (data) => {
  console.log('New proposal created:', data)
  useGovernanceStore.getState().refreshProposals()
})

socketManager.on('vote_cast', (data) => {
  console.log('Vote cast:', data)
  // Refresh the specific proposal and overall proposals
  useGovernanceStore.getState().refreshProposal(data.proposalId)
  useGovernanceStore.getState().refreshProposals()
})

socketManager.on('proposal_status_changed', (data) => {
  console.log('Proposal status changed:', data)
  useGovernanceStore.getState().refreshProposals()
  if (data.proposalId === useGovernanceStore.getState().currentProposal?.id) {
    useGovernanceStore.getState().refreshProposal(data.proposalId)
  }
})