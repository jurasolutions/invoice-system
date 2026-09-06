# Deploying

Target: **https://invoice-system.jurasolutions.com**, with the API on
**https://api.jurasolutions.com**.

Frontend on Cloudflare Pages, backend on Railway. Roughly half an hour, most of it
waiting for DNS.

---

## Read this first

**Two things will bite you if you skip them.**

### The API needs its own subdomain on the same domain

Not the `*.up.railway.app` address Railway gives you by default.

The session lives in a cookie. If the app is on `jurasolutions.com` and the API is on
`railway.app`, that cookie is a **third-party** cookie — and Safari blocks those outright,
with Chrome and Firefox tightening steadily. Sign-in would work on your laptop in Chrome
and fail on your phone, which is the worst way to find out.

Put the API on `api.jurasolutions.com` and both halves are the same site. The cookie is
first-party, nothing blocks it, and it keeps working as browsers get stricter.

### Railway's disk is wiped on every deploy

The records live in JSON files. Railway containers get a fresh filesystem on each deploy,
so **without a volume, every invoice you have issued disappears the next time you push.**

Attaching a volume (step 3) fixes it. Moving the store to Postgres — see
`prd/pending/prd-jura-invoicing-hosted-2026-09-06.md` — is the better long-term answer, but
a volume is genuinely sufficient for one person and one instance.

Do not skip step 3.

---

## Before you start

- `jurasolutions.com` is a zone in your Cloudflare account. Everything so far has been on
  `jurasolutions.sg` — if `.com` is a different domain, add it to Cloudflare first and let
  the nameservers propagate.
- The repo is pushed and Railway/Cloudflare can see it.
- Pick your real password now:

```bash
npm run hash-password -- 'a long passphrase you have not used anywhere else'
```

Keep the two values it prints. You need them in step 4.

---

## 1. Railway — create the service

New Project → **Deploy from GitHub repo** → `jurasolutions/invoice-system`.

`railway.json` in the repo already sets the build command, the start command and a health
check on `/__api/health`, so there is nothing to configure here. Leave the root directory
as the repo root — the workspace install needs it.

The first deploy will fail. That is expected: the server refuses to start in production
without a password hash. Step 4 fixes it.

## 2. Railway — keep it to one instance

Settings → make sure replicas is **1**.

A volume attaches to a single instance, and two instances writing the same counter file
would eventually hand out the same invoice number twice.

## 3. Railway — attach a volume

**This is the step that stops your records being deleted.**

Service → **Variables / Settings → Volumes → Add volume**. Mount path:

```
/data
```

Everything under it survives deploys and restarts.

## 4. Railway — environment variables

| Variable | Value |
| --- | --- |
| `ADMIN_PASSWORD_HASH` | the `scrypt$...` from `npm run hash-password` |
| `SESSION_SECRET` | the 64-character hex from the same command |
| `NODE_ENV` | `production` |
| `ALLOWED_ORIGIN` | `https://invoice-system.jurasolutions.com` |
| `JURA_DATA_PATH` | `/data/invoices` |
| `JURA_OUTPUT_PATH` | `/data/outputs` |
| `ADMIN_USERNAME` | optional; defaults to `admin` |

Do not set `PORT` — Railway sets it.

`ALLOWED_ORIGIN` has to be the exact origin, because a browser will not accept a wildcard
alongside credentials. No trailing slash.

Redeploy. It should come up, and the logs will say it wrote a default config and the five
templates onto the empty volume.

## 5. Railway — custom domain

Service → Settings → **Networking → Custom Domain** → `api.jurasolutions.com`.

Railway gives you a CNAME target. In **Cloudflare → jurasolutions.com → DNS**, add:

| Type | Name | Target | Proxy |
| --- | --- | --- | --- |
| CNAME | `api` | the target Railway shows | **DNS only (grey cloud)** |

Start with the proxy off. Proxied works too, but only with SSL/TLS mode set to **Full
(strict)** — on Flexible you get a redirect loop, and it is a miserable thing to debug
while you are also setting up three other things.

Wait for Railway to show the domain as active, then check:

```
https://api.jurasolutions.com/__api/health
```

You want `{"ok":true,...}`. Do not go on until you see it.

## 6. Cloudflare Pages — create the project

Workers & Pages → **Create → Pages → Connect to Git** → `jurasolutions/invoice-system`.

| Setting | Value |
| --- | --- |
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `frontend/dist` |
| Root directory | leave empty (the repo root) |

Environment variables, for **Production and Preview both**:

| Variable | Value |
| --- | --- |
| `VITE_API_URL` | `https://api.jurasolutions.com` |
| `NODE_VERSION` | `20` |

`VITE_API_URL` is baked into the bundle at build time, so it is public. That is fine — it
is an address, not a secret. Nothing else about the deployment ends up in the bundle.

**Changing it later means rebuilding**, not just editing the variable.

## 7. Cloudflare Pages — the domain

Pages project → **Custom domains → Set up a custom domain** →
`invoice-system.jurasolutions.com`.

The zone is in the same account, so Cloudflare adds the DNS record itself.

## 8. Sign in and finish the setup

Open **https://invoice-system.jurasolutions.com**, sign in with `admin` and the password
you hashed in step 4.

There will be a warning banner about company details. Go to **Settings** and fill in:

- registered name, UEN, registered address — then tick both confirmation boxes
- bank, account name and number, SWIFT, PayNow UEN — then tick the payment box

Until those are set the app will refuse to issue anything, which is deliberate: a document
carrying a placeholder UEN should never reach a client.

---

## Checking it actually works

1. `https://api.jurasolutions.com/__api/health` returns `{"ok":true}`.
2. `https://api.jurasolutions.com/__api/documents` returns **401**, not a list. If it
   returns data, stop — the API is open to the internet.
3. Sign in on the app. **Then reload.** If it drops you back to the login screen, the
   cookie is not sticking — see the first troubleshooting entry.
4. Sign in from your phone, on mobile data rather than wifi.
5. Create a draft invoice, issue it, print it. Then **redeploy the Railway service and
   check the invoice is still there.** That is the volume doing its job; if the document
   is gone, `JURA_DATA_PATH` is not pointing inside the mount.

---

## When it does not work

**Signed in, then signed straight back out on reload.**
The cookie is not being kept. Almost always the API is still on `*.up.railway.app` rather
than `api.jurasolutions.com`, making the cookie third-party. Check step 5. Also confirm
`ALLOWED_ORIGIN` matches the frontend origin exactly, with no trailing slash.

**"Cannot reach the API at …" on the login screen.**
`VITE_API_URL` is wrong, or was changed without rebuilding. Redeploy the Pages project.

**Everything 401s after signing in.**
`SESSION_SECRET` is changing between restarts — it is unset, so the server generates a new
one each boot and every existing session becomes invalid. Set it.

**The service will not start.**
Check the logs. If it says it is refusing to start, `ADMIN_PASSWORD_HASH` or
`SESSION_SECRET` is missing. That refusal is deliberate — it is what stops the published
default password ending up on the public internet.

**Documents vanished after a deploy.**
The volume is missing, or `JURA_DATA_PATH` points outside the mount. It must be under
`/data`. Anything already lost is not recoverable.

**A redirect loop on the API domain.**
Cloudflare proxy is on with SSL/TLS mode Flexible. Set it to Full (strict), or turn the
proxy off for that record.

---

## Backups

The records have to be retainable for five years. A Railway volume is a disk, not a
backup — check what snapshot support your plan currently offers, and do not assume it is
enough on its own.

Until the Postgres migration lands, the simplest belt-and-braces is to pull the records
down periodically:

```bash
npm run export -- --all      # PDFs, from a machine with the data mounted
```

and keep a copy of `data/invoices/` somewhere that is backed up. This is the weakest part
of the hosted setup as it stands, and it is the main reason
`prd/pending/prd-jura-invoicing-hosted-2026-09-06.md` exists.

---

## What each side ends up holding

```
Cloudflare Pages                     Railway
invoice-system.jurasolutions.com     api.jurasolutions.com
  the bundle                           the API, the rules, the records
  VITE_API_URL (public)                ADMIN_PASSWORD_HASH
  no credentials                       SESSION_SECRET
  no data                              /data volume
```

The frontend is a static file a person can read. It holds nothing worth stealing, and
every route it calls is checked again on the server.
