# Product

## Platform

web

## Users

Each signed-in ChatGPT user owns an isolated Oura Dashboard account and can add
multiple family members. Every member has a private individual view for a
calm, quick read on sleep, recovery, stress, movement, and workouts. The Family
view helps the owner inspect similarities and differences across the same
detailed Oura metrics while keeping grants, records, and personal baselines
separate.

## Product Purpose

Oura Dashboard turns independently authorized Oura histories into private daily
records, with focused 7-day, 14-day, 30-day, Quarter, and 6-month views.
Success means an owner can understand any individual trend in under a minute,
compare detailed family rhythms without a wall of dashboard cards, and
immediately see which profile needs reconnection. Cached data appears first;
opening the dashboard refreshes every connected profile whose successful sync
is at least three hours old. Thirty-day and longer charts use seven-day moving
averages for legibility while displayed averages remain raw.

## Positioning

A private health dashboard that makes detailed Oura measurements legible without becoming clinical or judgmental.

## Brand Personality

Calm, precise, and humane. The interface should feel native to an Apple device: quiet surfaces, excellent typography, familiar controls, restrained materials, and data that earns attention through hierarchy rather than decoration.

## Anti-references

Avoid generic SaaS dashboards, dense grids of interchangeable cards, medical alarmism, gamified streak pressure, neon wellness palettes, decorative glassmorphism, and fake insights.

## Design Principles

- Make the current state legible before offering analysis.
- Let health data feel personal without becoming clinical or judgmental.
- Reveal detail progressively; preserve a glanceable first viewport.
- Balance breadth with hierarchy: scores first, detailed measurements second.
- Treat missing and stale data explicitly rather than inventing certainty.
- Keep individual identity explicit and never imply a medical or relationship interpretation from Family comparisons.
- Compare each person's latest measured value only with the mean ± one population standard deviation calculated from that selected range; show a badge only when it is strictly outside that boundary, leave neutral and within-boundary values unbadged, and keep person-to-person deltas neutral.
- Keep every tenant and family profile isolated through immutable server-side
  ownership, never a browser-supplied identity.
- Keep Oura application values and encrypted per-profile grants behind Sites
  and ChatGPT authentication; never expose them to client state.

## Accessibility & Inclusion

Meet WCAG 2.2 AA contrast and interaction requirements, preserve browser zoom and scalable text, use 44px minimum touch targets, provide text equivalents for every chart, never rely on color alone, support keyboard navigation, and respect reduced-motion and system light/dark preferences.
