# Deploying

Target: **https://invoice-system.jurasolutions.sg**, with the API on
**https://api.invoice.jurasolutions.sg** and the records in **Supabase Postgres**.

Frontend on Cloudflare Pages, backend on Railway, database on Supabase. Roughly half an
hour, most of it waiting for DNS.

---

## Read this first

**Two things will bite you if you skip them.**

### Use Supabase's session pooler, not the direct connection

Supabase shows two connection strings. The direct one, `db.<ref>.supabase.co`, has **only
an IPv6 address**. Railway cannot reach it, and neither can most home connections — the
API would fail to start with `ENOTFOUND`.

Use **Connect → Session pooler** instead:

```
postgresql://postgres.<ref>:<password>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
```

Note the username is `postgres.<ref>`, not `postgres`. Paste the password as it is — the
server parses it without needing it URL-encoded, `@` and `&` included.

### The API needs its own subdomain on the same domain

Not the `*.up.railway.app` address Railway gives you by default.

The session lives in a cookie. If the app is on `jurasolutions.sg` and the API is on
`railway.app`, that cookie is a **third-party** cookie — and Safari blocks those outright,
with Chrome and Firefox tightening steadily. Sign-in would work on your laptop in Chrome
and fail on your phone, which is the worst way to find out.

Put the API on `api.invoice.jurasolutions.sg` and both halves are the same site.

---

## Before you start

- `jurasolutions.sg` is a zone in your Cloudflare account, with its nameservers pointed at
  Cloudflare.
- The repo is pushed and Railway/Cloudflare can see it.
- A session secret:

```bash
npm run hash-password -- 'any 12+ character string'
```

Keep the `SESSION_SECRET` it prints. (The hash it also prints is only needed if you create
the admin from Railway's variables rather than with `create-admin`, below.)

---

## 1. Supabase — the database

Nothing to click. The tables are created by the migrations in `backend/migrations/`,
which the API applies on boot. To prepare the database from your machine instead, with
`DATABASE_URL` in `.env`:

```bash
node --env-file=.env backend/scripts/migrate.mjs            # create the tables
node --env-file=.env backend/scripts/migrate.mjs --status   # see what is applied
```

The tables go in a schema called `jura`, **not `public`**. Supabase publishes `public`
through its REST API to anyone holding the publishable key, and that key is meant to be
public. The `jura` schema is not exposed there, the `anon` and `authenticated` roles have
no grants on it, and row level security is on with no policies. Do not add `jura` to
**Settings → API → Exposed schemas**.

## 2. Supabase — the admin user

```bash
node --env-file=.env backend/scripts/create-admin.mjs admin 'a long passphrase'
```

Run it again with a new password to reset one. Only the scrypt hash is stored.

## 3. Railway — create the service

New Project → **Deploy from GitHub repo** → `jurasolutions/invoice-system`.

The `Dockerfile` at the repo root defines the image, and Railway uses it automatically —
the Builder should read **Dockerfile**. Leave these empty: Root Directory (the image needs
`shared/` as well as `backend/`), Custom Build Command, Custom Start Command.

Without the Dockerfile, Railway's default builder sees the Vite app in the repo and serves
the frontend as a static site — every URL, `/__api/health` included, answers with the app's
HTML and the API never starts. If you ever see HTML from the API domain, that is why.

Optional but worth it: Settings → Deploy → **Healthcheck Path** `/__api/health`, so a
deploy that cannot reach the database is never switched in.

Replicas can stay at 1; the database, not the instance, serialises the numbering, so more
than one is safe too.

**No volume.** Nothing is kept on Railway's disk.

## 4. Railway — environment variables

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | the Supabase **session pooler** string (see above) |
| `SESSION_SECRET` | the 64-character hex from `npm run hash-password` |
| `NODE_ENV` | `production` |
| `ALLOWED_ORIGIN` | `https://invoice-system.jurasolutions.sg` |
| `ADMIN_PASSWORD_HASH` | optional — only if you skipped step 2; creates `admin` on first boot |

Do not set `PORT` — Railway sets it.

`ALLOWED_ORIGIN` has to be the exact origin, because a browser will not accept a wildcard
alongside credentials. No trailing slash.

Deploy. The logs should show `jura data    Postgres at aws-0-ap-southeast-1.pooler...`.
If it refuses to start, the log says why: no `DATABASE_URL`, no `SESSION_SECRET`, or no
users to sign in with.

## 5. Railway — custom domain

Service → Settings → **Networking → Custom Domain** → `api.invoice.jurasolutions.sg`.

Railway gives you a CNAME target. In **Cloudflare → jurasolutions.sg → DNS**, add:

| Type | Name | Target | Proxy |
| --- | --- | --- | --- |
| CNAME | `api.invoice` | the target Railway shows | **DNS only (grey cloud)** |

**Keep the proxy off.** `api.invoice.jurasolutions.sg` is two levels below the zone, and
Cloudflare's free Universal SSL certificate only covers one level (`*.jurasolutions.sg`).
Proxied, browsers would get a certificate error. With the proxy off, Railway serves its own
certificate for the name, which is all it needs.

Wait for Railway to show the domain as active, then check:

```
https://api.invoice.jurasolutions.sg/__api/health
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
| `VITE_API_URL` | `https://api.invoice.jurasolutions.sg` |
| `NODE_VERSION` | `20` |

`VITE_API_URL` is baked into the bundle at build time, so it is public. That is fine — it
is an address, not a secret. **Changing it later means rebuilding.**

No database credential goes anywhere near Pages. The frontend only ever talks to the API.

## 7. Cloudflare Pages — the domain

Pages project → **Custom domains → Set up a custom domain** →
`invoice-system.jurasolutions.sg`.

The zone is in the same account, so Cloudflare adds the DNS record itself.

## 8. Sign in and finish the setup

Open **https://invoice-system.jurasolutions.sg** and sign in as the user from step 2.

If there is a warning banner about company details, go to **Settings** and fill in:

- registered name, UEN, registered address — then tick both confirmation boxes
- bank, account name and number, SWIFT, PayNow UEN — then tick the payment box

Until those are set the app will refuse to issue anything, which is deliberate: a document
carrying a placeholder UEN should never reach a client.

---

## Checking it actually works

1. `https://api.invoice.jurasolutions.sg/__api/health` returns `{"ok":true}`.
2. `https://api.invoice.jurasolutions.sg/__api/documents` returns **401**, not a list. If it
   returns data, stop — the API is open to the internet.
3. `admin` / `P@ssw0rd` is refused. (It only ever works locally, with no users.)
4. Sign in on the app. **Then reload.** If it drops you back to the login screen, the
   cookie is not sticking — see the first troubleshooting entry.
5. Sign in from your phone, on mobile data rather than wifi.
6. Create a draft invoice, issue it, print it. Redeploy the Railway service and check it
   is still there.

`node --env-file=.env tools/check-postgres.mjs` proves the numbering against the real
database — twenty concurrent issues, a killed connection mid-issue — in a scratch schema
it drops afterwards. It never touches the `jura` schema.

---

## When it does not work

**The service will not start: `ENOTFOUND db.<ref>.supabase.co`.**
That is the direct, IPv6-only host. Use the session pooler string.

**The service will not start: `tenant/user ... not found`.**
The pooler needs the username `postgres.<ref>`, and the pooler host for the project's
region (`aws-0-ap-southeast-1` for Singapore).

**The API domain answers with the app's HTML page.**
Railway built the repo with its default builder instead of the `Dockerfile`. Check
Settings → Build → Builder says Dockerfile, and that Root Directory is empty.

**The service will not start: "Refusing to start".**
The log names what is missing: `DATABASE_URL`, `SESSION_SECRET`, or any user to sign in
with. The last one is fixed by step 2, or by setting `ADMIN_PASSWORD_HASH`.

**Signed in, then signed straight back out on reload.**
The cookie is not being kept. Almost always the API is still on `*.up.railway.app` rather
than `api.invoice.jurasolutions.sg`. Also confirm `ALLOWED_ORIGIN` matches the frontend origin
exactly, with no trailing slash.

**"Cannot reach the API at …" on the login screen.**
`VITE_API_URL` is wrong, or was changed without rebuilding. Redeploy the Pages project.

**Everything 401s after signing in.**
`SESSION_SECRET` is unset, so the server generates a new one each boot. Set it.

**"The next number is already taken by another document".**
Someone set a counter back by hand. Nothing was issued. Set that month's row in
`jura.counters` to the highest number already in use.

**A certificate error or redirect loop on the API domain.**
The Cloudflare proxy is on for `api.invoice`. Turn it off (grey cloud) for that record.

---

## Backups

The records have to be retainable for five years. Supabase's automatic backups depend on
the plan — check **Database → Backups** for what yours keeps, and do not assume it is
enough on its own. Belt and braces, periodically from your machine:

```bash
pg_dump "<the session pooler string>" --schema=jura --format=custom --file=jura-YYYY-MM-DD.dump
npm run export -- --all      # the PDFs, with DATABASE_URL set
```

and keep both somewhere that is itself backed up.

---

## What each side ends up holding

```
Cloudflare Pages                     Railway                        Supabase
invoice-system.jurasolutions.sg     api.invoice.jurasolutions.sg  Postgres, schema jura
  the bundle                           the API, the rules             the records
  VITE_API_URL (public)                DATABASE_URL                   the users (hashes)
  no credentials                       SESSION_SECRET                 the constraints and
  no data                              no data on disk                the freeze trigger
```

The frontend is a static file a person can read. It holds nothing worth stealing, and
every route it calls is checked again on the server — and the rules the server enforces
are enforced a second time by the database.
