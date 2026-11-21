# Wallet Phishing Prevention & Copy Guidelines

## Overview
Traqora implements strict anti-phishing guidelines across all client wallet connection flows to protect users against malicious actor impersonation and key theft.

## Core Security Rules
1. **Never Ask for Secret Keys / Recovery Phrases**: Traqora UI components and smart contract interactions will never request private keys or 12/24-word mnemonic seed phrases.
2. **Transaction Signature Verification**: Users must always inspect transaction XDR and smart contract method calls prior to approving signatures in wallet extensions (e.g. Freighter, Albedo).
3. **Prominent Warnings**: High-visibility anti-phishing banners are embedded directly in all wallet connection modals and onboarding steps.

## Operator & Contributor Best Practices
- When adding new wallet integration components, always include the standard anti-phishing alert box.
- Reference `packages/client/components/auth/wallet-connect.tsx` for approved copy and UI hierarchy.
- Ensure failure modes and unverified states pass through secure fallback warnings without exposing sensitive input fields.
