---
description: UI/UX rules for Gabify — applied to all component work
---

# UI Rules for Gabify

## Audience
Users are Portuguese accountants, 35–60 years old, working in small/medium firms. They spend 8h/day in front of this tool. Design for clarity and speed, not for impressiveness.

## Visual Principles
- **No decorative elements** — no gradients, no hero illustrations, no marketing-style layouts
- **Tables over cards** for list data — accountants scan rows, not cards
- **Dense but readable** — compact spacing (Tailwind `space-y-2`, not `space-y-8`) is preferred
- **Monochrome first** — use color only to convey status (green = ok, red = error, yellow = pending)

## Component Rules
- Every interactive element needs a loading state, empty state, and error state — no exceptions
- Tables must have: sortable columns, clear headers, row hover, pagination
- Forms must have: inline validation, clear labels (in Portuguese), disabled state during submission
- Status badges: use consistent color mapping across the entire app

## Status Color Mapping (enforce globally)
```
PENDING    → yellow  (waiting for accountant action)
APPROVED   → green   (accountant approved)
REJECTED   → red     (accountant rejected)
PROCESSING → blue    (AI/system working)
ERROR      → red     (system error)
DRAFT      → gray    (AI draft, not yet reviewed)
```

## Language
- UI text in **Portuguese (PT)** — not PT-BR, not EN
- Error messages must be human-readable in PT — no raw error codes exposed to user
- Dates in `DD/MM/YYYY` format (Portuguese convention)

## Accessibility
- All interactive elements keyboard-navigable
- ARIA labels on icon-only buttons
- Minimum contrast ratio 4.5:1

## shadcn/ui Usage
- Use shadcn components as base — do not reinvent primitives
- Customise via `cn()` utility, not inline styles
- Never override shadcn internals with `!important`
