# Signing request coalescing (#938)

`lib/signing-request-gate.ts` serializes wallet prompts:

- Duplicate requests for the same booking action (booking ID + unsigned XDR)
  return the same in-flight promise, so the wallet and backend are called once.
- A different action is rejected with `SigningRequestBusyError` while a prompt
  is already pending.
- Each request has a timeout (120 seconds by default, configurable through
  `signAndSubmitTransaction({ timeoutMs })`). On timeout the operation signal is
  aborted and `SigningRequestTimeoutError` is raised.
- If the wallet approves after the UI timed out, the hook sees the aborted
  signal and refuses to submit the late signature.
- The pending entry is always cleared after success, rejection, timeout, or an
  unexpected failure, so the action state is restored and a retry is possible.

The disabled/“Waiting for wallet…” button state in
`SorobanApprovalSummary` mirrors this gate; a retry is only offered after the
previous request has settled.
