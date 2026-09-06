/**
 * The templates that ship with a fresh data tree.
 *
 * Every template carries structure — the sections, the items, the order —
 * and no rates. `unit_price_cents: null` is deliberate. Jura's commercial
 * rates are a business decision that has not been made yet (PRD §8), and a
 * template full of invented numbers is exactly the kind of figure that ends
 * up on a client's document because nobody remembered it was a guess.
 *
 * Fill the rates in once, from the app, and save the template back over
 * itself. After that a new document from a template is one click.
 */

export const seedTemplates = [
  {
    slug: "first-automation-build",
    name: "First automation build",
    description: "Discovery, build and handover. The shape most first engagements take.",
    document_type: "invoice",
    order: 10,
    panels: null,
    sections: [
      {
        title: "Discovery",
        meta: "",
        items: [
          { description: "Process mapping workshops", note: "Sessions with the people who do the work, mapping the process as it actually runs.", qty: 2, unit_price_cents: null },
          { description: "Current-state documentation", note: "", qty: 1, unit_price_cents: null },
        ],
      },
      {
        title: "First automation",
        meta: "",
        items: [
          { description: "Build and configuration", note: "", qty: 1, unit_price_cents: null },
          { description: "Connector setup", note: "One per system the automation touches.", qty: 1, unit_price_cents: null },
          { description: "Exception handling and test cycle", note: "", qty: 1, unit_price_cents: null },
        ],
      },
      {
        title: "Handover",
        meta: "",
        items: [
          { description: "Documentation pack and runbook", note: "", qty: 1, unit_price_cents: null },
          { description: "Handover session and credential transfer", note: "", qty: 1, unit_price_cents: null },
        ],
      },
    ],
  },

  {
    slug: "discovery-only",
    name: "Discovery only",
    description: "Workshops and current-state documentation, before any build is agreed.",
    document_type: "quotation",
    order: 20,
    sections: [
      {
        title: "Discovery",
        meta: "",
        items: [
          { description: "Process mapping workshops", note: "", qty: 2, unit_price_cents: null },
          { description: "Current-state documentation", note: "", qty: 1, unit_price_cents: null },
          { description: "Findings and recommendations session", note: "", qty: 1, unit_price_cents: null },
        ],
      },
    ],
  },

  {
    slug: "monthly-retainer",
    name: "Monthly retainer",
    description: "Recurring support block, hours drawn down against the month.",
    document_type: "invoice",
    order: 30,
    sections: [
      {
        title: "Support retainer",
        meta: "",
        items: [
          { description: "Monthly retainer", note: "Monitoring, fixes and small changes to automations already live.", qty: 1, unit_price_cents: null },
          { description: "Additional hours beyond the retainer", note: "Billed only if used.", qty: 0, unit_price_cents: null },
        ],
      },
    ],
  },

  {
    slug: "support-block",
    name: "Support block",
    description: "Prepaid hours, drawn down as they are used. One section.",
    document_type: "invoice",
    order: 40,
    sections: [
      {
        title: "Prepaid support",
        meta: "",
        items: [
          { description: "Support hours", note: "Drawn down as used. Unused hours carry over.", qty: 10, unit_price_cents: null },
        ],
      },
    ],
  },

  {
    slug: "blank",
    name: "Blank document",
    description: "One empty section. Start from nothing.",
    document_type: "invoice",
    order: 90,
    sections: [
      { title: "", meta: "", items: [{ description: "", note: "", qty: 1, unit_price_cents: null }] },
    ],
  },
];
