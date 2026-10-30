# Job Radar

An invite-only job-search beta: React/TypeScript frontend, Python/FastAPI backend, and Supabase PostgreSQL/authentication in production. Deployment targets: Cloudflare Pages and Render. Free-plan availability and limits must be checked before deploying; this repository does not guarantee zero charges.

## Application workflow

Applications are always submitted by the user on the original portal. Open a posting, apply there, then return and choose **Mark as applied**. Opening a posting does not change its stage. Auto-apply is removed from the product scope. Future Gmail tracking may update statuses from confirmation emails; it is not connected yet.

## What works now

- Home, To do, Jobs, Settings, responsive layout, empty states and activity history.
- Manually add a URL and pasted job description; no website fetching or scraping.
- Basic deterministic preferred-skills scoring, role/location substring filters, company exclusions, near misses, duplicate URL prevention and manual stage changes.
- PDF/DOCX text extraction (5 MB), explicit resume-processing consent, manual structured confirmation, immutable saved base versions.
- Python consistency checks for exact structured facts, confirmed skills, source IDs, source-specific numbers, similarity and length.
- Tenant-scoped persistence and invite-list authorization with verified Supabase JWTs in production. Explicit local development mode needs no external credentials.

## Run locally

Use the existing checkout; a separate worktree is unnecessary.

```bash
cd /workspace/Job-automation
python -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
cd backend
APP_MODE=development ../.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

In another terminal:

```bash
cd /workspace/Job-automation/frontend
npm ci
VITE_LOCAL_DEMO=true VITE_API_URL=http://localhost:8000 npm run dev
```

Development mode uses one shared demo identity and local SQLite. Never expose that backend publicly. No sample jobs or simulated application results are inserted. In Settings, save processing consent before uploading a resume. The extracted text is a review aid; the JSON editor currently requires manually structured facts and bullets.

## Validate

```bash
cd /workspace/Job-automation/backend
../.venv/bin/python -m pytest -q
cd ../frontend
npm run build
```

See [deployment instructions](docs/DEPLOYMENT.md) and [scope and remaining work](docs/SCOPE.md).
