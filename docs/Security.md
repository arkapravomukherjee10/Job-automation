# Alongside security and privacy

**Baseline:** 16 November 2026. Controls below describe the current source. Production configuration and policy checks are separate release gates.

| Risk | Implemented controls | Release check or remaining gap |
| --- | --- | --- |
| Unauthorized entry | Production verifies asymmetric Supabase JWT against JWKS with issuer/audience/expiry and signed email-verification method. Private endpoints require an active invitation or verified owner. | Test invited, uninvited, expired and revoked sessions against production. Check real owner email delivery. |
| Cross-user access | Owner derives from signed subject. Workspace queries and Gmail rows are owner-scoped. PostgreSQL enables RLS and revokes anon/authenticated table privileges. | Verify grants and two-account isolation against the deployed database. Backend SQL role remains trusted. |
| Admin privilege escalation | Fixed server-side owner identity. Admin manages grants and reads signup metadata. Client UI access does not grant API access. | Verify regular members cannot call Admin APIs and revocation takes effect on the next private request. |
| OAuth replay or wrong account | Ten-minute single-use state, PKCE, hashed browser verifier, authenticated same-owner completion and fixed frontend return origin. Confirmed Gmail profile shown in Settings. | Verify denied consent, different browser/account, replay and reconnection live. |
| Token exposure | Fernet-encrypted provider payloads in database. Backend-only encryption secret and provider secret. No-store Gmail responses, no-referrer headers, and Uvicorn callback query redaction. | Verify reverse-proxy logging as well. Plan key rotation and response to credential exposure before broad rollout. |
| Mailbox collection | Explicit read-only authorization. Sync fetches subject, sender and date on demand for filtered recent mail. Bodies/attachments are outside collection. Gmail metadata is for review; it cannot trigger job changes. | Check Google testing and verification requirements before expanding access. Define retention and user disclosures. |
| Risky file processing | Consent, 5 MB upload, PDF page cap and DOCX expanded-size cap. Originals processed transiently. | Add parser resource isolation and request limits before external beta. |
| Unauthorized deletion or provider revocation failure | Destructive actions use confirmation, owner-scoped deletion, and attempted Google revoke on disconnect. Failed provider revocation has in-product follow-up guidance on the Gmail disconnect flow. | Full account deletion, export, retention and backup handling are open. Workspace deletion currently does not report provider revocation failure separately. |

## Configuration and operation

Keep database password, Google client secret and Gmail encryption secret in backend configuration only. Keep the encryption secret stable across deployments and treat encrypted rows as sensitive. Use the frontend publishable Supabase key and exact CORS origins. Demo identity and SQLite mode are for local use only. Workspace job descriptions, resume facts and email metadata are user data, and should stay out of debugging logs and test fixtures.

If a credential is exposed, contain the affected integration, revoke/rotate the relevant credential, review logs and database access, then verify reconnect and the user's ability to remove the grant. Do not rotate unrelated keys. For abnormal email mismatches, suspend broader rollout, reproduce using sanitized fixtures, and keep users in control of status changes. See [Gmail runbook](GMAIL.md) and [deployment](DEPLOYMENT.md).
