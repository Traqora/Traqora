# Wallet context revalidation

The booking flow re-reads the active wallet after the wallet signs and before
submitting the signed transaction. Submission is blocked if the account is no
longer the account used to build the transaction, the wallet is disconnected,
or the active network no longer matches the transaction's network passphrase.

The signed XDR is intentionally discarded in that case; the user must
reconnect and create a fresh transaction.
