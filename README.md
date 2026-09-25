# Jura Solutions — invoicing and receipt system

Quotations, invoices and receipts as A4 PDFs, in the Jura visual language.

A static frontend for Cloudflare Pages, an API for Railway, the records in Postgres on
Supabase, and a shared domain that both halves import so they cannot disagree about what a
document is worth. It runs entirely on one machine too, which is how it is developed.

Built against `prd/pending/prd-jura-invoicing-2026-09-06.md` and the concept design at
`outputs/concepts/jura-invoicing-concept-2026-09-06.pdf`. The hosted split follows
`prd/pending/prd-jura-invoicing-hosted-2026-09-06.md`.

---

## Running it

```bash
npm install                        # workspace install: shared, backend, frontend
npm run seed -- --with-specimen    # a local database, plus the concept's documents
npm run dev                        # api on :5175, app on :5174 - open :5174
```

Locally, with no `DATABASE_URL`, the records go in **PGlite** — real Postgres compiled to
WebAssembly, running inside the API process and stored under `jurasolutions/data/invoices-db/`.
Same migrations, constraints and triggers as Supabase, nothing to install. Set
`DATABASE_URL` and the same code talks to Supabase instead.

With no users in the database, sign in with **`admin` / `P@ssw0rd`**. That default is
published in this repo, which is exactly why it is never accepted in production — see
**Authentication** below.

`npm run seed` on its own creates an empty database — schema, default settings and the five
templates, with no documents. `--with-specimen` adds the three documents from the concept
design so there is something to look at.

| Command | Does |
| --- | --- |
| `npm run dev` | Both halves, with the frontend proxying `/__api` to the backend |
| `npm test` | The domain, store and auth tests (99), on in-memory Postgres |
| `npm run check:postgres` | The numbering guarantees against the real database, in a scratch schema |
| `npm run check:auth` | Asserts every data route refuses an unknown caller |
| `npm run check:layout` | Renders a long document and checks the pagination |
| `npm run export -- --all` | Renders every issued document to `outputs/invoices/` |
| `npm run verify -- --all` | Checks the exported PDFs are A4 with fonts embedded |
| `npm run create-admin -- admin '...'` | Creates a user, or resets their password |
| `npm run migrate` | Applies pending schema migrations (`-- --status` to look) |
| `npm run migrate:json` | One-off: moves the old JSON records into the database |
| `npm run hash-password -- '...'` | Turns a password into what `ADMIN_PASSWORD_HASH` wants |
| `npm run build` | Frontend bundle into `frontend/dist` |
| `npm run sync:ds` | Re-copies the design system from source |

---

## How it is split

```
frontend/   the app, a static bundle          -> Cloudflare Pages
backend/    the API, the rules, the records   -> Railway
shared/     pure domain logic, no I/O         -> imported by both
tools/      export, verification, dev runner  -> deployed nowhere
```

The split is not cosmetic. **The rules that make the records defensible live in
`backend/`**, where a browser cannot reach them. `frontend/` is a bundle a person can
read and modify, so nothing it does is trusted: it holds no credentials, and every route
it calls is checked again on the server.

`shared/` is the reason the two agree. Money, numbering, dates and the document record are
pure functions with no I/O and no DOM, imported by both halves as `@jura/shared`.
The totals in the live preview and the totals stored in the database are the same code.

Locally, the Vite dev server proxies `/__api` to the backend so the browser sees one
origin. Hosted, they are two different sites and requests go cross-site with credentials —
which is why `ALLOWED_ORIGIN` has to name the frontend exactly.

---

## The three rules

Most of this repo is ordinary. These three are the parts worth understanding before
changing anything, because they are what makes the records defensible.

### 1. A number is assigned at issue, and never again

```
Quotation     JURA-Q-YYYY-MM-NNN     JURA-Q-2026-08-001
Invoice       JURA-YYYY-MM-NNN       JURA-2026-09-001
Receipt       JURA-R-YYYY-MM-NNN     JURA-R-2026-10-001
Credit note   JURA-CN-YYYY-MM-NNN    JURA-CN-2026-10-001
```

`NNN` is zero-padded to three digits, resets on the first of each month per type, and
runs to four digits past 999.

- **Drafts have no number.** A draft you delete leaves no gap, because it never took one.
- **Assignment is atomic.** The next number is one upsert on the `counters` row, in the
  same transaction as the document write. Two issues at once queue on the row lock and get
  different numbers; an issue that fails part way rolls the counter back with it, so there
  is no gap either. Proven against Supabase by `npm run check:postgres`.
- **A duplicate cannot be written at all.** `documents.number` is unique in the database.
  A counter set back by hand makes the next issue refuse and say so — it never hands out a
  number already in use.
- **Numbers are never reused.** A document issued by mistake is *voided*, not deleted.
  The number stays in the sequence, marked void, which is exactly what an auditor wants
  to see.

The rules live in `shared/src/numbering.js`; the assignment lives in
`backend/src/store.mjs`; the constraints live in `backend/migrations/0001_initial.up.sql`.

### 2. An issued document is frozen

Its content is the record of what the client received, so it cannot be edited. The store
refuses the write and names the fields it refused — the UI going read-only is a
convenience, not the guard. A trigger on the `documents` table refuses the same edit, and
any delete of an issued document, even from the Supabase SQL editor.

What can still change is what happened to it *afterwards*: status, payments recorded
against it, and the links to a receipt or credit note raised from it. That list is
`MUTABLE_AFTER_ISSUE` in `shared/src/document.js`.

Corrections go on a **credit note**. There is no other way, on purpose.

Two things are snapshotted onto the document at issue, for the same reason:

- **the client's details**, so a client who moves office in November does not silently
  rewrite the address on the invoice they were sent in September
- **Jura's own details**, so replacing the placeholder UEN does not retroactively change
  documents already sent

### 3. Money is integer cents

Everywhere. `1274000`, not `12740.00`. Floats do not represent 0.1 exactly, and the drift
lands as a cent the client did not agree to pay. Formatting happens only at the render
boundary, in `shared/src/money.js`.

Quantity is the one legitimately fractional value (2.5 hours of support). It is scaled to
thousandths so the line amount is an integer multiplication rather than a float one.

---

## Authentication

Users live in the `users` table, each with a scrypt hash of their password. Signing in
gives a signed token in an HttpOnly cookie. No session store — the token carries the
username and an expiry, and an HMAC proves the server issued it.

Create a user, or reset a password:

```bash
npm run create-admin -- admin 'a long passphrase you have not used elsewhere'
# against Supabase from your machine:
node --env-file=.env backend/scripts/create-admin.mjs admin '...'
```

Only the hash is stored. Alternatively set `ADMIN_PASSWORD_HASH` (from
`npm run hash-password`) in Railway, and the first boot on an empty users table creates the
admin from it.

**With no users, local development accepts `admin` / `P@ssw0rd`, and that is published in
this repo.** It exists so the app works the moment you clone it, and it stops working the
moment a real user exists. It is never accepted in production, and the server **refuses
to start in production with no users** — there is no way to deploy the default.

`npm run check:auth` asserts the parts that matter, which are the refusals: every data
route without a session, a wrong password, a tampered signature, an expired token, an
unsigned token, and that the cookie is HttpOnly.

---

## Deploying

### Backend, on Railway

Point a service at this repo, root directory empty. The `Dockerfile` builds the API image
(production dependencies only, no build step); pending migrations run on boot. Set in the
service environment:

| Variable | |
| --- | --- |
| `DATABASE_URL` | the Supabase **session pooler** string — **required** |
| `SESSION_SECRET` | 32+ random bytes — **required** |
| `ALLOWED_ORIGIN` | the exact frontend origin, e.g. `https://invoice-system.jurasolutions.sg` |
| `NODE_ENV` | `production` |
| `ADMIN_PASSWORD_HASH` | optional — creates the admin on first boot if there are no users |

A wildcard origin is not allowed alongside credentials, so `ALLOWED_ORIGIN` has to be
spelled out. Railway sets `PORT` itself. No volume: nothing is kept on Railway's disk.

### Frontend, on Cloudflare Pages

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Output directory | `frontend/dist` |
| Root directory | the repo root (the workspace install needs it) |
| `VITE_API_URL` | the Railway service URL |

`VITE_API_URL` is baked into the bundle at build time, so it is public. That is fine — it
is an address, not a secret. Nothing else about the deployment is in the bundle.

Full step-by-step, including the domains and the two things that will bite you:
**[DEPLOYMENT.md](DEPLOYMENT.md)**.

### The two that will bite you

**Use Supabase's session pooler, not the direct host.** `db.<ref>.supabase.co` has only an
IPv6 address, which Railway cannot reach. The pooler
(`aws-0-ap-southeast-1.pooler.supabase.com:5432`, user `postgres.<ref>`) is IPv4.

**The API needs a subdomain of the same domain as the app** — `api.invoice.jurasolutions.sg`, not
the `*.up.railway.app` address. The session is a cookie; across different sites it is a
third-party cookie, which Safari blocks outright. Sign-in would work in Chrome on your
laptop and fail on your phone.

---

## Where the data lives

Nothing is committed to this repo. The records are in Postgres, in a schema called `jura`:

```
settings     one row: company, bank, PayNow, terms, panel wording, GST flag
counters     the running numbers, one row per type and month
clients      billing entities
templates    reusable section and item sets
documents    one row per document; the whole record in `data`, with number,
             type and status alongside so the database can hold the rules
users        who can sign in, with scrypt hashes
```

Not `public`: Supabase publishes `public` through its REST API to anyone holding the
publishable key. The `jura` schema is not exposed, the API roles have no grants on it, and
row level security is on with no policies. The only way in is the Railway API.

Schema changes are numbered SQL files in `backend/migrations/` (`NNNN_name.up.sql` and a
matching `.down.sql`), applied in order, each in one transaction. The API applies pending
ones on boot; `npm run migrate -- --status` shows where a database is.

Rendered PDFs still go to `jurasolutions/outputs/invoices/` (or `JURA_OUTPUT_PATH`).

Records supporting the accounts have to be retainable for at least five years. Supabase's
own backups depend on the plan — check its retention, and keep a periodic export as well.

---

## Before the first real document

The default settings ship with placeholders, marked as placeholders rather than left as
plausible-looking invented values. **The app refuses to issue a document while one is
showing**, and prints them in grey in the meantime.

Open Settings in the app and set:

- `company.uen` and `company.address_lines`, then `uen_confirmed` / `address_confirmed`
- `payment.*` — bank, account name and number, SWIFT, PayNow UEN — then `payment.confirmed`

The commercial defaults are Net 30, a 25% deposit on acceptance and 30-day quotation
validity, all from the concept. Change them in `terms`.

There is deliberately no late-payment clause. An interest charge nobody intends to
enforce invites an argument and gets waived anyway; add one only once there is a policy
behind it.

### The templates ship without rates

The five templates carry structure — sections, items, order — and `unit_price_cents: null`
throughout. Jura's rates are a business decision that has not been made, and a template
full of invented numbers is how a guess ends up on a client's invoice. Build a document
from a template, put your rates in, then save it back over the same name.

---

## GST

Jura is **not** GST-registered. Under the IRAS rules only a GST-registered business may
head a document "Tax invoice", and mislabelling one carries a penalty. So documents are
headed "Invoice" and carry a line saying plainly that no GST is charged.

The GST fields are fully implemented behind `config.gst.registered`. Registering later is:

1. tick "Jura is registered for GST" in Settings
2. put the registration number in

Nothing needs rebuilding. Documents issued before the switch keep the GST position they
were issued under, because it is snapshotted onto each document at creation.

---

## The grant note

It prints **on quotations only**.

Enterprise Singapore requires a project to have *not commenced* before a grant
application — no work begun, no contract signed, no payment made. By invoice stage the
project has commenced, so a note there is too late to be any use and risks implying the
invoiced project qualifies.

The wording lives in the settings under `panels.grant_note`, not in code, and carries a
`checked_on` date. EDG, PSG and MRA are being consolidated into a single **EDGE** scheme
through the second half of 2026, so the wording will go stale. The app warns once
`checked_on` is more than `stale_after_days` (180) old.

To update it: check the current position at enterprisesg.gov.sg, edit the paragraphs in
Settings, and set the date. The note names eligibility conditions and the timing rule,
points at enterprisesg.gov.sg, and says plainly that Jura is not a grant consultant and
cannot promise an outcome. Keep all three.

---

## How a document gets onto pages

The browser can break pages on its own, and it does it badly for this: it cannot repeat a
section header on a continuation page, and it cannot tell you how many pages there will
be — which is what "Page 1 of 3" needs.

So the renderer measures first and decides second:

1. `frontend/src/render/flow.jsx` turns the record into a flat list of blocks. Sections carry their
   rows separately, so a long one can be cut between rows rather than pushed whole onto
   the next page.
2. `frontend/src/render/DocumentView.jsx` renders every block off-screen at the exact width it will
   have on the page, and measures it. Twice — once immediately, and again once the
   webfonts have loaded, because Outfit and DM Sans are not the same height as the
   fallback.
3. `frontend/src/render/paginate.js` fills page boxes with those measurements.

If any measurement cannot be taken, the layout is abandoned rather than guessed: the page
stays unready and the export refuses. A missing measurement reads as zero, a
zero-height block gets packed onto a page with no room for it, and the result is an
invoice with its total clipped off the bottom edge. On a document a client keeps for five
years, no layout is better than a wrong one.

`npm run check:layout` renders a document long enough to need several pages and asserts
that nothing overflows, that the page numbers agree with the number of pages, and that
every item that went in came out somewhere.

---

## Fonts

The three families are vendored from `@fontsource/*` and loaded from `node_modules`, not
from Google Fonts.

The design system's `tokens/fonts.css` uses a remote `@import`. That fails silently
offline and under headless Chromium, and Chromium falls back to Helvetica — which would
put a client's invoice in the wrong typeface for the five years they have to keep it.
`npm run sync:ds` rewrites that one file *in the vendored copy* to point at
`frontend/src/styles/fonts.local.css`. The design system at source is untouched.

`npm run verify` checks the exported PDFs actually carry embedded font programs, so this
cannot regress quietly.

---

## Export

```bash
npm run export -- JURA-2026-09-001
npm run export -- --all
```

Writes `outputs/invoices/<number>.pdf`. The browser's own print dialog does the same job,
but not the same way twice — the file gets whatever name and folder was picked, and the
margins depend on what the dialog was last set to. The script always writes the same name
at A4 with the page's own margins.

It starts this app's Vite server and drives it with headless Chromium, so the PDF comes
out of exactly the renderer the preview uses. It needs Chrome, Chromium or Edge already
installed — `puppeteer-core` rather than `puppeteer`, so nothing downloads a browser.
Point `JURA_CHROME` at a binary if it cannot find one.

Printing by hand works too: open a document, "Print or save as PDF", and **set margins to
none**. The page carries its own 13/16/9mm margins; the browser adding more shrinks the
whole document.

---

## The local API

`npm run dev` runs the same API that Railway runs, on :5175, with the Vite dev server
proxying `/__api` to it. The export and layout tools mount it inside their own process
instead. One set of routes everywhere.

---

## Repo map

```
shared/                pure domain logic, no I/O - imported by both halves
  src/money.js           integer cents
  src/numbering.js       the numbering rules
  src/dates.js           calendar dates, not instants
  src/document.js        the record, its totals, what may change after issue
  src/defaults/          the shipped config, templates and specimen documents
  tests/                 the domain tests

backend/               the API and the records -> Railway
  src/server.mjs         standalone HTTP server, the Railway entry point
  src/api.mjs            routes, auth gate, CORS
  src/auth.mjs           passwords, sessions, the production guard
  src/store.mjs          the store - enforces numbering and immutability
  src/db.mjs             Postgres or PGlite, transactions, the migration runner
  src/paths.mjs          where the PDFs and the local database live
  migrations/            numbered SQL: tables, constraints, the freeze trigger
  scripts/               migrate, migrate-json, seed, create-admin, hash-password
  tests/                 store, lifecycle and auth tests, on in-memory Postgres

frontend/              the app -> Cloudflare Pages
  src/app/               the builder UI, the login, the API client
  src/render/            the A4 document, the print stylesheet, pagination
  src/design-system/     vendored, read-only
  scripts/               sync-design-system

tools/                 dev tooling, deployed nowhere
  dev.mjs                runs both halves
  export-pdf.mjs         renders a document to PDF
  verify-pdf.mjs         checks an exported PDF is A4 with fonts embedded
  check-layout.mjs       renders a long document, checks the pagination
  check-auth.mjs         checks what the login refuses
  check-postgres.mjs     concurrency and immutability against the real database
```

---

## What this does not do

No sending — no email, no connectors. Export a PDF and send it yourself. No payment
collection or links, no bank reconciliation, no accounting integration, no recurring
invoicing, no dunning or statements, no GST filing or InvoiceNow submission, no
roles or permissions between users. SGD only, with the currency field present in the schema.

All of that is out of scope in the PRD, deliberately.
