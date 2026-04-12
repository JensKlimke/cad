# Slice 11 — Command Palette, Keyboard, Polish

> Skeleton plan. Upgraded to Slice-0 depth when execution begins.
> Parent: [`PLAN.md`](../../PLAN.md) — Slice 11.

## Goal

Turn the app from "it works" into "it feels like a pro tool." Ship the Cmd+K command palette, a central keyboard-shortcut registry with Onshape-compatible defaults, hover tooltips backed by handbook metadata, a proper dark/light theme, and a focused accessibility pass. A designer familiar with Onshape or SolidWorks should be able to drive this without reading docs.

## Definition of Done

- Cmd+K command palette lists every action in the app, searchable, with handbook hits surfaced inline
- Every action in the registry has: id, label, description, default shortcut, category, handbook anchor, handler
- Onshape-compatible default shortcut set shipped; user can remap; conflicts flagged at registration time (fail-fast in dev, user-visible warning in prod)
- Hover tooltips on every button and menu item with descriptions pulled from the handbook `docMetadata`
- Full dark/light theme with CSS custom properties; respects system preference with a manual override
- Accessibility: focus rings, ARIA roles, keyboard-only navigation across the whole shell (viewport aside)
- Playwright golden journey #7 (handbook access) and #8 (command palette) both green

## Out of Scope

- Full WCAG AAA audit (target: AA on happy paths)
- Custom themes beyond dark/light (user themes → later)
- IME / complex input method polish (later)
- Mobile layouts (tablet-responsive is stretch, not DoD)

## Dependencies

Slices 0–10c (palette needs everything that exposes actions; Slice 4b's handbook API powers tooltips + search).

## Work Items (high-level)

- **W1** Central action registry (`apps/web/src/actions/registry.ts`): typed `CommandAction` objects; compile-time check that every action references a handbook anchor
- **W2** Keyboard shortcut service: global listener, scope-aware (viewport vs form vs palette), conflict detection at registration time, remapping UI
- **W3** Default shortcut set: curate against Onshape / SolidWorks reference; document every override in the handbook
- **W4** Command palette (Cmd+K): fuzzy match, recent-first, handbook hits in a second section, arrow/enter navigation
- **W5** Tooltip system: reads `docMetadata.shortDescription` + keybinding from the registry; single source of truth
- **W6** Theming: CSS variables for every semantic colour; `data-theme` attribute on `<html>`; system-preference sync with user override
- **W7** Accessibility pass: focus outlines, `role` and `aria-*` attributes, keyboard-only navigation audit, screen-reader smoke test
- **W8** Handbook integration: palette surfaces handbook entries as a separate list; deep-linked to the in-app viewer
- **W9** Playwright golden journey #7: press `?` on a feature, correct handbook page opens at the right anchor
- **W10** Playwright golden journey #8: Cmd+K → search for an action → run it → assert side effect
- **W11** Component tests for palette, tooltip, theme switcher
- **W12** `docs/verification/slice-11.md` checklist

## Key Decisions

| Concern                  | Choice                                  | Reason                                                           |
| ------------------------ | --------------------------------------- | ---------------------------------------------------------------- |
| Palette library          | Custom on top of Radix primitives       | Full control; no third-party lock-in; matches shadcn patterns    |
| Shortcut registry        | Hand-rolled service with scope stacks   | Lightweight; scope-aware handling without a generic library      |
| Default shortcut profile | Onshape-compatible                      | Most CAD users already know it; SolidWorks profile follows later |
| Theme                    | CSS custom properties + Tailwind        | Matches PLAN.md stack; cheap to re-skin                          |
| Tooltip source           | Handbook `docMetadata.shortDescription` | Single source of truth; no parallel strings                      |

## Testing Strategy

- **Unit**: shortcut conflict detector, scope stack, palette fuzzy matcher
- **Integration**: registry compile-time completeness (every action → handbook anchor exists)
- **Component**: palette, tooltip, theme switcher, remap dialog
- **Playwright**: golden journeys #7 + #8
- **Manual**: keyboard-only walkthrough by one team member; screen-reader smoke test on VoiceOver

## Risks

| Risk                                                     | Likelihood | Impact | Mitigation                                                                    |
| -------------------------------------------------------- | ---------- | ------ | ----------------------------------------------------------------------------- |
| OS-specific shortcut collisions (Ctrl/Cmd/Super mapping) | High       | Med    | Platform-aware default table; remapping UI; CI lint on known-bad combinations |
| Palette performance with a large action set              | Low        | Med    | Index once at registry build; debounce input                                  |
| Theme gaps where styles hardcoded colours                | High       | Low    | Lint rule disallowing raw hex in components; CSS variables only               |
| Accessibility regressions with future UI changes         | Med        | Med    | Component tests assert ARIA roles; dedicated a11y Playwright check            |

## Exit Criteria → Gate into Slice 12

- DoD met, CI green on `main`
- Playwright golden journeys #7 + #8 green across 50 consecutive runs
- Keyboard-only walkthrough signed off
- `known-issues.md` has no new P0/P1 entries
- Retrospective note added
