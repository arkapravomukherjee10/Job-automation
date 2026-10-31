# Job Radar usability and accessibility review

Reviewed the implemented sign-in, email-sent, waiting-for-invitation, connection-error, Home, To do, Jobs, job details, add-job form, Settings, resume review, and Admin flows. This is a review of the current beta, not a claim of complete WCAG conformance or implementation of the entire PRD.

## Changes

- Persistent, text-labeled Sign out in the signed-in header, including mobile; equivalent control remains available before workspace access loads and for waiting accounts.
- Sign out clears the local Supabase session and private UI state. A reload after logout stays signed out. Unavailable backend requests produce actionable messages and retain the sign-out control.
- Higher text contrast, larger small text, 44px button targets, stronger input boundaries and visible focus indicators.
- Sticky header, mobile layout without page-level horizontal overflow, current-navigation semantics, skip link, and keyboard focus on page changes.
- Native modal dialogs with a Tab/Shift+Tab focus loop, Escape dismissal, initial focus, focus restoration, inert background, scroll locking and accessible names. Destructive actions require explicit confirmation, with Cancel initially focused.
- Accessible application-stage filters, clear-filter recovery, truthful empty states and a disabled Already applied action.
- Labeled resume text review, accessible admin tables, useful loading/retry feedback, and a resend countdown for login emails.

## Verification

`cd frontend && PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:ux` runs nine browser scenarios. The executable override is optional on machines with Playwright's own Chromium installed (`npx playwright install chromium`). Tests use isolated, simulated Supabase sessions and API responses; no real verification emails are sent.

The suite checks Home, To do, Jobs, Settings and Admin at 360, 768 and 1440px; add/job-detail dialogs; login/waiting/error states; resume review; empty and filtered lists; destructive confirmation; sign out/session clearing; and blocked duplicate application confirmation. It scans the reviewed states with axe WCAG 2 A/AA, 2.1 A/AA, 2.2 AA and best-practice rules. Automated checks cannot establish full accessibility or replace real assistive-technology and device testing.

Production builds and dependency auditing are separate checks. Real email delivery, real Supabase callback/session verification, Render CORS, and the production owner account still require an end-to-end live check. Earlier workspace requests to the public sites were blocked by the workspace egress proxy, so do not report those external flows as proven by the mocked browser tests.
