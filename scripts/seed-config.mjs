/**
 * The shipped default `config.json`.
 *
 * Two things to know before changing anything here.
 *
 * The company and payment details are placeholders, and they are marked as
 * placeholders (`uen_confirmed: false` and friends) rather than left as
 * plausible-looking invented values. The app refuses to issue a document while
 * a placeholder is showing, because a client's invoice carrying a made-up UEN
 * is worse than no invoice.
 *
 * The panel wording is content, not code. The grant note in particular carries
 * a `checked_on` date and goes stale on purpose: Enterprise Singapore is
 * consolidating EDG, PSG and MRA into a single EDGE scheme through the second
 * half of 2026, so wording that is right today will be wrong by next year.
 */

export function defaultConfig({ checkedOn = "2026-09-06" } = {}) {
  return {
    schema_version: 1,
    currency: "SGD",

    company: {
      legal_name: "Jura Solutions Pte. Ltd.",
      // Placeholders. Replace both, then flip the `_confirmed` flags — the app
      // will not issue a document until you do.
      uen: "UEN to confirm",
      uen_confirmed: false,
      address_lines: ["Registered address to confirm", "Singapore"],
      address_confirmed: false,
      email: "info@jurasolutions.sg",
      website: "jurasolutions.sg",
      tagline: "Automation consultancy",
      prepared_by: "Ting Yu",
    },

    /**
     * Jura is not GST-registered. Under IRAS rules only a GST-registered
     * business may issue a document headed "Tax invoice", and mislabelling one
     * carries a penalty — so the title stays "Invoice" and a line says plainly
     * that no GST is charged.
     *
     * The fields below are fully wired. Registering later means setting
     * `registered` to true and filling in `number`, not a rebuild.
     */
    gst: {
      registered: false,
      rate_bp: 900,
      number: null,
      not_registered_line: "Not a tax invoice · Jura is not GST-registered",
    },

    payment: {
      bank: null,
      account_name: "Jura Solutions Pte. Ltd.",
      account_number: null,
      swift: null,
      paynow_uen: null,
      confirmed: false,
      queries_email: "info@jurasolutions.sg",
    },

    terms: {
      payment_days: 30,
      quotation_validity_days: 30,
      deposit_percent: 25,
      // Deliberately absent. An interest clause nobody intends to enforce is
      // worse than none — it invites an argument and gets waived anyway.
      late_payment_note: null,
    },

    /**
     * Panel content. Every document type picks the panels it shows from here.
     *
     * `{{tokens}}` are filled at render time — see src/render/panels.js for
     * the list. Keep the voice: sentence case, second person, short
     * declaratives, no buzzwords, and no figure the business cannot evidence.
     */
    panels: {
      how_to_pay: {
        heading: "How to pay",
        reference_line:
          "Please quote {{number}} as your payment reference. A receipt follows once payment clears.",
      },

      notes: {
        heading: "Notes",
        paragraphs: [],
      },

      grant_note: {
        heading: "Before you accept · grant support",
        enabled: true,
        // The date this wording was last checked against the scheme rules.
        // The app warns once it is older than `stale_after_days`.
        checked_on: checkedOn,
        stale_after_days: 180,
        paragraphs: [
          "Part of this engagement may qualify for support under Enterprise Singapore's Enterprise Development Grant. Broadly, your company needs to be registered and operating in Singapore with at least 30% local shareholding, and able to fund the project.",
          "Timing is the part most businesses miss. You apply through the Business Grants Portal before the project starts. Once work has begun, a contract is signed, or a payment has been made, the project counts as commenced and it no longer qualifies. If you want to explore this, tell us before you accept and we will hold the start date.",
          "Enterprise Singapore is consolidating EDG, PSG and MRA into a single EDGE scheme during the second half of 2026, so check the current scheme, eligibility and support level at enterprisesg.gov.sg before applying. We can point you at the right pages. We are not grant consultants and we cannot promise an outcome.",
        ],
        // Emphasised inside the paragraph above, so the timing rule is the
        // thing the eye lands on.
        emphasis: ["before the project starts"],
        stamp: "Scheme details checked {{checked_on_long}} · not financial or grant advice",
      },

      acceptance: {
        heading: "Acceptance",
        paragraphs: [
          "Accepting this quotation starts the project. A {{deposit_percent}}% deposit is payable on acceptance and the balance on handover. Payment terms are {{payment_days}} days from invoice.",
        ],
        signature_labels: ["Signature · {{client}}", "Name, title and date"],
      },

      inclusions: {
        heading: "What is included",
        paragraphs: [
          "Everything in the sections above, delivered in the order listed. Prices hold until {{valid_until_long}}. Work outside the quoted sections is quoted separately before it starts.",
          "You keep your own credentials, your own documentation and the ability to switch the automation off. Nothing runs on infrastructure you cannot see.",
        ],
      },

      for_your_records: {
        heading: "For your records",
        paragraphs: [
          "This receipt confirms {{settlement}} against invoice {{source_number}}. Jura Solutions is not registered for GST, so no GST has been charged and no tax invoice is issued.",
          "Keep this with your records. Ask us any time if you need it reissued.",
        ],
      },

      correction: {
        heading: "Why this credit note exists",
        paragraphs: [
          "This credit note corrects invoice {{source_number}}. The original invoice stays in the records unchanged, as issued.",
        ],
      },
    },

    footer: {
      // Rebuilt from the company block at render time; this is the joining
      // text around it.
      thanks: "Thank you for your business. If anything on this invoice looks wrong, tell us and we will fix it.",
    },

    specimen_label: "Specimen · sample data, illustrative figures",
  };
}
