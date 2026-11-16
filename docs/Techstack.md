# Alongside tech stack

**Baseline:** 16 November 2026. Exact JavaScript versions come from [package-lock.json](../frontend/package-lock.json) and pinned Python dependencies from [requirements.txt](../backend/requirements.txt).

| Layer | Choice | Responsibility |
| --- | --- | --- |
| UI | React 19, TypeScript 5.7, Vite 6, CSS and Lucide | Single-page workspace, settings, admin, resume editing, Gmail review |
| Browser authentication | Supabase JavaScript SDK v2 | Email-link request, session and sign-out |
| API | Python, FastAPI, Pydantic, Uvicorn | API routing, validation, tenancy and service processes |
| Persistence | SQLAlchemy, psycopg, Supabase PostgreSQL | Workspace and integration data. Local demo uses SQLite. |
| JWT verification | PyJWT and Supabase JWKS | Verify issuer, audience, expiry and signature with asymmetric keys |
| Resume processing | pypdf, python-docx, RapidFuzz | Parse text PDF/DOCX and compare resume bullet text |
| Gmail | Google OAuth/Gmail REST API, HTTPX, cryptography/Fernet | Consent, mailbox identity, token encryption/refresh/revocation and metadata sync |
| QA | pytest, Playwright, axe | Backend regression and simulated browser/accessibility coverage |
| Hosting | Cloudflare Pages, Render, Supabase | Static assets, Python API, managed identity and database |

## Development and release

Use the [README](../README.md) for local start and test commands. Run `python -m pytest -q` from backend, and `npm ci`, `npm run build` and `npm run test:ux` from frontend with Playwright Chromium available. Test suites use SQLite or mock providers. Production checks require live provider sessions.

Render uses the backend root, pinned dependencies and Uvicorn on the supplied port, with `/health` as its health check. Deployment config pins Python 3.12.14. Production requires PostgreSQL and asymmetric Supabase Auth. Render builds from `main`. Cloudflare Pages currently uses a separate static build/upload. Keep the public browser API origin, Supabase URL and publishable key consistent with production, and keep demo mode off.

| Config boundary | Examples |
| --- | --- |
| Frontend build | `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (publishable key), `VITE_LOCAL_DEMO` |
| Render backend | `APP_MODE`, `DATABASE_URL`, `DB_PASSWORD`, `SUPABASE_URL`, `FRONTEND_ORIGINS`, and Google OAuth/encryption settings |
| Google Cloud | Gmail API, consent/test users, registered API callback |
| Supabase | Email delivery/redirects, signing keys, database pooler |

Cloud provider quotas and email delivery are operational dependencies. No scheduled Gmail worker, external job-feed adapter, AI provider or custom SMTP configuration is part of this baseline. See [deployment](DEPLOYMENT.md), [architecture](architecture.md), and [security](Security.md).
