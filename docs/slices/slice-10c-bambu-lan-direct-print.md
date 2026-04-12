# Slice 10c — Printer Integration v2 (BambuLab LAN Direct Print)

> Skeleton plan. Upgraded to Slice-0 depth when execution begins.
> Parent: [`PLAN.md`](../../PLAN.md) — Slice 10c.

## Goal

Skip the handoff: send the part straight to a BambuLab printer over the LAN. Ship the pluggable `@cad/printers` package, a BambuLab provider implementing MQTT + FTP against Developer Mode, a Printers UI page, a per-document "Send to Printer" action, and live status streamed from a server-side persistent MQTT connection. Credentials never reach the browser; every print command is audited.

## Definition of Done

- A user can add a BambuLab printer (host/IP, serial, access code) through the Printers page; credentials are encrypted at rest
- "Send to Printer" on the Slice 8 Raspberry Pi mount actually starts a print on a real BambuLab printer on the same LAN
- Live job status (bed temp, nozzle temp, progress, state) streams to the UI via the existing WebSocket channel
- Supported models (verified manually): X1 / X1C / P1P / P1S / A1 / A1 Mini
- MQTT connection lives on the server; the access code never appears in any browser network request
- Audit log records every credential change and every print command
- Mock provider covers unit + integration + API e2e layers; no real printer required for CI
- Opt-in real-printer smoke test (`PRINTER_SMOKE=bambu_x1c`) documented and gated off by default

## Out of Scope

- BambuLab Cloud transport → deferred (PLAN.md "Deferred Ideas")
- Additional printer providers (Prusa, Klipper, OctoPrint) → deferred; `PrinterProvider` interface is the contract for them
- Server-side slicing → deferred
- Multi-job queue / printer pooling → deferred
- Per-material profiles — the printer's own profile library handles this at Slice 10c

## Dependencies

Slices 10, 10b (generic + Bambu 3MF). Also Slices 1 (Postgres), 4 (UI shell), 12 is NOT a dependency — direct print is a first-class server feature, not a side effect of the API surface.

## Work Items (high-level)

- **W1** `@cad/printers` package core: `PrinterProvider` interface with `connect`, `status`, `uploadFile`, `startPrint`, `pausePrint`, `resumePrint`, `cancelPrint`, `listFiles`, `onStatusChange`; registry; Zod schemas in `@cad/protocol`
- **W2** Encrypted credential store: Postgres column encrypted with a per-install KMS key; envelope encryption; rotation path documented
- **W3** `@cad/printers/providers/bambulab`: MQTT client (`mqtt` npm), FTP client (`basic-ftp` npm); topics + payload shapes from Doridian's `OpenBambuAPI` docs
- **W4** `PrinterSupervisor` service on the server: per-user persistent MQTT connections, subscription → WebSocket fan-out, reconnect with backoff
- **W5** DB schema: `printers` table (owner, provider, host, serial, encrypted access code, nickname, last_seen, last_status)
- **W6** Printers page UI: add / edit / remove / test connection / live status card (bed temp, nozzle temp, progress, camera thumbnail if available)
- **W7** "Send to Printer" per-document action: picker, confirmation dialog, live progress overlay
- **W8** WebSocket event contract for printer status events; shared with Slice 3's viewport channel
- **W9** Mock BambuLab provider for CI: records calls, returns scripted status sequences
- **W10** Real-printer smoke-test job gated on `PRINTER_SMOKE=bambu_x1c` env
- **W11** Handbook pages: "Printing → BambuLab LAN setup", "Printing → Sending a job", "Printing → Troubleshooting"
- **W12** Audit log emitter — print commands + credential changes; queryable from the admin view
- **W13** API e2e against the mock provider
- **W14** `docs/verification/slice-10c.md` checklist including a real-printer walkthrough for every supported model

## Key Decisions

| Concern            | Choice                                     | Reason                                                         |
| ------------------ | ------------------------------------------ | -------------------------------------------------------------- |
| Transport          | LAN-only MQTT + FTP                        | PLAN.md commitment; no third-party cloud dependency            |
| Encryption         | AES-256-GCM envelope + per-install KMS key | Standard; rotation without data rewrite; bounded blast radius  |
| Connection model   | Persistent server-side per-user            | Credentials never reach the browser; low latency status        |
| MQTT library       | `mqtt` (well-maintained, broad compat)     | PLAN.md commitment                                             |
| FTP library        | `basic-ftp`                                | PLAN.md commitment; works against BambuLab's non-standard FTPS |
| Provider interface | Public contract from day one               | Prusa / Klipper / OctoPrint follow without touching the core   |
| Protocol reference | Doridian's `OpenBambuAPI` docs             | Most complete community reference                              |

## Testing Strategy

- **Unit**: encrypted credential store, MQTT topic handlers, FTP upload chunking, provider-interface contract tests
- **Integration**: mock provider + PrinterSupervisor end-to-end
- **API e2e**: printer CRUD, "Send to Printer" via mock provider, live status stream
- **Component**: Printers page, send dialog, status card
- **Manual**: real-printer smoke test with the documented model matrix
- **Playwright**: no new golden journey — Slice 14 exercises this path via MCP; Slice 11's command-palette journey may reuse

## Risks

| Risk                                                        | Likelihood | Impact | Mitigation                                                                                                     |
| ----------------------------------------------------------- | ---------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| Bambu firmware drift changes MQTT payloads                  | High       | High   | Pin the protocol version; integration tests mirror known-good responses; handbook notes firmware compatibility |
| Credential leak via logs                                    | Med        | High   | Pino log scrub hook redacts `accessCode`; CI lint grep against known-bad patterns                              |
| MQTT reconnect storms under flaky LAN                       | Med        | Med    | Exponential backoff with jitter; max-in-flight throttle                                                        |
| Smoke test flake on CI (should never run, but just in case) | Low        | Low    | Gated by env; default off; documented escape hatch                                                             |
| Model-specific quirks (A1 vs X1C FTP paths)                 | Med        | Med    | Per-model adapter layer inside the BambuLab provider                                                           |

## Exit Criteria → Gate into Slice 11

- DoD met, CI green on `main`
- Real-printer smoke test passed on at least X1C + A1
- Audit log verified end-to-end
- Credential leak grep clean
- `known-issues.md` has no new P0/P1 entries
- Retrospective note added
