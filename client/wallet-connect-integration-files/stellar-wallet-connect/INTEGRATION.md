# Stellar Wallet Connect -- Integration Guide

A self-contained package that adds **Stellar wallet connection** to any
React / Next.js project.  It wraps
[`@creit-tech/stellar-wallets-kit`](https://github.com/nicholasgasior/stellar-wallets-kit)
and bundles:

| Layer           | File(s)                                     | Purpose                                         |
| --------------- | ------------------------------------------- | ----------------------------------------------- |
| **Types**       | `src/types.ts`                              | All TypeScript interfaces & type aliases         |
| **Store**       | `src/store.ts`                              | Zustand store persisted to `localStorage`        |
| **Kit helpers** | `src/kit.ts`                                | `initializeWalletKit`, `signTransaction`, etc.   |
| **React hook**  | `src/use-wallet.ts`                         | `useWallet()` -- connect / disconnect            |
| **UI**          | `src/components/WalletInfo.tsx`             | Card showing wallet status, address, actions     |
|                 | `src/components/WalletConnectionPrompt.tsx` | Modal prompting user to connect                  |
| **CSS**         | `src/styles.css`                            | Default dark-theme styles (all classes `swc-*`)  |
| **Barrel**      | `src/index.ts`                              | Re-exports everything for easy imports           |

---

## 1. Installation

### Option A -- Copy the folder

Copy the entire `packages/stellar-wallet-connect/` directory into your
project (e.g. `packages/stellar-wallet-connect` or `lib/stellar-wallet-connect`).

Then install peer dependencies:

```bash
npm install zustand @creit-tech/stellar-wallets-kit@npm:@jsr/creit-tech__stellar-wallets-kit@^2.0.0-beta.6 @stellar/stellar-sdk lucide-react
```

### Option B -- Monorepo workspace (recommended)

If your project uses a monorepo (Turborepo, Nx, etc.), add the folder as a
workspace package, then reference it in your app's `package.json`:

```jsonc
// apps/your-app/package.json
{
  "dependencies": {
    "@pacto-p2p/stellar-wallet-connect": "workspace:*"
  }
}
```

Run `pnpm install` (or your package manager's equivalent) to link it.

---

## 2. Peer Dependencies

| Package                              | Version     |
| ------------------------------------ | ----------- |
| `react`                              | `>=18.0.0`  |
| `react-dom`                          | `>=18.0.0`  |
| `zustand`                            | `^5.0.0`    |
| `@creit-tech/stellar-wallets-kit`    | `^2.0.0-beta.6` (via JSR) |
| `@stellar/stellar-sdk`               | `^13.1.0`   |
| `lucide-react`                       | `>=0.300.0` |

---

## 3. Quick Start

### 3.1 Import the stylesheet

In your global CSS (e.g. `app/globals.css` or `styles/globals.css`):

```css
/* At the top of your globals.css */
@import '@pacto-p2p/stellar-wallet-connect/styles.css';
```

Or in your root layout / `_app.tsx`:

```tsx
import '@pacto-p2p/stellar-wallet-connect/styles.css';
```

> **Tip:** The stylesheet only uses `swc-*` prefixed classes and CSS custom
> properties.  You can override the variables in your own `:root` block to
> retheme everything (see Section 7).

### 3.2 Initialise the kit (once)

Call `initializeWalletKit()` early in your client-side code (or let the
`useWallet` hook do it automatically).

```tsx
// app/providers.tsx  (or similar client-only wrapper)
'use client';

import { useEffect } from 'react';
import { initializeWalletKit } from '@pacto-p2p/stellar-wallet-connect';

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initializeWalletKit('testnet'); // or 'mainnet'
  }, []);

  return <>{children}</>;
}
```

### 3.3 Use the hook

```tsx
'use client';

import { useWallet, useWalletStore } from '@pacto-p2p/stellar-wallet-connect';

export function ConnectButton() {
  const { handleConnect, handleDisconnect } = useWallet();
  const { address, isConnected, network } = useWalletStore();

  if (isConnected && address) {
    return (
      <div>
        <p>
          Connected to <strong>{network}</strong>:{' '}
          <code>{address.slice(0, 8)}...{address.slice(-4)}</code>
        </p>
        <button onClick={handleDisconnect}>Disconnect</button>
      </div>
    );
  }

  return <button onClick={handleConnect}>Connect Wallet</button>;
}
```

### 3.4 Use the pre-built UI components

```tsx
'use client';

import {
  WalletInfo,
  WalletConnectionPrompt,
} from '@pacto-p2p/stellar-wallet-connect';
import { useState } from 'react';

export function WalletPage() {
  const [promptOpen, setPromptOpen] = useState(false);

  // Optional: link the wallet address to your backend user
  const linkWallet = async (stellarAddress: string) => {
    await fetch('/api/user/link-wallet', {
      method: 'POST',
      body: JSON.stringify({ stellarAddress }),
    });
  };

  return (
    <div>
      <WalletInfo
        showDetails
        onWalletLinked={() => console.log('Wallet linked!')}
        onLinkWallet={linkWallet}  {/* optional */}
      />

      <button onClick={() => setPromptOpen(true)}>
        Open Connect Prompt
      </button>

      <WalletConnectionPrompt
        open={promptOpen}
        onOpenChange={setPromptOpen}
        onLinkWallet={linkWallet}  {/* optional */}
      />
    </div>
  );
}
```

---

## 4. API Reference

### `initializeWalletKit(network?: 'testnet' | 'mainnet')`

Initialises the `StellarWalletsKit` singleton.  Safe to call multiple times.
**Must run on the client.**

### `isWalletKitInitialized(): boolean`

Returns `true` after a successful `initializeWalletKit` call.

### `getInitializationError(): Error | null`

Returns the error (if any) from the last init attempt.

### `getConfiguredNetwork(): StellarNetwork`

Returns the currently configured network (`'testnet'` or `'mainnet'`).

### `getKit(): typeof StellarWalletsKit`

Returns the raw `StellarWalletsKit` class reference for advanced usage.

### `signTransaction(opts: SignTransactionOptions): Promise<string>`

Signs a Stellar transaction XDR with the connected wallet and returns the
signed XDR.

```ts
import { signTransaction } from '@pacto-p2p/stellar-wallet-connect';

const signedXdr = await signTransaction({
  unsignedTransaction: xdrString,
  address: 'G...',
  network: 'testnet', // optional, defaults to configured network
});
```

### `useWallet(network?: StellarNetwork): UseWalletReturn`

React hook that manages the wallet lifecycle.

| Return             | Type                  | Description                      |
| ------------------ | --------------------- | -------------------------------- |
| `handleConnect`    | `() => Promise<void>` | Opens the wallet auth modal      |
| `handleDisconnect` | `() => Promise<void>` | Disconnects the current wallet   |

### `useWalletStore`

Zustand store hook.  Access wallet state from any component:

```ts
const { address, network, walletType, isConnected, publicKey } = useWalletStore();
```

Store actions (also available via `useWalletStore.getState()`):

| Action                   | Description                            |
| ------------------------ | -------------------------------------- |
| `connectWalletStore`     | Persist connection details             |
| `disconnectWalletStore`  | Clear all wallet data                  |
| `updateConnectionStatus` | Toggle just the `isConnected` flag     |

---

## 5. Components

### `<WalletInfo>`

| Prop            | Type                                   | Default | Description                                              |
| --------------- | -------------------------------------- | ------- | -------------------------------------------------------- |
| `showDetails`   | `boolean`                              | `true`  | Show the public key section                              |
| `className`     | `string`                               | `''`    | Additional CSS classes                                   |
| `onWalletLinked`| `() => void`                           | --      | Fires after a successful connection                      |
| `onLinkWallet`  | `(address: string) => Promise<void>`   | --      | If provided, called to link the address to your backend  |

### `<WalletConnectionPrompt>`

| Prop           | Type                                   | Description                                      |
| -------------- | -------------------------------------- | ------------------------------------------------ |
| `open`         | `boolean`                              | Controls dialog visibility                        |
| `onOpenChange` | `(open: boolean) => void`              | Toggle callback                                   |
| `onLinkWallet` | `(address: string) => Promise<void>`   | Optional backend linking function                 |

---

## 6. Linking Wallets to Your Auth System

The package itself is **auth-agnostic**.  It only manages the Stellar wallet
connection.  To integrate with your own auth (Supabase, NextAuth, custom JWT,
etc.), use the `onLinkWallet` callback:

```tsx
// Example with Supabase
import { supabase } from '@/lib/supabase';

const linkWalletToSupabase = async (stellarAddress: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('users')
    .update({ stellar_address: stellarAddress })
    .eq('id', user.id);

  if (error) throw error;
};

// Pass to component
<WalletInfo onLinkWallet={linkWalletToSupabase} />
```

---

## 7. Theming / Customisation

All styles use CSS custom properties under `:root`.  Override them to match
your brand:

```css
:root {
  --swc-accent: #3b82f6;          /* blue-500 instead of emerald */
  --swc-accent-hover: #2563eb;    /* blue-600 */
  --swc-bg: #111827;              /* gray-900 */
  --swc-card-bg: rgba(59, 130, 246, 0.06);
  --swc-card-border: rgba(59, 130, 246, 0.2);
  --swc-text: #f9fafb;
  --swc-text-muted: #9ca3af;
  --swc-radius: 1rem;
}
```

If you use a design system like shadcn/ui, you can skip `styles.css` entirely
and restyle the components using your own utility classes -- just override the
`className` prop or wrap the components.

---

## 8. Project Structure (files you get)

```
packages/stellar-wallet-connect/
  package.json            -- Package metadata & dependencies
  tsconfig.json           -- TypeScript configuration
  INTEGRATION.md          -- This file
  src/
    index.ts              -- Barrel export
    types.ts              -- All TypeScript types
    store.ts              -- Zustand persisted store
    kit.ts                -- StellarWalletsKit init + signTransaction
    use-wallet.ts         -- useWallet() React hook
    styles.css            -- Default dark-theme styles (swc-* classes)
    components/
      WalletInfo.tsx          -- Wallet status card
      WalletConnectionPrompt.tsx  -- Connect dialog
```

---

## 9. Supported Wallets

The package uses `defaultModules()` from `@creit-tech/stellar-wallets-kit`
which includes support for:

- **Freighter** (browser extension)
- **Lobstr** (mobile / extension)
- **xBull** (browser extension)
- **Albedo** (web-based signer)
- **Rabet** (browser extension)
- And any other wallet that registers as a SEP-0043 compatible module

---

## 10. Network Configuration

Pass `'testnet'` or `'mainnet'` when initialising:

```ts
// Testnet (default)
initializeWalletKit('testnet');

// Mainnet
initializeWalletKit('mainnet');

// Or via the hook
const { handleConnect } = useWallet('mainnet');
```

The network is also used when signing transactions.  You can override it
per-transaction:

```ts
await signTransaction({
  unsignedTransaction: xdr,
  address: publicKey,
  network: 'mainnet', // override for this specific tx
});
```

---

## 11. Troubleshooting

| Issue                                        | Solution                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Wallet modal doesn't appear                  | Ensure `initializeWalletKit()` was called on the client. Check console for init errors.   |
| Modal appears behind other elements           | Import `styles.css` -- it includes z-index overrides for the wallet kit modal.             |
| `window is not defined` error                 | You're calling wallet code on the server. Wrap calls in `typeof window !== 'undefined'`.   |
| Store resets on page reload                   | The store uses `localStorage`. Check that `stellar-wallet-auth` key exists in DevTools.    |
| Multiple init warnings                        | Safe to ignore -- `initializeWalletKit` is idempotent.                                     |

---

## 12. License

MIT
