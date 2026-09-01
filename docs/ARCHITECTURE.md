# Architecture

## Product boundaries

```text
YouTube source adapters -> Video library -> Campaign engine
                                           -> Duplicate policy
Contacts + groups --------> Recipient set  -> Messaging providers -> Immutable deliveries
Video metadata -----------> AI draft provider
Sync deltas --------------> Notification inbox / browser push
```

The UI never talks directly to YouTube, AI or messaging providers. Secrets and external calls stay server-side.

## Extension points

- `server/providers/index.js`: add providers implementing `buildUrl`, or a future asynchronous `send` contract.
- `server/ai.js`: AI draft providers; generated content is never sent without confirmation.
- `server/youtube.js`: channel resolver and synchronizer; an OAuth source can be added beside the public API-key source.
- `Store`: intentionally exposes a small repository API. It can be replaced by SQLite/PostgreSQL without changing routes or the frontend.

## Historical integrity

Deliveries are append-only events. Removing contacts or channels does not remove delivery history. A video's current distribution status is a projection for display, never the source of truth for duplicate detection.

## CALOREAZI comparison

Shared proven patterns: HA repository metadata, Ingress and standalone Web UI, watchdog endpoint, persistent storage, PWA shell, RTL-first interface, service separation, automated tests and release workflow.

YouTubeSender starts with a smaller operational footprint: one Node process and atomic local persistence. It avoids embedding CALOREAZI's nutrition-specific domains, PostgreSQL service and analysis workers. Provider and repository boundaries keep a direct path to those heavier capabilities when scale requires them.

