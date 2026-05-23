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
