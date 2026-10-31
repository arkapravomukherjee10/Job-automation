# Deployment

Deployment: frontend https://job-radar-940.pages.dev and API https://job-radar-api-sudh.onrender.com. Cloudflare uses API uploads rather than automatic Git deployments. Verify current plan terms and quotas first; do not enable paid upgrades to complete this guide without the owner's approval.

## Supabase

1. Create a project and retain the project URL, public anonymous key, and PostgreSQL connection string securely. Never place a database password or service-role key in frontend variables.
2. Enable email signups with email verification in Supabase. The app controls beta authorization; uninvited verified accounts see only a waiting screen. Login accepts email magic links or OTP codes with account creation enabled. Configure a supported SMTP provider and test email delivery; Supabase default delivery can be restricted to project-team addresses.
3. Use an asymmetric JWT signing key (ES256 or RS256). The backend verifies issuer, audience, expiry and signature via the project's JWKS endpoint. Legacy HS256 tokens are not accepted.
4. Use the provider's compatible PostgreSQL pooler connection with TLS (`sslmode=require`) and the SQLAlchemy `postgresql+psycopg://` scheme. The backend creates the records table and enables RLS with no direct client policies; anon/authenticated table privileges are revoked. Backend DB credentials must have the rights to create tables and manage RLS. Do not grant frontend roles access to this table.
5. Sign in as arkapravo.mukherjee10@gmail.com to access the Admin screen. Add or remove invited emails and view first verified app sign-ins there. No manual Supabase account creation is needed. Existing INVITED_EMAILS entries are imported once per email; revocations survive restarts. Adding an email grants access but does not send an email; share the app link with the user.

## Render backend

Deploy the repository using render.yaml. Choose the free web-service plan only if currently available and suitable. Set APP_MODE=production, DATABASE_URL, SUPABASE_URL and FRONTEND_ORIGINS (exact Cloudflare origin, no trailing slash). The service fails startup without production requirements. It binds to the supplied PORT and serves /health.

Free service sleep, memory and execution limits constrain processing. No durable scheduled automation is implemented. Do not add keep-alive pings to evade provider limits. Uploaded originals are processed transiently and not persisted; confirmed structured resumes are stored in PostgreSQL. Supabase file storage integration remains future work.

## Cloudflare Pages frontend

- Root directory: frontend
- Build command: npm ci && npm run build
- Output directory: dist
- VITE_API_URL: public HTTPS Render API origin
- VITE_SUPABASE_URL: Supabase project URL
- VITE_SUPABASE_ANON_KEY: public project anonymous key
- VITE_LOCAL_DEMO: false (never true for a public deployment)

Set the final Pages origin in Render's FRONTEND_ORIGINS. The included redirects support SPA navigation. Configure authentication redirect URLs in Supabase if using invitation links. The sign-in UI accepts OTP codes and email links, with account creation enabled. Authorization requires a signed otp/invite authentication method and checks current invitations on every private request.

## Release checks

Verify /health, invited and uninvited login, expired tokens, email delivery, tenant isolation on PostgreSQL, DOCX/PDF parsing, data persistence after a backend restart, and the dashboard at 360px. Test role permissions on the deployed database. Production infrastructure and OAuth have not been validated by local tests.

Workspace data deletion does not delete the Supabase auth account or provider backups. Do not advertise complete account deletion until admin auth deletion and backup-retention policies are implemented. A domain or SMTP allowance may introduce costs; verify before public use.

## Database password without URL encoding

Set `DATABASE_URL` without a password, for example `postgresql+psycopg://postgres.PROJECT_REF@POOLER_HOST:5432/postgres?sslmode=require`, and set `DB_PASSWORD` separately in Render to the exact raw Supabase database password. Do not encode it or add quotes. The backend passes reserved characters unchanged using a SQLAlchemy URL object. Existing encoded URLs remain supported when `DB_PASSWORD` is not set. Never log or commit actual credentials.

## Admin and signup tracking

The owner email is fixed server-side to arkapravo.mukherjee10@gmail.com. The app creates RLS-protected beta_invitations and beta_members tables; frontend database roles have no direct access. Admins see signup metadata only, not other users' jobs or resumes. Signup tracking begins at first verified app sign-in, not unverified email attempts or historical Supabase-only accounts. Revocation blocks subsequent private requests using existing tokens and preserves user data. Bootstrap admin access cannot be removed through the invitation list. No service-role key is needed.
