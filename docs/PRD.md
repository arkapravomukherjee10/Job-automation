# Alongside product requirements

**Baseline:** 16 November 2026 · invite-only job-search beta. Alongside was originally named Job Radar. See [project record](PROJECT_RECORD.md) for evidence and deployment history.

## Problem and audience

Job seekers, initially students and early-career applicants, need one place to decide what to apply for, keep a truthful resume, and remember what happened after applying. The beta owner needs to grant or withdraw access without opening the authentication dashboard for each tester.

| Persona | Outcome |
| --- | --- |
| Job seeker | Know the next action, preserve the facts in a resume, and see the current application stage. |
| Beta owner | Invite and manage testers and see verified signup metadata without seeing their resumes, jobs, or inbox data. |

## Requirements

| ID | Requirement and acceptance criteria | State |
| --- | --- | --- |
| P1 | Verified email-link sign-in. Invited users reach their workspace. Verified users without an invitation see a waiting screen. Revocation blocks subsequent private requests. | Implemented. Repeat production tests with owner and tester. |
| P2 | Paste a job URL and description, see the reason for its score or routing, and find it by search or stage. Reject duplicate URLs in the same workspace. | Implemented. |
| P3 | Set multiple roles and locations, preferred skills, exclusions, and strong-match threshold. Saving preferences rescores eligible open jobs while preserving manually set stages. | Implemented. |
| P4 | Open the original posting and apply there. Record submission manually, once per job. Preserve the original application timestamp through later stage changes. | Implemented. |
| P5 | With consent, extract and prefill a supported resume, let the user correct it, and save a new base version. Compare edits to a confirmed base and explain violations. The user reviews factual meaning. | Implemented. |
| P6 | Connect Gmail separately via explicit read-only consent, show the selected mailbox, and manually sync recent job-email headers. Show possible matches for review, without changing a job. Disconnect removes local connection data and attempts provider revocation. | Merged and backend live. Frontend publish and real consent/sync pending. |
| P7 | Owner can add, revoke, and restore grants and see verified signups. Sharing the portal link is manual. | Implemented. Verify in production. |
| P8 | Delete workspace data with confirmation. Full identity deletion, backup-retention handling and export have separate release requirements. | Workspace deletion implemented. Full lifecycle planned. |

## Rules and boundaries

- Application submission stays with the user on the original portal. Opening a link marks nothing as submitted.
- Matching is deterministic and explainable. It uses role/location substring filters and skill mentions, rather than a verified assessment of suitability.
- Gmail suggestions rely on limited header evidence and require review. The initial release has manual sync only.
- External job ingestion, richer scoring, AI-assisted tailoring, PDF export, mentoring and scheduled mailbox sync need separate decisions and acceptance criteria.

## Beta outcomes and release acceptance

Measure whether a tester can independently sign in, add a job, find it again, record an application and confirm a resume version. For Gmail, measure connect and sync completion, useful suggestions, and false or ambiguous matches using voluntary tester feedback. Baselines and targets are TBD. Use a voluntary beta checklist until a privacy-reviewed measurement plan exists.

Gmail release acceptance requires the owner to complete consent, see the expected mailbox, run a manual sync, verify that job stages stay intact, and disconnect. External rollout additionally requires two-account isolation, reliable email delivery, database permissions checks and the gates in [build plan](buildplan.md). Interaction details live in [UX spec](UX_spec.md).
