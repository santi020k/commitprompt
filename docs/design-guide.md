# Commitprompt documentation design

Commitprompt keeps its yellow/gold, teal, charcoal, and warm ivory palette. The
shared direction follows the sculpted website and theme projects: deliberate
spacing, medium-weight headings, fine rules, and a raised identity tab. The
terminal and monospace wordmark remain central to this project.

## Layout and components

- Align the shared header, homepage, documentation, and footer to a 72rem grid.
- Use one solid opening surface and open content rows instead of nested glass cards.
- Preserve all documentation section IDs and the full CLI/API reference content.
- Use Lumen v4 primitives, semantic color tokens, public props, and public slots.
  Consumer-owned classes style composed layouts; do not depend on private component classes.
- Keep installation examples in Lumen CodeTabs. The selected package manager is
  shared between the homepage and documentation.
- Use Lumen Anchor for active-section navigation and ScrollProgress for reading progress.
  The sidebar becomes a horizontally scrollable guide on small screens.
- Keep navigation available without a menu overlay. The wordmark links home;
  Docs, GitHub, and appearance controls remain reachable at 320px.
- Retain meaningful external link names, protected new tabs, and visible author attribution.

## Motion and appearance

Use short Lumen ScrollReveal/RevealGroup entrances for homepage sections. Keep
long-form reading content still. Astro ClientRouter provides 180ms page
transitions and preserves the selected appearance before swapping documents.
Keep one UIPrimitives runtime in Base so controls initialize after navigation.
Reduced-motion preferences disable entrance and transition animation. No content
should require animation or scrolling to become available with reduced motion.

The original palette is defined through semantic tokens in `global.css`. Keep
light and dark appearances independently legible; do not replace them with the
personal website’s purple. Use Inter/system sans for content and monospace for
commands and small metadata.

## Verification

Run `pnpm run validate`. Browser checks cover all three routes in both themes,
320px through 1440px overflow, compact documentation navigation, keyboard tabs,
clipboard commands, active deep links, appearance across navigation and history,
and reduced motion. Capture before/after screenshots for material visual changes
at matching desktop and phone sizes; keep this evidence outside the repository.
