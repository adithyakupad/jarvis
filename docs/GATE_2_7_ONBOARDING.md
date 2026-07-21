# Gate 2.7 — Local project onboarding

Gate 2.7 replaces automatic sample data with first-run onboarding for an existing local repository. Production databases start empty. The MK 42 fixture is available only when the client is explicitly started with `VITE_JARVIS_DATA_MODE=mock`.

## Safety boundary

Repository paths are expanded for `~`, resolved to a canonical absolute directory, checked for read/search access, and inspected through a fixed list of known files. Git branch detection reads `.git/HEAD`; onboarding never runs repository commands, tests, package scripts, or browser-supplied commands. Existing working-tree changes are neither rejected nor modified.

Removing a project deletes its JARVIS-owned runs, events, logs, and project row. It never deletes the repository or any repository file. Approval remains a persisted Gate 2 decision; provider execution is unavailable until Gate 3.

## Stored state

Migration 4 adds optional project notes and a JSON project profile. The profile keeps repository-confirmed findings separate from technologies inferred from recognized manifests. It also records likely entry points, discoverable validation command names, and unresolved questions. The existing latest-run lookup restores the run, proposal revisions, provider session, and Context Packet after refresh.

## Local startup

Run `npm run dev:api` and `npm run dev` in separate terminals, then open `http://127.0.0.1:4173`. The default database is `data/jarvis.db`. Set `JARVIS_DATABASE_PATH` to an absolute database path for isolated state. Native directory selection is deferred to a future desktop wrapper; the developer alpha accepts a pasted absolute path.
