# Alongside build and release plan

**Checkpoint:** 16 November 2026. Gmail source merged in PR #1. The new Render backend started after Supabase became reachable. Anonymous access to the Gmail status endpoint returned “Sign in required.” A production frontend build exists, and Cloudflare upload and authorized live Gmail tests remain pending. The owner asked to resume rollout in the next session.

| Order | Work | Exit criteria | Owner/dependency |
| --- | --- | --- | --- |
| 0 | Document the baseline and release status | Eight linked specs live in Git and distinguish implementation from live verification. | Engineering |
| 1 | Resume Gmail rollout | Confirm Render health and protected route, sign in to Cloudflare, upload the matching frontend build, verify the expected bundle and Settings UI. | Engineering, owner signs in to provider as needed |
| 2 | Live owner acceptance | Owner signs in to Alongside, grants Google consent, confirms mailbox, syncs a batch, reviews a match/empty result, confirms jobs are unchanged, disconnects. Verify Google revocation or record corrective action. | Owner consent and Google test-user configuration |
| 3 | Invite-only beta hardening | Test independent invited/uninvited accounts, revoke/restore, expired login, database grants and tenant isolation. Add rate limiting and file parser isolation. Verify email delivery to external recipients or set up suitable SMTP. | Engineering and invited test account |
| 4 | Data lifecycle | Define export and account deletion semantics, retentions and backups. Implement deletion scope with clear user status when external revocation fails. Verify isolation and restoration procedures. | Product and engineering |
| 5 | Improve job tracking and matching | Agree on scoring behavior and samples, per-job timeline, resume-version association, and a human-reviewed Gmail status action if justified. Verify duplicate and backwards-stage handling before offering any automated updates. | Beta feedback and product decisions |
| 6 | Evaluate future capabilities | Assess permitted data sources, AI provider design, document output and scheduled Gmail sync independently. Establish provider permissions and cost before scheduling work. | Scope and budget approval |

## Release checks

- CI/local gates: backend regression, frontend production build and browser/axe checks appropriate to the change. The initial Gmail change recorded 28 backend and 11 simulated browser scenarios. Simulated Google responses do not count as live consent.
- Deploy and verify each side independently. Preserve the prior Render deployment and Cloudflare release references for rollback. A failing database startup is a stop signal for frontend promotion.
- Smoke checklist: sign-in, access gating, add/mark job, resume validation, Gmail status, consent redirect, sync, disconnect. Check mobile and keyboard flow on changed screens.
- Record commit, live URLs, expected UI, test evidence and any unresolved or deferred check in the [project record](PROJECT_RECORD.md). Never put credentials or mailbox contents in tracked evidence.

See [PRD](PRD.md), [UX spec](UX_spec.md), [deployment guide](DEPLOYMENT.md) and [Gmail runbook](GMAIL.md).
