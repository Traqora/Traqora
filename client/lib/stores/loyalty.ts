import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

interface LoyaltyState {
  // Account data
  userId: string | null
  tier: string
  totalPoints: number
  availablePoints: number
  nextTier: string | null
  progressPct: number

  // History
  transactions: any[]
  historyLoading: boolean
  historyPage: number
  historyTotal: number

  // Actions
  setUser: (userId: string) => void
  updateAccount: (data: Partial<LoyaltyState>) => void
  setTransactions: (transactions: any[], total: number, page: number) => void
  setHistoryLoading: (loading: boolean) => void
  refreshAccount: () => Promise<void>
  refreshHistory: (page?: number) => Promise<void>
}

export const useLoyaltyStore = create<LoyaltyState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    userId: null,
    tier: 'Bronze',
    totalPoints: 0,
    availablePoints: 0,
    nextTier: 'Silver',
    progressPct: 0,

    transactions: [],
    historyLoading: false,
    historyPage: 1,
    historyTotal: 0,

    // Actions
    setUser: (userId: string) => set({ userId }),

    updateAccount: (data) => set((state) => ({
      ...state,
      ...data
    })),

    setTransactions: (transactions, total, page) => set({
      transactions,
      historyTotal: total,
      historyPage: page,
      historyLoading: false
    }),

    setHistoryLoading: (loading) => set({ historyLoading: loading }),

    refreshAccount: async () => {
      const { userId } = get()
      if (!userId) return

      try {
        const res = await fetch(`/api/v1/loyalty/account/${userId}`)
        if (res.ok) {
          const data = await res.json()
          set({
            tier: data.tier,
            totalPoints: data.totalPoints,
            availablePoints: data.availablePoints,
            nextTier: data.nextTier,
            progressPct: data.progress
          })
        }
      } catch (error) {
        console.error('Failed to refresh loyalty account:', error)
      }
    },

    refreshHistory: async (page = 1) => {
      const { userId } = get()
      if (!userId) return

      set({ historyLoading: true })
      try {
        const res = await fetch(`/api/v1/loyalty/history/${userId}?page=${page}&limit=20`)
        if (res.ok) {
          const data = await res.json()
          set({
            transactions: data.data.items,
            historyTotal: data.data.total,
            historyPage: page,
            historyLoading: false
          })
        }
      } catch (error) {
        console.error('Failed to refresh transaction history:', error)
        set({ historyLoading: false })
      }
    }
  }))
)