# Rate-Limit Abuse Dashboard Operator Guide

## Overview

The Traqora rate-limit abuse dashboard provides operators and security teams with real-time visibility into incoming traffic throttling, rate-limit enforcement across public and authenticated tiers, and potential abuse or DDoS attempts.

## API Endpoint & Contract

- **Endpoint**: `GET /api/v1/security/rate-limits/metrics`
- **Authentication**: Admin API Key required via the `X-Admin-Api-Key` header.
- **Content-Type**: `application/json`

### Request Header

```http
X-Admin-Api-Key: dev-admin-key
```

### Success Response (`200 OK`)

```json
{
  "success": true,
  "data": {
    "totals": {
      "allowed": 1540,
      "blocked": 24
    },
    "items": [
      {
        "endpoint": "/api/v1/flights/search",
        "tier": "public",
        "allowed": 1200,
        "blocked": 20,
        "lastBlockedAt": "2026-03-31T12:34:56.789Z"
      },
      {
        "endpoint": "/api/v1/bookings",
        "tier": "user",
        "allowed": 340,
        "blocked": 4,
        "lastBlockedAt": "2026-03-31T11:15:00.123Z"
      }
    ]
  }
}
```

### Error Responses

- **`401 Unauthorized`**: Missing or invalid `X-Admin-Api-Key` header.
- **`500 Internal Server Error`**: Unexpected failure while retrieving rate-limit metrics snapshot.

## Monitoring & Operational Best Practices

1. **Abuse Detection**: Monitor the `blocked` count and ratio relative to `allowed` requests per endpoint and tier. A sudden spike in blocked requests on `/api/v1/flights/search` or authentication routes indicates potential scraping or brute-force attacks.
2. **Tier Granularity**: Review metrics broken down by tier (`public`, `user`, `premium`, `ddos`) to ensure legitimate authenticated users are not experiencing false-positive throttling.
3. **Alerting Integration**: Operators should scrape this endpoint periodically (e.g., every 60 seconds) or integrate with Prometheus / Grafana alerts when blocked thresholds exceed predefined risk limits.
