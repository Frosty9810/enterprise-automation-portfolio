# Portfolio showcase design review

Reviewed September 10, 2026. Six primary sites were read for content structure and interaction ideas. This was not a screenshot audit or a claim that one style is objectively best. No site source code, images or brand identity were copied.

## References and design decisions

| Reference | Observed approach | Applied interpretation |
|---|---|---|
| [Brittany Chiang](https://brittanychiang.com/) | Concise project descriptions, previews, technology context and archive | Six curated cases before the full catalog |
| [Simon Willison](https://simonwillison.net/about/) | Named software projects with explanatory writing | Keep source and research beside executable evidence |
| [Josh Comeau](https://www.joshwcomeau.com/) | Explanatory technical writing organized around specific subjects | Explain a concrete decision, then invite deeper inspection |
| [Bruno Simon](https://bruno-simon.com/) | Portfolio experience itself demonstrates his creative development work | Use functional workflow diagrams as our distinctive visual material; avoid adding a game unrelated to automation |
| [Lee Robinson](https://leerob.com/) | Compact personal introduction with direct work and writing links | Clear identity and direct navigation between selected work and the lab |
| [The Pudding](https://pudding.cool/) | A publication of visual explanatory stories | Give each case a visual entry point and a specific question to investigate; this is an editorial reference, not an engineer portfolio |

## Three design passes

1. Research and information architecture: separate the first impression from dense technical inspection.
2. Implementation: gallery, six selected cases, conceptual process artwork, business filters, catalog coverage bars and saved-run counts.
3. Review and correction: preserve all project details, label conceptual graphics separately from n8n graphs, collapse the long specialist paragraph, support reduced motion, add focus management and test navigation and filters.

## What the graphs establish

Gallery artwork is a conceptual process illustration. Actual source-derived n8n graphs remain inside each build. Coverage bars count catalog entries assigned to one primary business focus. Saved-run counts use the latest loaded portfolio records, not lifetime history or production uptime. Individual project charts retain exact local timings and missing-data handling.

## Verification

Automated jsdom checks cover initial gallery state, six selected cards, all-project and AI filters, gallery-to-project navigation, return navigation, coverage meters and all existing project interactions. CSS provides mobile layouts, visible focus and reduced-motion handling. No browser-rendering, screenshot or formal accessibility audit was performed in this pass.

## Further improvements requiring new evidence

Actual recorded walkthrough clips, factual contribution histories and measured customer outcomes would add more hiring value than decorative metrics. Keep these absent or pending until supported. The site remains local.
