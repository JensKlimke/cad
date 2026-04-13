# Security Analysis

Running log of security-relevant changes in the CAD monorepo. Each
entry documents the affected surface, the threat model, and the
mitigations put in place — so a future auditor can audit "what
changed and why" without re-reading every PR.

## Schema

```markdown
## <Slice / change> — <date>

**Surface:** auth / input validation / secrets / deserialization / file I/O / network / cookies / other
**Change:** what was added or modified
**Threat model:** what a bad actor could try
**Mitigation:** what stops them
**Residual risk:** accepted risk, or "none"
**Verification:** how we confirmed the mitigation works
```

---

## Slice 0b (Wave A + B) — 2026-04-13

**Surface:** cookies (`cad_locale`), static imports of JSON catalogs.

**Change:** new `packages/i18n` workspace package ships a
cookie-first language detector (`src/detector.ts`) and an i18next
instance factory that reads/writes a `cad_locale` cookie. No auth,
no user input validation, no network surface, no file I/O, no
secrets. The only attacker-reachable surface is the cookie and the
static JSON resource map.

**Threat model:**

1. **Cookie tampering** — a user or a malicious extension writes
   `cad_locale=<junk>` into the cookie jar.
2. **XSS injection** — a page rendered with a translated string
   could interpolate attacker-controlled content if variables are
   not escaped.
3. **CSRF** — since the cookie is `SameSite=Lax`, could a
   cross-site request trick the server into executing something as
   a different language?
4. **Supply chain** — i18next, react-i18next, i18next-icu,
   i18next-browser-languagedetector are all new dependencies.

**Mitigation:**

1. **Cookie tampering** — `isSupportedLocale` runs on every read and
   every write. An unsupported value is silently dropped on read
   (the detection chain falls through) and silently ignored on write
   (no cookie is persisted). The cookie holds **display preference
   only**, never any authentication state, so tampering cannot
   escalate privileges.
2. **XSS injection** — `interpolation.escapeValue: false` is set
   deliberately because React already escapes interpolated values
   when they render through JSX. All consumers go through `useT` →
   React. We do **not** use `dangerouslySetInnerHTML` anywhere in
   the `@cad/i18n` React wrapper. ICU variable substitution uses
   `intl-messageformat` which does not interpret HTML. For any
   future rich-text translation (`<Trans>` component with inline
   React), the React escaping still applies.
3. **CSRF** — the cookie is `SameSite=Lax` which is enough because
   it gates **display only**, not authentication, not state
   mutation. The server reads the cookie for response translation
   (Slice 1) but no side effect depends on it. No server state is
   mutated based on the cookie.
4. **Supply chain** — all four dependencies pulled at their current
   major versions via pnpm. Validated by `pnpm audit:vulns` in this
   quality pass (recorded in the quality-pass output). The postinstall
   patch for `replicad-opencascadejs` is unaffected.

**Residual risk:** none accepted. The cookie is display-only,
fail-closed on tampering, and cannot affect authentication or
server-side state.

**Verification:**

- `packages/i18n/test/detector.test.ts` — 11 tests covering
  unsupported-value rejection on read + write, SSR safety,
  cookie round-trip.
- `packages/i18n/test/instance.test.ts` — asserts
  `interpolation.escapeValue: false` path does not leak HTML
  (React renders all interpolated values safely; the factory's
  fallback behaviour is tested).
- `pnpm audit:vulns` — run as part of this quality pass, zero
  moderate+ findings on the new `i18next` / `react-i18next` /
  `i18next-icu` / `i18next-browser-languagedetector` dependency
  tree.

**Not yet covered (will appear in Slice 1):**

- Server-side `request.t` wiring — the `createServerI18n` factory
  ships in Slice 0b but is only consumed starting in Slice 1's
  Fastify bootstrap. The server-side threat model (header parsing,
  CRLF injection in `Accept-Language`, etc.) will be re-evaluated
  there.
- Error envelope `i18nKey` contract — the schema extension for
  `ErrorEnvelopeSchema` lands in Slice 1 / W2. Slice 1's quality
  pass will re-check that no user-controlled input reaches the
  `i18nKey` field.
