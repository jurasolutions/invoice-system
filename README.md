# Jura Solutions — invoicing and receipt system

Quotations, invoices and receipts as A4 PDFs, in the Jura visual language.

A static frontend for Cloudflare Pages, an API for Railway, and a shared domain that both
import so they cannot disagree about what a document is worth. It runs entirely on one
machine too, which is how it is developed.

Built against `prd/pending/prd-jura-invoicing-2026-09-06.md` and the concept design at
`outputs/concepts/jura-invoicing-concept-2026-09-06.pdf`. The hosted split follows
`prd/pending/prd-jura-invoicing-hosted-2026-09-06.md`.

---

## Running it

```bash
npm install                        # workspace install: shared, backend, frontend
npm run seed -- --with-specimen    # creates the data tree, plus the concept's documents
npm run dev                        # api on :5175, app on :5174 - open :5174
```

Sign in with **`admin` / `P@ssw0rd`**. That default is published in this repo, which is
exactly why the server refuses to start in production without a real one — see
**Authentication** below.

`npm run seed` on its own creates an empty data tree — config, counters, clients and the
five templates, with no documents. Use that for a real start. `--with-specimen` adds the
three documents from the concept design so there is something to look at.

| Command | Does |
| --- | --- |
| `npm run dev` | Both halves, with the frontend proxying `/__api` to the backend |
| `npm test` | The domain and store tests (87) |
| `npm run check:auth` | Asserts every data route refuses an unknown caller |
| `npm run check:layout` | Renders a long document and checks the pagination |
| `npm run export -- --all` | Renders every issued document to `outputs/invoices/` |
| `npm run verify -- --all` | Checks the exported PDFs are A4 with fonts embedded |
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
pure functions with no filesystem and no DOM, imported by both halves as `@jura/shared`.
The totals in the live preview and the totals written to disk are the same code.

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
- **Assignment is atomic.** `counters.json` is written to a temp file, flushed, and
  renamed, all inside a lock directory. Two issues in the same second get different
  numbers.
- **A broken counter refuses to issue.** A corrupt, missing or non-integer counter stops
  the issue and says so. It never restarts the sequence — a duplicate invoice number is
  worse than a refused click. Fix the file by hand and try again.
- **Numbers are never reused.** A document issued by mistake is *voided*, not deleted.
  The number stays in the sequence, marked void, which is exactly what an auditor wants
  to see.

The rules live in `shared/src/numbering.js`; the atomic write and the lock live in
`backend/src/atomic.mjs`; the assignment lives in `backend/src/store.mjs`.

### 2. An issued document is frozen

Its content is the record of what the client received, so it cannot be edited. The store
refuses the write and names the fields it refused — the UI going read-only is a
convenience, not the guard.

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

One user, a password, and a signed token in an HttpOnly cookie. No session store — the
token carries the username and an expiry, and an HMAC proves the server issued it.

**The default is `admin` / `P@ssw0rd`, and it is published in this repo.** Treat it as
public, because it is. It exists so the app works the moment you clone it.

That is fine on a laptop and unsafe on the internet, so the server **refuses to start when
`NODE_ENV=production` unless `ADMIN_PASSWORD_HASH` is set to something else**. There is no
way to deploy the default by forgetting to change it. The app also shows a banner while it
is running on the default, so it cannot be quietly forgotten.

To set a real one:

```bash
npm run hash-password -- 'a long passphrase you have not used elsewhere'
```

It prints an `ADMIN_PASSWORD_HASH` and a `SESSION_SECRET`. Put both in the Railway
environment. The password itself never goes into the repo, an env var, or a log — only its
scrypt hash does.

`npm run check:auth` asserts the parts that matter, which are the refusals: every data
route without a session, a wrong password, a tampered signature, an expired token, an
unsigned token, and that the cookie is HttpOnly.

---

## Deploying

### Backend, on Railway

Point a service at this repo. `railway.json` sets the build and start commands and a
health check on `/__api/health`. Set in the service environment:

| Variable | |
| --- | --- |
| `ADMIN_PASSWORD_HASH` | from `npm run hash-password` — **required** |
| `SESSION_SECRET` | 32+ random bytes — **required** |
| `ALLOWED_ORIGIN` | the exact frontend origin, e.g. `https://invoices.jurasolutions.sg` |
| `NODE_ENV` | `production` |

A wildcard origin is not allowed alongside credentials, so `ALLOWED_ORIGIN` has to be
spelled out. Railway sets `PORT` itself.

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

**Railway's disk is wiped on every deploy.** The records are JSON files, so without a
mounted volume every issued invoice disappears on the next push. Attach one and point
`JURA_DATA_PATH` inside it. Moving the store to Postgres is
`prd/pending/prd-jura-invoicing-hosted-2026-09-06.md`.

**The API needs a subdomain of the same domain as the app** — `api.jurasolutions.com`, not
the `*.up.railway.app` address. The session is a cookie; across different sites it is a
third-party cookie, which Safari blocks outright. Sign-in would work in Chrome on your
laptop and fail on your phone.

---

## Where the data lives

Nothing is committed to this repo. Client names, addresses and amounts live outside it:

```
jurasolutions/
├── data/invoices/
│   ├── config.json         company, bank, PayNow, terms, panel wording, GST flag
│   ├── counters.json       the running numbers
│   ├── clients.json        billing entities
│   ├── templates/*.json    reusable section and item sets
│   └── documents/*.json    one file per document, named by its internal id
└── outputs/invoices/       rendered PDFs, named by document number
```

Those paths are resolved by `backend/src/paths.mjs` and printed when the dev server starts. If
the repo is checked out somewhere other than `jurasolutions/repos/`, both fall back to
folders inside the repo, which `.gitignore` excludes. `JURA_DATA_PATH` and
`JURA_OUTPUT_PATH` override.

Records supporting the accounts have to be retainable for at least five years, so both
the JSON record and the rendered PDF are kept and never overwritten.

---

## Before the first real document

`config.json` ships with placeholders, marked as placeholders rather than left as
plausible-looking invented values. **The app refuses to issue a document while one is
showing**, and prints them in grey in the meantime.

Open Settings in the app, or edit `config.json`, and set:

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

The wording lives in `config.json` under `panels.grant_note`, not in code, and carries a
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

The app reads and writes real JSON files, which a browser cannot do. `backend/src/api.mjs`
runs as Vite dev-server middleware on localhost and does the filesystem work.

This is not a backend in the usual sense — no auth, no hosting, no network exposure, and
it only exists while `npm run dev` is running. `npm run build` produces a bundle, but the
bundle has no data API behind it; this is a local tool by design.

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
  src/atomic.mjs         atomic writes and the counter lock
  src/paths.mjs          where the data and the PDFs live
  scripts/               seed, hash-password
  tests/                 store and lifecycle tests, against a real data tree

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
```

---

## What this does not do

No sending — no email, no connectors. Export a PDF and send it yourself. No payment
collection or links, no bank reconciliation, no accounting integration, no recurring
invoicing, no dunning or statements, no GST filing or InvoiceNow submission, no
multi-user access, no hosting. SGD only, with the currency field present in the schema.

All of that is out of scope in the PRD, deliberately.
