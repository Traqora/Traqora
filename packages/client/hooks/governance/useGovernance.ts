"use client";
import { useEffect } from "react";
import { useGovernanceStore } from "@/lib/stores/governance";

export function useGovernance() {
  const store = useGovernanceStore()

  useEffect(() => {
    store.refreshProposals()
  }, [])

  return {
    proposals: store.proposals,
    activeProposals: store.activeProposals,
    passedProposals: store.passedProposals,
    rejectedProposals: store.rejectedProposals,
    loading: store.proposalsLoading,
    refresh: store.refreshProposals
  }
}

export function useProposal(id: number) {
  const store = useGovernanceStore()

  useEffect(() => {
    if (id) {
      store.refreshProposal(id)
    }
  }, [id])

  return {
    proposal: store.currentProposal,
    votes: store.currentProposalVotes,
    loading: store.proposalLoading,
    refresh: () => store.refreshProposal(id)
  }
}

export function useVotingPower(address: string) {
  const store = useGovernanceStore()

  useEffect(() => {
    if (address) {
      store.refreshVotingPower(address)
    }
  }, [address])

  return {
    votingPower: store.votingPower,
    loading: store.votingPowerLoading,
    refresh: () => store.refreshVotingPower(address)
  }
}

export function useDelegations(address: string) {
  const store = useGovernanceStore()

  useEffect(() => {
    if (address) {
      store.refreshDelegations(address)
    }
  }, [address])

  return {
    delegations: store.delegations,
    loading: store.delegationsLoading,
    refresh: () => store.refreshDelegations(address)
  }
}