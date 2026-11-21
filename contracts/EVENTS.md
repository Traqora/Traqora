# Events Documentation

| topics | data | description |
|--------|------|-------------|
| `(booking, created)` | `(passenger, timestamp, booking_id)` | New booking |
| `(booking, paid)` | `(passenger, timestamp, booking_id, amount)` | Paid booking |
| `(supplier, cancelled)` | `(supplier_id, booking_id, state)` | Supplier cancellation process result |
