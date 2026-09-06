# Jura Solutions — invoicing and receipt system

Quotations, invoices and receipts as A4 PDFs, in the Jura visual language, running
locally on one machine with no connectors and no network calls.

Built against `prd/pending/prd-jura-invoicing-2026-09-06.md` and the concept design at
`outputs/concepts/jura-invoicing-concept-2026-09-06.pdf`.

---

## Running it

```bash
npm install                        # also vendors the design system
npm run seed -- --with-specimen    # creates the data tree, plus the concept's documents
npm run dev                        # http://localhost:5174
```

`npm run seed` on its own creates an empty data tree — config, counters, clients and the
five templates, with no documents. Use that for a real start. `--with-specimen` adds the
three documents from the concept design so there is something to look at.

Other commands:

| Command | Does |
| --- | --- |
| `npm test` | The unit and store tests |
| `npm run export -- JURA-2026-09-001` | Renders one document to `outputs/invoices/` |
| `npm run export -- --all` | Renders every issued document |
| `npm run verify -- --all` | Checks the exported PDFs are A4 with fonts embedded |
| `npm run check:layout` | Renders a long document and checks the pagination |
| `npm run sync:ds` | Re-copies the design system from source |
| `npm run build` | Production bundle (see "The local API" below) |

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

The rules live in `src/domain/numbering.js`; the atomic write and the lock live in
`server/atomic.mjs`; the assignment lives in `server/store.mjs`.

### 2. An issued document is frozen

Its content is the record of what the client received, so it cannot be edited. The store
refuses the write and names the fields it refused — the UI going read-only is a
convenience, not the guard.

What can still change is what happened to it *afterwards*: status, payments recorded
against it, and the links to a receipt or credit note raised from it. That list is
`MUTABLE_AFTER_ISSUE` in `src/domain/document.js`.

Corrections go on a **credit note**. There is no other way, on purpose.

Two things are snapshotted onto the document at issue, for the same reason:

- **the client's details**, so a client who moves office in November does not silently
  rewrite the address on the invoice they were sent in September
- **Jura's own details**, so replacing the placeholder UEN does not retroactively change
  documents already sent

### 3. Money is integer cents

Everywhere. `1274000`, not `12740.00`. Floats do not represent 0.1 exactly, and the drift
lands as a cent the client did not agree to pay. Formatting happens only at the render
boundary, in `src/domain/money.js`.

Quantity is the one legitimately fractional value (2.5 hours of support). It is scaled to
thousandths so the line amount is an integer multiplication rather than a float one.

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

Those paths are resolved by `server/paths.mjs` and printed when the dev server starts. If
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

1. `src/render/flow.jsx` turns the record into a flat list of blocks. Sections carry their
   rows separately, so a long one can be cut between rows rather than pushed whole onto
   the next page.
2. `src/render/DocumentView.jsx` renders every block off-screen at the exact width it will
   have on the page, and measures it. Twice — once immediately, and again once the
   webfonts have loaded, because Outfit and DM Sans are not the same height as the
   fallback.
3. `src/render/paginate.js` fills page boxes with those measurements.

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
`src/styles/fonts.local.css`. The design system at source is untouched.

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

The app reads and writes real JSON files, which a browser cannot do. `server/api.mjs`
runs as Vite dev-server middleware on localhost and does the filesystem work.

This is not a backend in the usual sense — no auth, no hosting, no network exposure, and
it only exists while `npm run dev` is running. `npm run build` produces a bundle, but the
bundle has no data API behind it; this is a local tool by design.

---

## Repo map

```
server/           the local data API and everything that touches the filesystem
  paths.mjs         where the data and the PDFs live
  atomic.mjs        atomic writes and the counter lock
  store.mjs         the store — enforces numbering and immutability
  api.mjs           HTTP routes, dev-server middleware

src/domain/       pure logic, shared by the browser and Node
  money.js          integer cents
  numbering.js      the numbering rules
  dates.js          calendar dates, not instants
  document.js       the record, its totals, and what may change after issue

src/render/       the A4 document
  document.css      the print stylesheet
  blocks.jsx        header, parties, amount strip, items, totals, panels, footer
  flow.jsx          the document as a flat list of measurable blocks
  paginate.js       filling page boxes
  DocumentView.jsx  measure, then lay out

src/app/          the builder UI
scripts/          seed, sync, export, verify, layout check
tests/            unit and store tests
```

---

## What this does not do

No sending — no email, no connectors. Export a PDF and send it yourself. No payment
collection or links, no bank reconciliation, no accounting integration, no recurring
invoicing, no dunning or statements, no GST filing or InvoiceNow submission, no
multi-user access, no hosting. SGD only, with the currency field present in the schema.

All of that is out of scope in the PRD, deliberately.
