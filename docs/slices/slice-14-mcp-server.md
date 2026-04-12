# Slice 14 — MCP Server

> Skeleton plan. Upgraded to Slice-0 depth when execution begins.
> Parent: [`PLAN.md`](../../PLAN.md) — Slice 14.

## Goal

Make the system **AI-native**: expose CAD operations, handbook lookup, and printer control as MCP tools so any MCP client (Claude, Cursor, custom agent) can author models, look up documentation, build, export, and dispatch prints — all through the same Zod-validated codemods the UI and CLI use. The handbook is the agent's primary learning surface: MCP prompts instruct the agent to call `handbook_for_op` before first use of any authoring op.

## Definition of Done

- MCP server binary (`apps/mcp`) serves stdio and Streamable HTTP transports
- Tools exposed: authoring (`list_projects`, `open_document`, `get_document_source`, `apply_authoring_op`, `set_parameter`, `build`, `export`, `query_references`), handbook (`handbook_search`, `handbook_get`, `handbook_list`, `handbook_for_op`), printer (`printer_list`, `printer_status`, `printer_send`, `printer_cancel`)
- Every tool uses the same Zod schemas from `@cad/protocol` — no drift from REST
- Server prompts instruct the agent to call `handbook_for_op` before issuing any authoring op it hasn't used before
- Session model ties tools to a document + audit log; the audit records which handbook pages were consulted before each authoring call
- Real MCP client (Claude Desktop or Cursor) can complete an end-to-end journey: reshape the Raspberry Pi mount, build, export, and dispatch a print
- API e2e exercises every tool via an in-process test client

## Out of Scope

- Cloud-hosted MCP (on-prem means local MCP only)
- Multi-agent orchestration on top of the server
- Tool cost / quota management — deferred until observed as a real problem
- Non-MCP agent protocols (OpenAI functions, etc.) — explicit non-goal for v1

## Dependencies

Slices 2 (authoring), 4b (handbook), 10c (printers), 12 (protocol schemas).

## Work Items (high-level)

- **W1** `apps/mcp` bootstrap using the TypeScript MCP SDK: dual stdio + Streamable HTTP transports
- **W2** Tool registration: one module per tool group (authoring, handbook, printer); each tool is a thin wrapper over the existing REST/service code
- **W3** Schema reuse: import Zod schemas from `@cad/protocol`; generate MCP tool descriptions from `docMetadata`
- **W4** Server prompts (MCP `prompts` capability): "Before calling any authoring tool you haven't used in this session, first call `handbook_for_op` for that op and follow its examples."
- **W5** Session context object: current workspace, current document, selected printer, audit log handle
- **W6** Audit log sink: every tool call + every consulted handbook page recorded with timestamp + session id; queryable from the admin view
- **W7** In-process MCP test client: runs the server in a worker, exercises every tool end-to-end
- **W8** Permission model: tools inherit the REST user's permissions; no new auth model in this slice
- **W9** Example MCP client configs for Claude Desktop + Cursor in `examples/mcp/`
- **W10** Handbook pages: "AI → Using the MCP server", "AI → Tool reference"
- **W11** `docs/verification/slice-14.md` checklist including a manual Claude Desktop walkthrough

## Key Decisions

| Concern      | Choice                                           | Reason                                                            |
| ------------ | ------------------------------------------------ | ----------------------------------------------------------------- |
| SDK          | TypeScript MCP SDK (`@modelcontextprotocol/sdk`) | Official, Zod-friendly, dual transport                            |
| Transport    | stdio primary, Streamable HTTP secondary         | stdio matches Claude Desktop; HTTP supports longer-lived sessions |
| Tool schemas | Imported from `@cad/protocol`                    | Single source of truth; no drift from REST                        |
| Prompts      | Handbook-first nudge baked into server metadata  | AI self-educates before acting                                    |
| Audit sink   | Existing audit log table                         | Reuse Slice 10c's infrastructure                                  |

## Testing Strategy

- **Unit**: tool wrappers, prompt builder, session context
- **Integration**: in-process MCP client driving every tool against the mock printer provider + real kernel
- **API e2e**: MCP tool calls equivalent to REST API e2e suites — identical assertions where semantics overlap
- **Manual**: Claude Desktop walkthrough documented in `docs/verification/slice-14.md`
- **Contract**: Zod schemas used for both REST (Slice 12) and MCP — drift test already in place from Slice 12

## Risks

| Risk                                                 | Likelihood | Impact | Mitigation                                                               |
| ---------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------ |
| Tool description bloat hurts agent tool-use accuracy | Med        | High   | Keep descriptions to one sentence + example; rely on handbook for depth  |
| MCP SDK churn in early releases                      | Med        | Med    | Pin version; upgrade discipline tracked in known-issues                  |
| Agent bypasses handbook-first prompt                 | Med        | Med    | Audit log surfaces non-compliance; handbook-first is a nudge, not a gate |
| Audit log volume under heavy agent use               | Low        | Med    | Rotation policy; Slice 15 observability dashboards                       |

## Exit Criteria → Gate into Slice 15

- DoD met, CI green on `main`
- Claude Desktop walkthrough succeeds end-to-end including a real print via the Slice 10c path
- `known-issues.md` has no new P0/P1 entries
- Retrospective note added
