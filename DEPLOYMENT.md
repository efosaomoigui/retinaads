# Retinaad deployment

## Requirements and install

Use Node.js 22.12+ and one persistent Node process behind an HTTPS reverse proxy.
From the source checkout: `npm install`, configure `.env` from `.env.example`,
then `npm run build` and `npm start` (default port 3001).

For a ready-to-run handover, configure public build variables first and run
`npm run package:retinaad`. Copy the generated `release/retinaad-*` folder to the
server. In that folder run `npm install --omit=dev`, configure `.env`, then
`npm start`. It contains the built website and only the required Node runtime;
no source build is needed on the destination. Keep it running with the host's
process manager. Stop/restart this service without affecting RetiBazaar.

## Environment and Turnstile

Set `NODE_ENV=production`, `APP_URL` to the canonical HTTPS origin and optionally
`PORT`. Set `TRUSTED_PROXY_IPS` to only the actual proxy IP/CIDR addresses.
Set server-only `TURNSTILE_SECRET_KEY` and comma-separated exact
`TURNSTILE_ALLOWED_HOSTNAMES`. Create a Cloudflare **Managed** Turnstile widget for
those hostnames and set public `VITE_TURNSTILE_SITE_KEY` **before building**.
Set `VITE_RETIBAZAAR_WEBSITE_URL` before building if its public website differs from
`https://retibazaar.com`. Rebuild/repackage when a public build variable changes.
Never use `VITE_` for secrets. No email/Calendly integration or credentials are
currently required. No live Cloudflare WAF/proxy configuration is claimed.

Browsing is frictionless. Only form submissions invoke Turnstile; the server
verifies tokens, limits attempts, validates input, then saves successful records.
Missing keys fail submissions closed. There is no gateway or site-wide CAPTCHA.

## Persistent private storage and admin

Node automatically creates `private/submissions/` and `private/auth/` under the
application directory. Submissions use one atomic UUID-named JSON file each;
authentication uses `private/auth/admin.json` containing a salted scrypt hash.
Optional absolute `SUBMISSIONS_DIRECTORY` and `AUTH_DIRECTORY` overrides let the
host keep data outside release directories. Existing installations can preserve
their old submissions path and set `AUTH_DIRECTORY` to its old `auth` subfolder.
No records are moved or overwritten automatically.

**The Node application requires persistent writable filesystem storage for
file-based submissions and authentication data. If deployed to an ephemeral or
serverless platform, external persistent storage would be required.** None is
introduced here. Production disk persistence still needs confirmation by the host.
Preserve `private/` on upgrades, or use persistent overrides. Restrict filesystem
permissions to the service account; arrange secure backups and retention.

Run `npm run storage:check`, then `npm run admin:create` in an interactive terminal.
Enter the username and unique password (14+ characters, hidden input). Visit
`/admin` to view/filter enquiries, export JSONL or download CVs. For an intentional
password replacement use `npm run admin:create -- --replace`.
Sessions expire after eight hours; logout, account replacement and process restarts
invalidate them. Restarting does **not** remove submission/auth files. Login and
submission limits are in-memory per process; do not run multiple workers without
appropriate host/edge limits. Cookies are Secure/HttpOnly/SameSite=Strict in production.

## Reverse proxy and HTTPS

Proxy the whole site to Node, which serves **only dist** plus intended API/admin
routes. Never use the application root as a web document root or expose `private/`,
`server/`, `.env`, logs or source files through aliases. Keep the Node port private.
The proxy must overwrite forwarding headers. The same pattern works with Apache
or Nginx; use the host's existing TLS certificate configuration.

Nginx example inside an existing HTTPS `server` block:

```nginx
location / {
    client_max_body_size 15m;
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto https;
}
```

Apache equivalent in the HTTPS virtual host (proxy, proxy_http and headers modules):

```apache
ProxyPreserveHost On
RequestHeader unset X-Forwarded-For
RequestHeader set X-Forwarded-Proto "https"
ProxyPass / http://127.0.0.1:3001/
ProxyPassReverse / http://127.0.0.1:3001/
```

Use `TRUSTED_PROXY_IPS=127.0.0.1` only when that is the actual proxy source address.
Redirect HTTP to HTTPS. Admin rejects HTTP and incorrect origin configuration.

## Quick production test

Confirm homepage/deep links load without a challenge. Submit Contact, Demo,
Careers (including CV) and a request with real Turnstile keys; verify saved records
in `/admin`. Check failed verification is rejected, logged-out admin APIs return
401, and `/private/auth/admin.json`, `/server/app.mjs` and `/.env` return 404.
Restart the service and confirm the records and admin account remain (sign in again).
Repeat persistence verification after a deployment. Never ship provider test keys.
Repository checks: `npm run test:security`, `npm run lint`, `npm run build`.

## Independent RetiBazaar website

The public RetiBazaar experience has no Retinaad API/auth dependency: buyer briefs
are local to the browser and platform links are external. Separate entry points
build Retinaad to `dist/` and RetiBazaar to `retibazaar/dist/`; shared source
assets/utilities remain in this repository.

Retinaad: `npm run build` / `npm start`.
RetiBazaar: `npm run build:retibazaar` / `npm run start:retibazaar` (port 3002).
RetiBazaar reads only `retibazaar/.env` and has no admin, private data, Turnstile
secret or corporate submission endpoint. See [its deployment notes](retibazaar/DEPLOYMENT.md)
in the source repository. The Retinaad handover does not include RetiBazaar runtime.
