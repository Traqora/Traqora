# Soroban approval summary (#936)

Before a wallet signature is requested, the booking flow parses the unsigned
Soroban XDR and shows a concise, safe summary:

- the contract action (for example `create_booking`) and contract ID,
- the active Stellar network,
- the estimated network fee in XLM and stroops,
- the simulation outcome, with instruction count and latest ledger when the
  backend supplied a simulation result.

`lib/wallet-transaction.ts` builds this summary. It only exposes presentation
fields; raw XDR, contract data, authorization entries, and secret-key-looking
values are never rendered. Simulation errors are sanitized and length-bounded.
If an optional backend simulation is not supplied, the summary says
“Simulation: not available” rather than guessing.

Failure cases:

- An unreadable envelope throws `TransactionSummaryError`; the flow shows an
  error and does not open the wallet.
- A failed simulation is shown as failed and the approval button is disabled.
- The wallet is only prompted after the summary has been prepared. Creating the
  booking never opens a wallet prompt by itself.

The reusable UI is `components/booking/soroban-approval-summary.tsx`; the
booking hook stores the summary in `transactionSummary` before moving to the
`signing` step.
