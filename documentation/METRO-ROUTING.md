# Metro routing

Metro packs model stations, lines, adjacent connections, line memberships and optional interchange walking time. Stations, lines and connections have `operational`, `under-construction`, `planned` or `temporarily-closed` status. Only operational records participate in route planning.

The shared planner uses Dijkstra-style scoring: adjacent travel minutes plus an interchange walking cost and a transfer penalty, so a route with needless transfers is not selected just because it has fewer stops. It returns segments, line text and color, terminals/direction, station count, interchange count and an explicitly approximate duration. Missing edge minutes use the pack default and mark the result estimated; no result is live train status.
