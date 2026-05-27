# Backend Performance Profiling Notes

This note captures the first profiling pass for backend hotspots and the metrics added to make follow-up load tests measurable.

## Instrumented Hotspots

| Rank | Area | Why it matters | Metric coverage |
| --- | --- | --- | --- |
| 1 | Flight search database query | User-facing search can fan out over filters, sorting, and pagination. | `traqora_database_query_duration_seconds{operation="search_flights",entity="flights"}` |
| 2 | Flight registry state lookup | Each result page can trigger Soroban state checks. | `traqora_service_operation_duration_seconds{component="flight_search",operation="registry_state_lookup"}` |
| 3 | Uncached flight registry fetches | Repeated searches for the same flight IDs were doing repeat registry work. | Redis-backed `flight-registry` cache metrics |
| 4 | Flight search cache | Repeat searches should avoid DB and registry work. | `traqora_cache_operations_total{cache=~"flight-search.*"}` |
| 5 | Soroban RPC calls | Contract monitoring and registry lookups can be network-bound. | `traqora_service_operation_duration_seconds{component="soroban"}` |
| 6 | Contract event polling | Poll loop latency affects event freshness and RPC load. | `traqora_service_operation_duration_seconds{component="contract_monitor",operation="fetch_and_process_events"}` |
| 7 | Wallet balance monitoring | Periodic Horizon calls can pile up when multiple wallets are watched. | `traqora_service_operation_duration_seconds{component="contract_monitor",operation="monitor_wallet_balances"}` |
| 8 | Price monitor oracle fetch | Price checks can block alert processing. | `traqora_service_operation_duration_seconds{component="price_monitor",operation="fetch_current_price"}` |
| 9 | Price history scan | Volatility checks read the last 24 hours of price history. | `traqora_service_operation_duration_seconds{component="price_monitor",operation="load_price_history"}` |
| 10 | Active alert lookup | Notification fan-out depends on active alert query latency. | `traqora_service_operation_duration_seconds{component="price_monitor",operation="load_active_alerts"}` |

## Optimizations Added

1. Flight registry state caching now uses the existing Redis-backed cache abstraction, with in-memory fallback and `FLIGHT_REGISTRY_CACHE_TTL_SECONDS` control.
2. Flight search and registry caches now emit hit, miss, fallback, set, and error metrics so cache effectiveness can be tracked during load tests.

## Suggested Prometheus Queries

```promql
histogram_quantile(0.99, sum(rate(traqora_http_request_duration_seconds_bucket[5m])) by (le, route, method))
histogram_quantile(0.99, sum(rate(traqora_service_operation_duration_seconds_bucket[5m])) by (le, component, operation))
sum(rate(traqora_cache_operations_total[5m])) by (cache, operation, result)
sum(rate(traqora_database_errors_total[5m])) by (error_type)
```
