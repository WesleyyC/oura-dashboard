# Shared UI instructions

Read the root `AGENTS.md` first. This directory contains browser-safe,
feature-neutral presentation primitives. It may import React and third-party UI
libraries, but it must not import from `features/`, `platform/`, request code,
or server entrypoints.

Preserve semantic HTML, keyboard behavior, focus handling, accessible names,
and existing CSS selectors. Add or update focused interaction and accessibility
coverage whenever an interactive primitive changes.

Focused check: `npm run test:focus -- shared` plus `npm run test:focus -- architecture` for boundary changes.
