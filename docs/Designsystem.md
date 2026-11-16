# Alongside design system

**Source of truth for rendered values:** [style.css](../frontend/src/style.css). The values below document the existing visual language. CSS custom-property migration and a shared component library remain optional future work.

| Role | Existing value or pattern |
| --- | --- |
| Canvas | Soft neutral green `#f7f9f7` |
| Body text | Deep green-gray `#273b34` |
| Primary action and focus | Green `#196148`, white button text |
| Field surface / border | White / `#dce4de` base field border, with component overrides where present |
| Type | DM Sans for UI/body. Manrope for headings and wordmark. Local sans-serif fallback. |
| Base leading | 1.5 |
| Base page heading | 30 px, weight 800, tracking −1.2 px, subject to responsive overrides |
| Radius | 7 px base inputs and 9 px base buttons |
| Icons | Lucide with visible text on important actions. Decorative icons stay hidden from assistive technology. |

## Components

- **Shell:** quiet workspace chrome with a visible selected destination and stable page heading. Keep primary actions beside the heading where space permits.
- **Panels and cards:** group one task per panel. Use heading, short guidance and contents in that order. Cards display a task or job title first, then context and status.
- **Buttons:** filled primary for the next action, secondary for reversible or supporting choices, danger style inside a confirmation for destructive actions. Give pending and disabled actions clear meaning in text.
- **Forms:** explicit labels, logical field order and inline help. Keep typed values when a recoverable error occurs. Radio/checkbox rows use natural label alignment. Never rely on a placeholder as the label.
- **Stage pills and match indicators:** pair text with color. Use exact workflow labels and do not equate rank with certainty.
- **Feedback:** signs like “Already applied,” human-readable errors and explicit empty states. Distinguish no data, no matches and an unavailable feature.
- **Dialogs:** native dialog, labeled title, controlled close, focus loop and restoration. Destructive actions start on Cancel.
- **Gmail review:** prioritize mailbox, Sync action and time, then individual subject, sender/date, and match/status text. Permit wrapping of long subjects and senders. Keep the Gmail link and Jobs action distinct.

## Responsive and accessibility acceptance

The CSS uses notable breakpoints at 700, 1100 and 1500 px. Check 360, 768 and 1440 px in the browser tests. Keep targets at least 44 px where feasible, preserve readable contrast, prevent horizontal page overflow and honor reduced motion. Use the existing 3 px focus outline with 3 px offset as the baseline. Check keyboard-only use and screen-reader announcements as well as axe. Automated checks cover sampled screens and do not certify conformance. See [UX spec](UX_spec.md) for states and [UX review](UX_REVIEW.md) for coverage.
