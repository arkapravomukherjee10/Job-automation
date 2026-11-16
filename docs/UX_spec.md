# Alongside UX specification

**Baseline:** 16 November 2026. Current behavior is described unless labeled planned. The Gmail interface is implemented but awaits the Cloudflare upload and live test.

## Navigation and permissions

The signed-in shell has **Home**, **To do**, **Jobs**, and **Settings**, plus **Admin** for the verified owner. The header keeps sign-out accessible on mobile. The sidebar adapts to mobile navigation. Tabs are app state, not dedicated deep links. The Gmail return fragment opens Settings and is cleared after completion. Keyboard navigation uses a skip link, current-tab semantics and focus on the page title after navigation.

| Role | Access |
| --- | --- |
| Anonymous | Request a sign-in link and handle expired links. |
| Verified without active invite | Waiting screen, recheck access, sign out. |
| Invited verified user | Own jobs, preferences, resume, activity and optional Gmail, plus workspace deletion. |
| Verified owner | Own workspace and Admin invitation/signup metadata. Admin does not confer access to other users’ workspace data. |

## Screen inventory and actions

| Screen or overlay | Entry, actions and feedback |
| --- | --- |
| Sign-in | Enter email, request a link, resend after countdown, or change address. Show link-sent, expired-link and request-error states. |
| Access check | After callback, verify current invitation. Handle waiting, load errors and retry without hiding sign-out. |
| Home | Review workspace summary, next steps and recent activity. Open quick actions or the relevant tab. Distinguish a new workspace from a completed queue. |
| To do | Review jobs ready to apply or awaiting approval. Search and open a job. Show a useful empty state. |
| Jobs | Search and filter by stage or match category, clear filters, add a job, or open job details. Distinguish an empty workspace from no matching results. |
| Add opportunity dialog | Enter title, company, placement/location and salary when known, description and original URL. Cancel or save. Keep validation and duplicate errors visible. |
| Job detail dialog | Review score, match reason, posting and stage. Open the original posting, mark applied or update stage. Display Already applied after submission is recorded. |
| Settings / preferences | Edit targets, exclusions, skills and match threshold. Save, show rescoring feedback. |
| Settings / resume | Save consent, upload, review source text and prefilled fields, correct data, save a confirmed version, or compare an edited draft against the confirmed base. Show all validation violations and extraction warnings. |
| Settings / Gmail | See setup/connection state, consent, Connect or Reconnect, selected mailbox, recent manual sync time and pagination. Review candidate subject/sender/date/title/status, open original mail, or return to Jobs. Disconnect via confirmation. |
| Settings / data | Review scope of workspace deletion, cancel or confirm. Login identity is managed separately. |
| Admin | Invite or restore by email, copy app link, see inviting and signup status, and confirm revocation. It does not send an invite email. |

## Core journeys and validation

1. **Enter the beta.** Email → newest link → access check → Home or waiting. Use concise recovery instructions on expiration and network failure. Sign-out clears private UI state.
2. **Track a job.** Add listing → verify score/reason → open original posting → apply independently → return and mark applied. API requires title/company up to 200 characters, description 10–40,000 characters, an HTTP(S) URL, location up to 200, and salary up to 100. Reject a duplicate URL and repeat application confirmation. Allowed manual stages are Ready to Apply, Awaiting Approval, Applied (Manual), In Review, Interview, Offer, Rejected and Archived. Near Misses is a scoring outcome.
3. **Tune preferences.** Allow up to 20 roles and 20 locations, trim and deduplicate those entries, with up to 200 characters per entry. Preferred skills and company exclusions each allow up to 100 entries. Threshold is 80–100.
4. **Confirm a resume.** Save consent first. Accept text-based PDF and DOCX up to 5 MB. Flag unreadable or scanned files and suggest another copy. Confirm at least one bullet with unique IDs. A rewrite review compares exact facts, confirmed skills, bullet sources, numbers, similarity and length. Passing checks still requires human review.
5. **Review Gmail.** Check consent → Google account selection → same browser and Alongside account → verify displayed mailbox → manually sync. Show denied, expired, unavailable, in-progress, empty, more results and reconnect states as applicable. Missing or multiple matches need manual review. To switch mailboxes, disconnect the old one first.
6. **Manage beta access.** Enter a valid email, share the copied URL, verify signup status, and confirm removal if needed. An unverified attempt does not appear as a verified signup. Owner access cannot be revoked via the list.

Dialogs need a labeled heading, focus containment, Escape and focus restoration. Put initial focus on Cancel for destructive confirmations. Label inputs, keep focus visible, use text alongside color, and announce actionable errors and progress. See [design system](Designsystem.md) and [UX test coverage](UX_REVIEW.md).
