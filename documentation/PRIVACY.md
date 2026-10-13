# Privacy

MetroPocket has no account, analytics, advertising, live train tracking or backend. V1 requests no GPS/location, contacts, camera, microphone, notifications, phone-state or broad-storage permission. Internet is used only when the person chooses to obtain or check public data packs.

Downloaded data stays in browser/device-private application storage. Android backups and device-transfer export are disabled for this application data; release cleartext HTTP is disabled.

Train schedules are user-managed local data, not public packs. Web/PWA CSV files are parsed
and validated on-device, then saved in a separate writable SQLite database in
IndexedDB. No CSV, timetable, or train search is uploaded or logged. Train features
use no railway API, analytics, or location access. Settings exports/restores raw
SQLite `.db` Train backups locally on Web and Android, without a password or
encryption. Android creates no schedules from CSV and exposes no CSV guide.
Restore replaces all existing Train data after preview and confirmation. Keep backups outside the app before changing
devices or clearing storage. Deleting train data does not delete Metro/TV packs.
