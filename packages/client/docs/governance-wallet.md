# Governance actions use the connected wallet

Proposal creation, voting, and delegation submit the Stellar address from the connected wallet. They do not use the old `current-user-address` placeholder.

## Expected behavior

- The account on a proposal, vote, or delegation is `useWalletStore`'s `address` while `isConnected` is true.
- Voting power and delegation lists load for that address.

## Failure cases

- **Disconnected wallet.** Confirming a proposal, casting a vote, or delegating stops before any request. The screen says: "Connect a wallet before submitting. No transaction was sent."
- **Wallet changes mid-draft.** A proposal form, an open vote, or an in-progress delegation is bound to the account that started it. Switching or disconnecting the wallet clears that draft and says: "This draft was cancelled because the connected wallet changed. Start again with the active account."
- A blank address or the placeholder `current-user` / `current-user-address` is treated as disconnected and is not sent.
