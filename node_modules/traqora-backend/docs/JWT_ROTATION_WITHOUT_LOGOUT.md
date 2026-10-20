# JWT Rotation Without Logout Contract & Guide

## Overview
Traqora supports seamless JWT token rotation without requiring explicit user logout upon every token renewal. When a client exchanges a valid refresh token at `POST /api/v1/auth/refresh`, the backend issues a brand new access token and a rotated refresh token, invalidating the old refresh token immediately.

## Contract Specification

### Endpoint
`POST /api/v1/auth/refresh`

### Request Body
```json
{
  "refreshToken": "<JWT_REFRESH_TOKEN>"
}
```

### Success Response (200 OK)
```json
{
  "accessToken": "<NEW_ACCESS_TOKEN>",
  "refreshToken": "<NEW_ROTATED_REFRESH_TOKEN>"
}
```

### Error Cases (401 Unauthorized)
- **Expired or Malformed Token**: Returns `401 Unauthorized` if the JWT signature is invalid or has passed its expiry.
- **Token Reuse / Replay Detection**: If an already-rotated (stale) refresh token is presented, the system detects the reuse, revokes all active session tokens for that wallet address in Redis, and returns `401 Unauthorized`.
