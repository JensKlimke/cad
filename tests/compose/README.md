# @cad/tests-compose

Compose-backed integration tests for the full Slice 1 on-prem stack.

The suite is gated behind `INTEGRATION=1` so the default `pnpm test` path stays
fast:

```bash
pnpm test:compose
```
