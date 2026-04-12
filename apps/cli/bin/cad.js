#!/usr/bin/env node
// Thin launcher — calls the exported `runMain` so importing the compiled
// entry from tests or another tool has no side effects. The shebang and
// this file exist so `package.json` → `bin` has a stable path that does
// not need rewriting after `tsc` emit.
import { runMain } from '../dist/index.js';

await runMain();
