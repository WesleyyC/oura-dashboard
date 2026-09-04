# Oura Dashboard Design System

## Intent

The scene is a quiet health window on an overcast morning: private, exact, and unhurried. The interface borrows Apple HIG principles—semantic color, system typography, clear hierarchy, familiar segmented controls, adaptive appearance, and sparing material depth—without reproducing Apple branding.

## Color strategy

Use a restrained semantic palette. Neutral surfaces carry the product; warm amber is the brand anchor and stays below ten percent of the interface. Blue denotes interactivity. Every member has one persisted semantic color key that stays stable when profiles are reordered and applies across individual and Family charts. Metric and score labels continue to name the measurement. All data lines are solid and every chart owns a visible text legend, so color is never the only cue.

```css
:root {
  --bg: oklch(1 0 0);
  --surface: oklch(0.975 0.003 80);
  --surface-raised: oklch(0.99 0.002 80);
  --ink: oklch(0.18 0.012 250);
  --muted: oklch(0.48 0.018 250);
  --separator: oklch(0.90 0.006 250);
  --primary: oklch(0.72 0.15 80);
  --accent: oklch(0.58 0.18 250);
  --sleep: oklch(0.58 0.16 298);
  --readiness: oklch(0.56 0.19 255);
  --activity: oklch(0.67 0.16 72);
  --profile-ocean: oklch(0.55 0.13 218);
  --profile-berry: oklch(0.56 0.16 327);
  --profile-meadow: oklch(0.52 0.15 145);
  --profile-sunset: oklch(0.58 0.16 55);
  --profile-iris: oklch(0.52 0.15 275);
  --profile-lagoon: oklch(0.50 0.13 190);
  --positive: oklch(0.49 0.14 150);
  --negative: oklch(0.58 0.18 28);
  --status-neutral: oklch(0.48 0.018 250);
  --danger: oklch(0.56 0.20 25);
}

@media (prefers-color-scheme: dark) {
  :root {
    --profile-ocean: oklch(0.73 0.12 218);
    --profile-berry: oklch(0.72 0.14 327);
    --profile-meadow: oklch(0.72 0.13 145);
    --profile-sunset: oklch(0.76 0.14 62);
    --profile-iris: oklch(0.72 0.13 275);
    --profile-lagoon: oklch(0.72 0.11 190);
  }
}
```

Dark appearance uses neutral near-black base and elevated surfaces rather than literal inversion. The six profile colors use curated light and dark values rather than arbitrary user-entered colors. Every foreground/background pair must retain at least 4.5:1 contrast; primary body text targets 7:1. Line and identity samples use a quiet border or sufficient surface contrast so they retain shape in both appearances.

## Typography

Use the native system stack: `-apple-system`, `BlinkMacSystemFont`, `SF Pro Text`, `SF Pro Display`, `Segoe UI`, then `sans-serif`. Do not download or embed SF fonts. Use five fixed rem roles: 0.75 caption, 0.875 secondary, 1 body, 1.25 subheading, and 2 title. Use regular, medium, semibold, and bold only. Apply tabular numerals to scores, durations, dates, axes, and tables.

## Layout

Use a 4pt spacing foundation with 8, 12, 16, 24, 32, 48, 64, and 96px semantic steps. The desktop shell is a centered 1200px content plane with a quiet sticky control bar; the mobile shell becomes one column while the same compact Person and Range selectors stay on a single row. Use cards only for bounded, independently meaningful regions. Trends, comparisons, and the daily table remain separate visual forms to avoid an identical-card grid.

At 1180px and above, individual and Family score panels use one three-column Readiness, Sleep, Activity row with a 24px gap. Below 1180px they remain vertically stacked; no two-column intermediate state is used. Family panels retain every profile line and place their complete summary in a wrapping two-column grid within each wide-screen panel. Person and Range always use the same adaptive selector component, option collection, and interaction model. Above 760px, CSS presents those options as inline segmented controls: Person scrolls within its own bounded row when the family grows, while Range keeps all five choices visible. At 760px and below, the same component presents custom anchored listboxes from two equal min-width-zero trigger columns; no viewport-specific React tree is rendered. Every chart in the currently visible person or Family view shares one selected date, defaults to the latest plotted date, and uses the same hover, tap, arrow-key, Home, and End interaction; changing the person, Family view, or range resets that view to its latest date. Charts label only the start, midpoint, and end dates. Family readouts list every profile value for the selected date and wrap without horizontal scrolling. At 420px and below, the score strip keeps all three current values while hiding only their supporting average sentences; compact numeric and date sizing preserves the comparison at 320px. The daily table retains horizontal scrolling and a sticky date column on narrow widths because it is a wide record grid. The Family detailed comparison instead uses a semantic table above 760px and a vertically stacked, naturally wrapping comparison list at 760px and below; the normal two-profile view never requires horizontal scrolling or a sticky metric overlay.

The first viewport contains a fixed-height title row with one summarized freshness indicator, Refresh and Settings actions, then person and range controls. The title row keeps the same geometry in individual and Family views. Normal record-count copy is omitted; only loading, empty, and error states add explanatory text. Four structured metric groups and daily detail follow the individual trend explorer through progressive disclosure. Family score panels use the same responsive three-column-to-stack rule as individual score panels, followed by a shared detailed explorer and comparison table, so both modes offer the same depth without forcing identical layouts.

The initial dashboard shell reserves the three-score geometry with neutral, non-animated placeholders while profiles resolve. Settings is task-first: Connected people owns an on-demand inline Add person flow, compact profile management, and refresh-all. A healthy Oura backend appears only as a compact readiness row; setup guidance appears when required. Dashboard account remains last and keeps destructive controls collapsed until requested.

## Components

- Brand mark: use the exact generated dual-orbit light and dark PNG crops without tracing, redrawing, recoloring, or animation. Browser and installed-app assets derive from those crops. Visible marks swap with system appearance, remain decorative beside the existing text name, and never carry status meaning.
- Dashboard selectors: Person and Range are two instances of one adaptive custom selector. Person offers each signed-in owner's family profile plus Family when at least two profiles exist; member options show the persisted profile-color mark while Family stays neutral, and selection persists by tenant-owned profile slug in the URL. Range offers 7 days, 14 days, 30 days, Quarter, and 6 months. Desktop exposes the shared option collection as segmented controls with a raised selected surface and bounded horizontal overflow for Person. Mobile exposes that same collection through labeled custom popovers with selected checks. Both presentations retain 44px targets and complete pointer, touch, keyboard, focus, disabled, dark-appearance, and reduced-motion states.
- Refresh state: one inline summary with a semantic status dot and timestamp; Family reports the oldest completed sync, and partial failure leaves cached data visible.
- Dashboard utility: Refresh and Settings have clear bordered targets in a stable header region.
- Loading shell: neutral, non-animated score geometry reserves the loaded layout while profile summaries resolve.
- Score strip: latest readiness, sleep, and activity values, in that order, with selected-range averages, not decorative hero metrics.
- Score trends: three responsive panels show absolute readiness, sleep, and activity scores on one shared focused scale, using one row at 1180px and above and a vertical stack below. Each panel uses the active member color and keeps its own visible member-and-treatment legend during loading, empty, and populated states. Every panel keeps the shared visible-view date and exact score visible, supports hover, tap, and arrow-key selection through the same interaction surface, and includes a screen-reader table. The score strip shows text-plus-arrow status only when the latest score is strictly outside the mean ± one population standard deviation calculated from selected-range measurements; otherwise it has no badge. Ranges longer than 14 days use a labeled trailing seven-day moving average.
- Metric explorer: one persistent full-width chart responds to selectable rows across Sleep, Recovery, Daily balance, and Movement. It shows a solid trend, subtle solid selected-range average, measured-day treatment, accessible data table, and a persistent text legend with member identity plus range average. The chart also keeps its selected date and every visible series value in a wrapping readout, with missing measurements shown as em dashes and loading series identified explicitly.
- Metric report: selectable metric rows use precise separators, raw range averages, measured-day counts, observed ranges, and text-plus-arrow status only when the latest measurement is strictly outside the mean ± one population standard deviation calculated from selected-range measurements. Green/coral are reserved for directionally favorable/unfavorable changes; neutral metrics and within-boundary values have no badge.
- Daily table: readiness, sleep, and activity lead the score columns; the complete table scrolls horizontally on narrow widths with a sticky date column.
- Family score panels: Readiness, Sleep, and Activity each use a marker-free line chart with its own visible domain, calculated from every family member's plotted values. Domains add five points of padding, round outward, stay within 50–100, preserve at least a 20-point span, and use clean 5- or 10-point ticks. Each panel repeats the persisted member colors in a visible text legend with range averages, independent of profile order. A separate selected-date readout lists every profile value in the same order and stays interactive when at least one loaded profile has measurements. With exactly two profiles the panel includes an explicit neutral second-minus-first delta and paired-day count; larger families omit a misleading single delta. Missing-value gaps, visible range copy, and a screen-reader table keep the comparison descriptive and auditable.
- Family detailed comparison: the same metric catalog and one derived comparison model drive a multi-person trend explorer, a conventional desktop numeric table, and a narrow-screen stacked list. The desktop `Metric` heading and each category label are centered within the first metric column; selectable metric labels, every profile heading and value, each status, and the neutral difference align to their column's right edge. The category surface continues across the remaining columns without moving the label away from the first-column center. At 760px and below, every metric shows labeled profile rows and an optional exactly-two-profile difference without horizontal scrolling; profile names and statuses wrap naturally. Chart legends, table headings, and mobile labels reuse each member's persisted identity color and visible name. Each person's status uses only their own selected-range mean ± one population standard deviation and appears only when the latest measurement is strictly outside that boundary; neutral metrics and within-boundary values have no badge, and person-to-person differences remain descriptive and neutral.
- Settings: an explicit Back to dashboard link leads into Connected people, whose inline Add person flow uses short local and handoff labels. Each profile card reuses the custom dashboard selector as an always-dropdown Chart color control with six named, dark-safe choices, swatches, and a selected checkmark; color changes remain server-confirmed rather than optimistic. Profile order controls retain text labels and 44px targets, refresh-all stays scoped to Connected people, backend readiness is compact, and account deletion remains collapsed until requested.

## Motion and materials

Chart selection moves crosshairs and readouts without reconstructing data-derived SVGs or accessible tables. Clicking or tapping keeps focus for subsequent keyboard use but does not draw a frame around the plot; Tab and chart-navigation keys retain a visible focus ring. Axis labels use the muted text color at a minimum of 12px, stay centered on their grid lines, and keep that size on phones. Empty and loading messages are centered within the plot, not the surrounding axes.

Use 150–220ms ease-out transitions for selection, focus, hover, and expanding details. Do not orchestrate page-load animation. Respect `prefers-reduced-motion`. Reserve backdrop blur for the sticky control bar, with an opaque fallback under reduced transparency/high contrast conditions.

## Content and privacy

Use sentence case, short labels, and plain-language descriptions. Missing records display as em dashes and are excluded from averages. Family copy describes scores without medical, causal, compatibility, or relationship claims. Setup copy names the server-held secret boundary without revealing values. Calendar data is not collected.
