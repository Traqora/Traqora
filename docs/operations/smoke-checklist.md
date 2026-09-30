# Production Smoke Automation Checklist & Runbook

## Overview
This document describes the production smoke automation capability for Traqora (`runProdSmokeCheck`), providing operators and contributors with clear contract specifications, execution instructions, and failure-mode handling.

## Contract Specification

### Input (`SmokeCheckInput`)
- `targetUrl` (`string`, required): The HTTP(S) endpoint to probe (must start with `http` or `https`).
- `timeoutMs` (`number`, optional): Request timeout in milliseconds (defaults to `5000ms`).

### Output (`SmokeCheckResult`)
- `success` (`boolean`): True if the HTTP response status is within `200..=399`, false otherwise.
- `latencyMs` (`number`): The elapsed time in milliseconds for the request.
- `statusCode` (`number`, optional): The HTTP status code returned by the target, if reached.
- `errorDetails` (`string`, optional): Description of any error encountered (timeouts, invalid inputs, network failures, or HTTP status error messages).

## Operator Execution Instructions

1. **Pre-Deployment / Post-Deployment Check**:
   Run the backend test suite or integrate `runProdSmokeCheck` into deployment pipelines to verify live endpoint health.
2. **Configuration**:
   Ensure target URLs point to valid health check routes (e.g., `https://api.traqora.io/health`).
3. **Monitoring Logs**:
   Failed checks automatically emit structured error logs via the winston logger with target URL and failure details.

## Key Failure Modes

- **Invalid URL Input**: If `targetUrl` is missing or does not start with `http`, the function immediately returns `success: false` with an invalid input error description without triggering a network request.
- **Network Timeouts**: If a request exceeds `timeoutMs`, the error code (`ECONNABORTED` or `ETIMEDOUT`) is caught and reported as a timeout error with elapsed latency.
- **HTTP Error Statuses**: Non-2xx/3xx HTTP codes (such as `500 Internal Server Error` or `404 Not Found`) result in `success: false` and capture the received status code.
