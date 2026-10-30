# Deployment

Deployment has not been performed. Provider accounts, settings and credentials are required. Verify current plan terms and quotas first; do not enable paid upgrades to complete this guide without the owner's approval.

## Supabase

1. Create a project and retain the project URL, public anonymous key, and PostgreSQL connection string securely. Never place a database password or service-role key in frontend variables.
2. Disable public signups. Provision invited users through the admin dashboard and configure email OTP delivery with a supported SMTP provider. Configure the email template to display the OTP token. Test delivery before inviting users; provider default email restrictions are not a production email service.
3. Use an asymmetric JWT signing key (ES256 or RS256). The backend verifies issuer, audience, expiry and signature via the project's JWKS endpoint. Legacy HS256 tokens are not accepted.
4. Use the provider's compatible PostgreSQL pooler connection with TLS (`sslmode=require`) and the SQLAlchemy `postgresql+psycopg://` scheme. The backend creates the records table and enables RLS with no direct client policies; anon/authenticated table privileges are revoked. Backend DB credentials must have the rights to create tables and manage RLS. Do not grant frontend roles access to this table.
5. Add invited emails to the backend's INVITED_EMAILS list as well as provisioning their auth accounts. A valid login alone cannot access the API without an invitation.

## Render backend

Deploy the repository using render.yaml. Choose the free web-service plan only if currently available and suitable. Set APP_MODE=production, DATABASE_URL, SUPABASE_URL, INVITED_EMAILS (comma-separated emails), and FRONTEND_ORIGINS (exact Cloudflare origin, no trailing slash). The service fails startup without production requirements. It binds to the supplied PORT and serves /health.

Free service sleep, memory and execution limits constrain processing. No durable scheduled automation is implemented. Do not add keep-alive pings to evade provider limits. Uploaded originals are processed transiently and not persisted; confirmed structured resumes are stored in PostgreSQL. Supabase file storage integration remains future work.

## Cloudflare Pages frontend

- Root directory: frontend
- Build command: npm ci && npm run build
- Output directory: dist
- VITE_API_URL: public HTTPS Render API origin
- VITE_SUPABASE_URL: Supabase project URL
- VITE_SUPABASE_ANON_KEY: public project anonymous key
- VITE_LOCAL_DEMO: false (never true for a public deployment)

Set the final Pages origin in Render's FRONTEND_ORIGINS. The included redirects support SPA navigation. Configure authentication redirect URLs in Supabase if using invitation links. The sign-in UI uses an email OTP code for existing users, with account creation disabled.

## Release checks

Verify /health, invited and uninvited login, expired tokens, email delivery, tenant isolation on PostgreSQL, DOCX/PDF parsing, data persistence after a backend restart, and the dashboard at 360px. Test role permissions on the deployed database. Production infrastructure and OAuth have not been validated by local tests.

Workspace data deletion does not delete the Supabase auth account or provider backups. Do not advertise complete account deletion until admin auth deletion and backup-retention policies are implemented. A domain or SMTP allowance may introduce costs; verify before public use.
