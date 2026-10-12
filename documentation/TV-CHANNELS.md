# TV channels

TV data comes from versioned SQLite packs installed through Offline Data. Availability depends on which packs have been installed. Once installed, browsing and searching use only local compressed pack bytes and work without a network connection. The client supports provider kinds `dth`, `cable` and `iptv`; providers and channel numbers come from the installed pack rather than client source.

The TV browser lists each provider mapping separately. Search matches canonical channel names, native-language aliases and channel numbers. Provider, language, genre and quality filters can be combined with search; available options are derived from the installed data. Results can be sorted by channel name or by numeric-aware channel number. The default is name order for all providers and number order for a selected provider. Results appear in batches of 100.

A mapping can be scoped by country, state, city and area/head-end, with an optional revision and verification date. The query engine preserves regional matching for future cable data, while national mappings with no regional scope apply everywhere. Lineups reflect the installed pack's data and may change; they are not live provider listings.
