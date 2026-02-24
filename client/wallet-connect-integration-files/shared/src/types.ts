// Shared types
export interface User {
  id: string;
  email: string;
  walletAddress: string;
}

export interface Trade {
  id: string;
  amount: number;
  currency: string;
  status: string;
}
