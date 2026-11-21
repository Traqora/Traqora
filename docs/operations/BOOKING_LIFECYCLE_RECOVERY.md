# Booking Lifecycle and Recovery

## V1 Passenger Identity and Format Validation

Before creating a payable booking (`create_booking`), the system validates required passenger identity fields and formats (such as non-empty flight identifiers). Invalid payloads cause an immediate panic with descriptive error messages (e.g., `Invalid flight number`).
