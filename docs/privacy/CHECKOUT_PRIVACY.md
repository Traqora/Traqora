# Checkout Privacy Notices (v1)

## Overview
This document details the privacy notices and data minimization practices applied during the v1 checkout and passenger details journey on Traqora.

## Purpose of Passenger Data Collection
Passenger data collected during checkout (such as legal first and last name, email address, phone number, and required travel document details) is used strictly and exclusively for:
1. Supplier fulfillment (issuing tickets and reservations with the respective airline or travel supplier).
2. Transaction confirmation and essential operational communications (booking receipts, status updates, and emergency flight notifications).

## Data Minimization & Avoiding Unrelated Information
To protect traveler privacy and adhere to v1 scope limits:
- Unrelated personal information (such as marketing preferences, demographic surveys, dietary or seating preferences beyond core ticket requirements, and social media handles) is **not** collected during the checkout and passenger details phase.
- On-chain data is restricted to necessary cryptographic hashes, escrow pointers, and non-identifying transaction metadata.
- PII stored off-chain is encrypted at rest using AES-256-GCM and retained strictly in accordance with `TRAVELER_DATA_RETENTION.md`.

## User-Facing Notice
During checkout, users are presented with the following explicit notice:
> "Traqora collects passenger details (name, contact info, travel documents) solely for airline supplier fulfillment and booking confirmation. We do not collect unrelated personal data or store unencrypted PII on-chain."
