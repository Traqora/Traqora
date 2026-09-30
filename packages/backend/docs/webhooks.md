# Idempotent Webhook Handlers Operator Guide

## Overview
Traqora implements robust webhook idempotency to prevent duplicate transaction execution or state changes when upstream payment providers (such as Stripe) or partner airlines deliver the same event multiple times.

## Contract & Inputs/Outputs
- **Inputs**: Incoming HTTP POST requests containing an event identifier (extracted via `stripe-signature`, request body `id`, or `x-webhook-event-id` header).
- **Outputs**: 
  - Standard success response (`200 OK`) with processing results on first delivery.
  - Cached success response with `idempotentReplay: true` on subsequent duplicate deliveries.
- **Error Cases**: Malformed payloads or missing event identifiers bypass idempotency cache lookup and proceed to standard validation.

## Operator Configuration
Ensure your PostgreSQL or SQLite backing store is healthy so idempotency records can be reliably persisted and queried.
