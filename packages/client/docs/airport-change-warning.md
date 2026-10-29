# Airport change on connecting itineraries

Search results can include `segments` on a flight: ordered legs `{ origin, destination }`.

When two adjacent legs use different airports in the same metro area (for example arrive JFK, depart EWR), the result shows:

- the two airport codes and the metro name
- that a ground transfer is required
- the transfer distance in kilometres when Traqora has one on file

## Failure cases

- A non-stop itinerary, a single leg, or a connection through the same airport shows no warning.
- Airports that are not in the same known metro (JFK then ORD) show no warning. That is an ordinary connection, not an airport change.
- A same-metro pair with no stored distance still warns and still says a ground transfer is required. The kilometre figure is left off.
- Empty or missing `segments` shows no warning.
