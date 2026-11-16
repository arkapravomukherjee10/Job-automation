# Gmail connection and manual email review

This implementation adds read-only Gmail OAuth and user-triggered metadata sync.
It is not continuous monitoring or automatic application submission/status updates.

## Deployment

Backend settings: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_REDIRECT_URI`, and `GMAIL_ENCRYPTION_SECRET` (a unique random value of at
least 32 characters). Keep them on Render. The owner confirmed the encryption
secret was saved on 16 November 2026; this was not independently inspected.
Do not regenerate it during deployment: existing encrypted connections depend on it.

The registered callback is
`https://job-radar-api-sudh.onrender.com/api/gmail/callback`.
The first `FRONTEND_ORIGINS` value is the fixed return destination. Production
requires HTTPS. No arbitrary return URL is accepted. Gmail stays unavailable
when configuration is incomplete; the rest of the application still works.

Deploy backend and frontend together. Pushing does not publish Cloudflare Pages;
build and upload the frontend separately. No additional Python packages are needed.
Three backend-managed tables are created: `gmail_oauth`, `gmail_connections`,
`gmail_messages`. PostgreSQL RLS is enabled and frontend-role privileges revoked.
Verify this on the deployed database before adding external users.

Uvicorn callback request logs redact the query string. Configure any additional
reverse-proxy logging to omit callback query strings as well.

## User flow

1. Sign into Alongside and open Settings.
2. Read and check the consent statement, then choose Connect Gmail.
3. Select the intended Google test-user mailbox and grant read-only access.
4. Return to the same browser and Alongside account. Confirm the displayed mailbox.
5. Choose Sync recent emails. Each batch checks up to 10 results; Sync next batch
   continues pagination. Once complete, the next sync starts a fresh recent scan.
6. Review sender, subject, possible job match and tentative status. Open the email
   in Gmail and update the correct job yourself. No email text is treated as an
   instruction to execute actions, and no model sees email data.
7. Disconnect removes saved tokens, pending authorizations and imported headers,
   and attempts Google revocation. If revocation cannot be confirmed, the UI asks
   the user to remove Alongside in Google Account permissions as well.

## Security and limitations

- Requests require the existing verified, invited Alongside session. OAuth state
  expires after 10 minutes, is single use and is bound to the initiating owner.
  PKCE protects code exchange. Finalization additionally requires the initiating
  browser's sessionStorage verifier and an authenticated POST. The public callback
  cannot activate a connection by itself.
- Access/refresh tokens and pending OAuth payloads are Fernet encrypted. Only a
  hash of state/browser verifier is stored. Frontend responses never include tokens.
- Sync calls Gmail metadata format with only Subject/From headers and timestamp.
  Bodies, snippets and attachments are not stored or fetched. The query searches
  the last 30 days, excludes Spam/Trash, and uses application/interview/offer/
  recruiting/candidacy-related subject terms. It can miss mail with other wording.
- Matches require both company and title text. All results require human review;
  ambiguous/unmatched emails remain visible. Subject-based status suggestions are
  fallible and never change a job, so duplicates or old emails cannot regress it.
- Stored message IDs deduplicate repeated scans per user. Mail older than the
  30-day window is pruned during successful sync; this is not scheduled retention.
  Only the latest 100 stored results are shown. Workspace deletion also disconnects
  Gmail, but does not delete the separate Supabase identity or provider backups.
- A database lease prevents concurrent syncs per connection. Generation checks
  prevent a disconnected/replaced connection being restored by an in-flight sync.
- Google testing-mode expiry, public verification requirements and real provider
  behavior still need live validation. No automatic worker is deployed.

## Live acceptance checks (pending)

Owner login/Admin access; deployed callback reachability; actual Google consent,
mailbox identity, refresh and disconnect; two invited users with isolated data;
denied/expired consent; missing read-only scope; production PostgreSQL RLS;
Google-side revocation; frontend redirect/session retention. Test code uses fake
Google responses and cannot establish these live results.

References: [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server),
[message listing](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list),
[message retrieval](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get).
