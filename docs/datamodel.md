# Alongside data model

**Baseline:** current tables as defined in [main.py](../backend/app/main.py), [access.py](../backend/app/access.py) and [gmail.py](../backend/app/gmail.py). Production uses PostgreSQL. SQLite is for demo and tests.

| Entity | Key and fields | Purpose and lifecycle |
| --- | --- | --- |
| Supabase identity | Verified subject ID and normalized email, managed by Supabase | Subject is the workspace owner key. Identity persists beyond workspace deletion. |
| `records` | `id` UUID string PK, `owner`, `kind`, `data` JSON serialized as text, `created`; index on owner/kind | Current workspace state by kind. API scopes reads and changes to owner. Workspace deletion removes all these rows for the caller. |
| `beta_invitations` | Normalized `email` PK, `active`, `invited_by`, `invited_at`, `revoked_at` | Grant mapped by email. Revocation retains the row and user data. Legacy seed does not overwrite an existing grant. |
| `beta_members` | `user_id` PK, `email`, `signed_up_at`, `last_seen_at` | Verified app access metadata for Admin. First-seen survives later checks. |
| `gmail_oauth` | Hashed `state` PK, `owner`, `email`, hashed `verifier`, `expires`, `phase`, encrypted `payload` | Temporary authorization. Waiting → processing → ready → consumed. Expires in 10 minutes; expired rows are cleaned during status/connect operations. |
| `gmail_connections` | `owner` PK, `generation`, mailbox `email`, encrypted `payload`, `last_sync`, `lease`, `page`, `query` | One connection per owner. Payload contains access/refresh tokens and expiry. Cursor continues the active sync query; generation protects writes during disconnect/reconnect. |
| `gmail_messages` | Composite PK (`owner`, `message_id`), `data` JSON serialized as text | Deduplicated metadata: subject, sender, received timestamp, possible job IDs and tentative status. Job IDs are suggestions and have no SQL foreign key. |

## Workspace record payloads

| Kind | Logical fields and invariants |
| --- | --- |
| `preferences` | Roles, locations, skills, company exclusions, threshold, resume consent. One logical current row; reads use the newest. Legacy role/location fields are normalized into lists. |
| `job` | Title, company, location, description, original URL, salary, match score/reason/skills, stage, filtering flags, source, optional manual-stage flag and applied timestamp. URL dedupe is an application check. |
| `resume` | Facts map, skills list, unique bullet IDs with text, version. Confirmation appends a version. No original binary, generated PDF or application-to-resume link. |
| `audit` | Event description. Feed shows up to 50 recent entries. This is workspace activity, without immutable security-audit guarantees. |

## Consistency and retention

- Ownership links and record kinds are enforced by API logic, with no general relational foreign keys. Unique database constraints cover primary keys and Gmail message dedupe. Workspace URL uniqueness and resume version sequencing currently depend on app logic under concurrent writes.
- Record creation and invitation dates are UTC ISO text. OAuth expiry, lease and sync time use epoch seconds. Gmail message arrival uses epoch milliseconds.
- Gmail disconnect removes pending authorizations, credentials and metadata for the owner. Successful sync prunes headers older than the scan window; no scheduled retention exists. Only the latest 100 results are returned.
- Workspace deletion does not remove the login identity, beta metadata, or provider backups. Future migrations should define deletion/export scope, retention and stronger constraints where needed. See [security](Security.md).
