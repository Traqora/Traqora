# Search Cache Hit-Rate SLO

## Overview
Traqora defines a Service Level Objective (SLO) for the search cache hit-rate to ensure low-latency query performance and efficient backend resource utilization.

## Contract
- **Target Hit-Rate**: >= 85% over a sliding 5-minute window.
- **Inputs**: Search cache hit/miss increment events.
- **Outputs**: Current hit-rate ratio (0.0 to 1.0), SLO compliance boolean (`slo_met`).
- **Error Cases**: Zero total requests returns a hit-rate of 0.0 with `slo_met: true` (no violation on empty traffic).

## Operator Guide
Monitor the `/metrics/search-cache-slo` endpoint or internal metric collector to verify compliance.
