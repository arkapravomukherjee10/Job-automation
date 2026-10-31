# Initial implementation scope

This is a functioning foundation. The original PRD is superseded by the scope decision below where it describes automated applications.

## Application policy

All applications are manual. Auto-apply is removed from the roadmap, including submission adapters, Up next/send queues, hold windows, daily application caps, automation pause/kill switches and Applied (Auto). Strong matches go to Ready to Apply. Resume approval prepares a document; it never submits an application.

Users open the original posting, apply on the portal and return to mark the job Applied (Manual). Opening a link is not evidence of submission and does not change status. Future read-only Gmail integration may identify confirmation and status emails; it is not implemented yet.

Implemented: manual job ingestion and tracking, simple deterministic scoring/filtering, per-user persisted preferences, resume text extraction and structured version confirmation, consistency validation, activity history, production JWT invitation enforcement and owner-admin invitation management, local demo and deployment configuration.

Deliberate limitations:
- No Gmail/ATS/aggregator fetches, AI calls, or scheduled ingestion workers. UI states explicitly report unavailable connections. No third-party credentials are collected.
- Rule-based resume prefill supports common headings, skills lists, experience bullets and exact experience-detail lines. Ambiguous or wrapped content requires review. No OCR, resume PDF rendering, side-by-side diff, or AI chat.
- Scores measure preferred-skill text mentions, not the PRD's full weighted criteria. Role/location filters are substring checks. No controlled role taxonomy, salary estimation, culture inference, or notice-period rules yet.
- Resume facts are user-entered structured values. Similarity and token checks cannot establish semantic truthfulness, and skills added implicitly in prose can evade dictionary checks. Every resume rewrite requires human review.
- No per-job timeline or application-to-resume version association yet. The activity log records workspace actions.
- No raw resume upload storage, full account deletion, notification delivery, retention automation, or export.
- Local SQLite validation is not proof that the Supabase production configuration works.

Before external beta: exercise production authorization and PostgreSQL RLS; add API rate limiting and parser resource isolation; complete user-data deletion. Before live integration: verify provider terms, Gmail OAuth requirements, consent scopes and per-user encrypted secret storage.

Admin access is fixed to arkapravo.mukherjee10@gmail.com after email verification. Invitation management is now inside the app; Supabase only supplies authentication. Signups are tracked when a verified account first reaches the app. Pending and revoked accounts cannot access private features. Inviting does not send an outbound email automatically.
