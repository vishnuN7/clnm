# CLN Production Deployment

This setup deploys the app on a VPS with Docker and Nginx, while keeping the database on a managed cloud MySQL service.

## Recommended architecture

- Domain name from any registrar
- Cloudflare DNS in front of the domain
- VPS for the Node.js app and Nginx
- Managed MySQL for the database
- Object storage or a persistent volume for uploaded documents
- Automated backups for both database and uploads

## Step-by-step

### 1) Buy a domain

Register a domain from Namecheap, Porkbun, Cloudflare Registrar, or GoDaddy.

### 2) Create managed MySQL

Use a managed MySQL service such as DigitalOcean Managed Databases, AWS RDS, or Google Cloud SQL.

Create a database named `cln_db`, a dedicated user, and enable automated backups.

### 3) Prepare the VPS

Install Docker, Docker Compose, and Nginx on the server.

Open only these ports publicly:

- 22 for SSH
- 80 for HTTP
- 443 for HTTPS

### 4) Point the domain to the VPS

Create an `A` record for your root domain and `www` subdomain pointing to the VPS public IP.

### 5) Set production environment variables

Copy `deploy/.env.production.example` to a real `.env` file on the server and fill in the production values.

Important values:

- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `JWT_SECRET`
- `ALLOWED_ORIGIN`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`

### 6) Import the schema

Run `backend/setup.sql` against the managed MySQL database once before the first launch.

### 7) Start the app

From the project root on the VPS:

```bash
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.production up -d --build
```

### 8) Enable HTTPS

Use Let’s Encrypt with Nginx or Caddy. After the domain resolves correctly, issue the certificate and force HTTPS.

### 9) Set backups

Schedule daily database dumps and upload backups to offsite storage such as S3 or Cloudflare R2.

## Update workflow

1. Back up the database.
2. Back up uploaded files.
3. Pull the latest code.
4. Rebuild and restart the containers.
5. Verify login, uploads, and password reset.

## Security checklist

- Keep MySQL private and do not expose port 3306 publicly.
- Use a strong `JWT_SECRET`.
- Use app passwords or SMTP credentials with restricted access.
- Keep `ALLOWED_ORIGIN` set to the production domain only.
- Keep rate limiting enabled.
- Do not store secrets in the repository.

## Render backend setup

Render does not provide a managed MySQL database inside a Web Service, so the backend must point to an external MySQL host.

Use these values in the Render service environment settings:

- `PORT`: leave unset in Render, or let Render provide it automatically.
- `NODE_ENV`: `production`
- `DB_HOST`: the Cloud SQL public IP or managed MySQL hostname
- `DB_PORT`: usually `3306`
- `DB_USER`: the database username you created with your provider
- `DB_PASSWORD`: the password for that MySQL user
- `DB_NAME`: the database name you created, usually `cln_db`
- `JWT_SECRET`: a long random secret generated locally
- `ALLOWED_ORIGIN`: your Netlify frontend URL, for example `https://your-site.netlify.app`
- `FRONTEND_BASE_URL`: the same Netlify URL, used for password reset links
- `RESEND_API_KEY`, `RESEND_FROM`: values from your Resend account

Where each value comes from:

- MySQL host, user, password, and database name come from the database provider dashboard.
- `JWT_SECRET` should be generated locally, for example with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
- `ALLOWED_ORIGIN` and `FRONTEND_BASE_URL` should be your deployed Netlify URL, not `localhost`.
- Resend values come from your Resend dashboard after verifying a sender domain or address.

Render start command:

- Use `npm start` instead of `npm run dev`.

After setting the variables, import `backend/setup.sql` into the MySQL database once, then redeploy the Render service.
