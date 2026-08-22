# Epic Music Space — Black Label Editorial Homepage

## Direction

The homepage should feel like an independent music publication with a premium label sensibility: near-black surfaces, warm ivory type, restrained burnished gold, and human artist photography. Cyan is reserved for genuine live states elsewhere in the product. Purple gradients, sci-fi HUDs, mixing-console decoration, and mandatory intro sequences are excluded.

## Product goals

- Lead with the artist and the work, not platform machinery.
- Give listeners an immediate route into the catalog.
- Give creators an honest sign-in path into Studio.
- Explain ownership and fees in plain language.
- Use real catalog data and display aggregate proof only when values are meaningful.
- Keep first load fast, legible, accessible, and resilient when the database is unavailable.

## Homepage structure

1. **Artist-first hero** — generated editorial photograph, “Make the work. Move the culture.”, Studio sign-in and catalog actions.
2. **Currently Moving** — up to four real active tracks, with launch seed records demoted behind genuine uploads.
3. **Listen / Create / Sell** — three clear audience paths using existing routes.
4. **Clear terms** — master ownership and the itemized 10% platform fee, plus honest live metrics only when at least two qualify.
5. **Closing action** — artist account creation linked to Studio setup.

## Global shell

- Replace the analog-console navigation and footer with a restrained black-and-gold editorial shell.
- Keep search, authentication, notifications, and the complete mobile menu functional.
- Remove the global `EMSWorldIntro`; content should be immediately available on every fresh route.
- Preserve the request nonce and CSP-sensitive layout behavior.

## Data and failure behavior

- Homepage queries are cached and time-bounded.
- If the database is missing or slow, the homepage falls back to demo catalog records without showing fabricated community statistics.
- Cover artwork is optional; cards receive a neutral editorial fallback when absent.

## Accessibility and responsive behavior

- Maintain semantic landmarks, visible focus states, descriptive calls to action, and a working skip link.
- Hero text remains readable over the photograph through layered contrast gradients.
- The release rail becomes two columns on tablets and four on desktop; audience paths stack on mobile.
- Motion is limited to nonessential hover transitions.

## Release plan

Ship through a feature branch and draft pull request. Validate formatting and TSX parsing locally, then use repository checks as the full monorepo build gate. Production remains unchanged until the pull request is reviewed and merged.
