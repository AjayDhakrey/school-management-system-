# SchoolSphere VPS deployment

This runbook targets Ubuntu 24.04/22.04 with Nginx, PM2, Node.js 22, and
PostgreSQL. Replace `school.aflix.co.in` if a different domain will be used.

## 1. Point the domain at the VPS

Create an `A` record for `school.aflix.co.in` pointing to the VPS public IPv4
address. DNS must resolve before requesting the TLS certificate.

## 2. Install the server software

```bash
sudo apt update
sudo apt install -y nginx git curl postgresql postgresql-contrib certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
node --version
npm --version
```

The API requires Node.js 22.5 or newer.

## 3. Clone the application

```bash
sudo mkdir -p /var/www/schoolsphere
sudo chown "$USER":"$USER" /var/www/schoolsphere
git clone https://github.com/AjayDhakrey/school-management-system-.git /var/www/schoolsphere
cd /var/www/schoolsphere
```

If the repository is private, use a GitHub deploy key or clone it over SSH.

## 4. Create the PostgreSQL database

For PostgreSQL installed on the same VPS:

```bash
sudo -u postgres psql
```

Run the following in `psql`, replacing the password with a long random value:

```sql
CREATE USER schoolsphere_app WITH PASSWORD 'REPLACE_WITH_A_LONG_RANDOM_PASSWORD';
CREATE DATABASE schoolsphere OWNER schoolsphere_app;
\q
```

Alternatively, use an existing managed PostgreSQL/Supabase connection string.
For a local VPS database, TLS must be disabled in the application configuration.

## 5. Configure production secrets

```bash
cp server/.env.example server/.env
nano server/.env
```

Use this production configuration for a local PostgreSQL database:

```dotenv
NODE_ENV=production
PORT=4000
JWT_SECRET=REPLACE_WITH_AT_LEAST_32_RANDOM_CHARACTERS
JWT_EXPIRES_IN=2h
CORS_ORIGINS=https://school.aflix.co.in
DB_DRIVER=postgres
DATABASE_URL=postgresql://schoolsphere_app:URL_ENCODED_PASSWORD@127.0.0.1:5432/schoolsphere
DATABASE_SSL=false
PG_POOL_MAX=10
```

Generate a suitable JWT secret with `openssl rand -hex 32`. URL-encode special
characters in the database password. Never commit `server/.env`.

For Supabase or another TLS-enabled managed PostgreSQL service, use its connection
string and set `DATABASE_SSL=true`.

## 6. Install, build, migrate, and seed

```bash
cd /var/www/schoolsphere
npm ci
npm ci --prefix server
npm run build
npm run migrate
npm run seed
```

Run `npm run seed` only for a new database. Do not run it during ordinary updates.

## 7. Start the API with PM2

Run this command from `/var/www/schoolsphere`, because the PM2 configuration uses
a relative `./server` working directory:

```bash
cd /var/www/schoolsphere
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup systemd
```

The last command prints one additional `sudo ...` command. Run that printed command,
then run `pm2 save` again.

Verify the API before configuring Nginx:

```bash
curl --fail http://127.0.0.1:4000/api/health
pm2 logs schoolsphere-api --lines 100
```

The health endpoint should return `{"ok":true,"database":"reachable"}`.

## 8. Configure Nginx and HTTPS

```bash
sudo cp deploy/nginx-school.aflix.co.in.conf /etc/nginx/sites-available/schoolsphere
sudo ln -s /etc/nginx/sites-available/schoolsphere /etc/nginx/sites-enabled/schoolsphere
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d school.aflix.co.in
```

If using a different domain, edit both `server_name` in the Nginx file and
`CORS_ORIGINS` in `server/.env`, then rebuild/restart as appropriate.

Optionally enable the firewall after confirming SSH access:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

Port 4000 should not be opened publicly; Nginx reaches it over localhost.

## 9. Verify production

```bash
curl --fail https://school.aflix.co.in/api/health
curl -I https://school.aflix.co.in/
systemctl status nginx --no-pager
pm2 status
```

Also sign in through the browser and test one read and one write operation.

## Deploy future updates

```bash
cd /var/www/schoolsphere
git pull --ff-only
npm ci
npm ci --prefix server
npm run build
npm run migrate
pm2 restart ecosystem.config.cjs --env production --update-env
sudo nginx -t
sudo systemctl reload nginx
```

Back up PostgreSQL before deploying migrations to a production database.

## Rollback basics

Application code can be rolled back by checking out a known good commit, rebuilding,
and restarting PM2. Database migrations are forward-only, so restore a pre-deploy
database backup if a schema rollback is required.

Useful diagnostics:

```bash
pm2 logs schoolsphere-api --lines 200
sudo tail -n 200 /var/log/nginx/error.log
sudo journalctl -u nginx -n 100 --no-pager
curl -v http://127.0.0.1:4000/api/health
```
