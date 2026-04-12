# Slice 10b — Printer Integration v1 (Bambu 3MF Handoff)

> Skeleton plan. Upgraded to Slice-0 depth when execution begins.
> Parent: [`PLAN.md`](../../PLAN.md) — Slice 10b.

## Goal

Make the Slice 10 3MF export land cleanly in **Bambu Studio**. Extend the 3MF writer to emit BambuStudio's metadata extensions (thumbnails, plate dimensions, unit tag, recommended filament hint, model name), add a "Download for Bambu Studio" action in the Export menu, and document the handoff in the handbook. This is the **minimum acceptable answer** to the user's "at least load the part in the Bambu software" requirement — everything beyond it is Slice 10c.

## Definition of Done

- `@cad/exporters` emits BambuStudio-compatible 3MF with:
  - Multiple plate thumbnails (top + iso) rendered from the viewport camera
  - Plate dimensions (A1 / X1C / P1S defaults selectable)
  - Unit tag set to millimetres
  - Recommended filament hint (user-settable)
  - Model name and optional description
- Export menu has a dedicated "Download for Bambu Studio" action alongside generic 3MF
- Double-clicking the file opens Bambu Studio with the part ready to slice — validated manually on a real Bambu Studio install
- Handbook: "Printing → Bambu Studio handoff" page with screenshots
- API e2e: parse the emitted 3MF back and assert every required Bambu metadata key is present

## Out of Scope

- LAN direct print → Slice 10c
- Printer registration / credentials → Slice 10c
- Server-side slicing → deferred (captured in PLAN.md's "Deferred Ideas")

## Dependencies

Slice 10 (`@cad/exporters` must exist).

## Work Items (high-level)

- **W1** Headless thumbnail renderer: three.js offscreen canvas; reuses the Slice 3 scene setup; captures top + iso views
- **W2** Bambu metadata emitter: frontmatter fields, plate config XML, thumbnail blob embedding (per 3MF spec + Bambu extensions)
- **W3** Plate preset library: A1, X1C, P1S, A1 Mini plate dimensions
- **W4** Export UI update: "Download for Bambu Studio" button with preset picker + filament hint input
- **W5** Server endpoint for Bambu 3MF generation (shares the generic 3MF pipeline, adds the metadata layer)
- **W6** Handbook page with screenshots and a one-minute walkthrough
- **W7** API e2e: emit a Bambu 3MF, unzip it in-test, assert Bambu metadata keys, assert thumbnails are valid PNGs
- **W8** Manual verification checklist: install Bambu Studio, open the file, confirm visual parity
- **W9** `docs/verification/slice-10b.md` checklist

## Key Decisions

| Concern                | Choice                                              | Reason                                                |
| ---------------------- | --------------------------------------------------- | ----------------------------------------------------- |
| Thumbnail renderer     | Headless three.js reusing Slice 3 scene             | One codebase, one visual style, deterministic         |
| Metadata schema source | BambuStudio's open 3MF format docs                  | Authoritative; matches what the target tool parses    |
| Plate defaults         | User picks from preset list, persisted per-document | Avoids wrong-bed surprises; config in the source      |
| Filament hint          | Free-text field (not a dropdown)                    | BambuStudio accepts hints, not hard filament bindings |
| No separate binary     | Reuse generic 3MF writer with a metadata layer      | Slice 10 remains the source of truth                  |

## Testing Strategy

- **Unit**: Bambu metadata serializer (frontmatter XML shape), thumbnail base64 encoding
- **Integration**: full 3MF emit → zip inspection → assert structure
- **API e2e**: end-to-end through the server; document the exact Bambu metadata keys present
- **Component**: Export menu updates; preset picker
- **Playwright**: no new journey (existing Slice 10 export journey exercises this path via a variant)
- **Manual**: documented in `docs/verification/slice-10b.md` — must open cleanly in Bambu Studio on macOS and Windows

## Risks

| Risk                                                           | Likelihood | Impact | Mitigation                                                                              |
| -------------------------------------------------------------- | ---------- | ------ | --------------------------------------------------------------------------------------- |
| Bambu metadata schema drift on a new Bambu Studio release      | Med        | Med    | Pin the schema version; monitor Bambu Studio release notes; known-issues entry on drift |
| Thumbnail rendering fidelity on server-side headless GL        | Med        | Med    | Reuse the exact Slice 3 scene setup; golden images in snapshot tests                    |
| Double-click open behaviour varies across OS file associations | High       | Low    | Document setup steps in the handbook; not a blocking gate                               |
| Plate mismatch causing Bambu Studio to complain                | Med        | Low    | Preset picker is mandatory in the Export UI; default is the smallest common plate       |

## Exit Criteria → Gate into Slice 10c

- DoD met, CI green on `main`
- Real Bambu Studio install opens the file on at least one macOS and one Windows machine
- `known-issues.md` has no new P0/P1 entries
- Retrospective note added
