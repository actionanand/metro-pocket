# Metro routing

Metro packs model stations, lines, adjacent connections, line memberships and optional interchange walking time. Stations, lines and connections have `operational`, `under-construction`, `planned` or `temporarily-closed` status. Only operational records participate in route planning.

The shared planner uses Dijkstra-style scoring: adjacent travel minutes plus an interchange walking cost and a transfer penalty, so a route with needless transfers is not selected just because it has fewer stops. It returns segments, line text and color, terminals/direction, station count, interchange count and an explicitly approximate duration. Missing edge minutes use the pack default and mark the result estimated; no result is live train status.

SQLite station aliases and codes are grouped by station; `station_lines` retains its ordered sequence. The direction of a segment is determined from its first two stations' sequences and the line's terminal sequences, and displays the terminal station name. Connections marked bidirectional create reverse edges; one-way connections do not. Legacy test networks without sequence data show direction unavailable rather than guessing.

NULL travel and walking minutes remain undefined during mapping. The planner uses `defaultEdgeMinutes` (or its existing 3-minute fallback) and the existing 5-minute interchange fallback. A route is marked estimated only when its selected path uses missing timings. All journey durations are approximate offline information. The route model counts stops after departure; the UI station count includes the source.
