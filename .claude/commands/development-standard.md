# Development Standards

## Quality Bar
This is production-grade software serving thousands of users. Every change must be deployment-ready — no drafts, scaffolds,backward-compatibility shims, or "professionalize later" placeholders.

## Implementation Approach
- Analyze the codebase deeply before changing it. Understand  existing patterns, conventions, and architecture before proposing additions.
- Plan complex changes before coding. For non-trivial work, outline the approach and identify integration points.
- Research current best practices when the solution domain is unfamiliar. Use latest stable versions of third-party packages.
- Implement the complete solution. No partial implementations, no TODO comments for future work, no feature flags for unfinished code.

## Architecture Principles
- Keep it lean: solve the actual problem, not hypothetical future ones.
- No redundancy: extract shared logic, but don't abstract prematurely.
- Encapsulate atomic features with clear boundaries and single responsibilities.
- Follow the project's established patterns. When adopting ideas from external sources, evaluate and adapt them to this project's context — don't copy blindly.

## Code Quality
- Document non-obvious decisions and public APIs. Don't document the self-evident.
- Complex solutions are acceptable when the problem demands it. Simplicity is preferred when it doesn't compromise correctness or maintainability.

## Known Bug/Issue Logging
- During every coding session, log any bugs, warnings, errors, unexpected behavior, or deprecations observed in logs/output that are **unrelated to the current task** to `known-issues.md`.
- Include: short description, where observed (build, test, logs, browser), and date.
- Don't fix these bugs unless explicitly asked — just log them. Nothing should be silently ignored.

## Testing
- Create tests for new functionality. Update tests when behavior changes. Remove tests that are obsolete.
- Shift left: Try to cover as much as possible with unit and integration tests. Create e2e tests when needed but at least one e2e test as kind of a smoke test.
- Fix flaky or failing tests you encounter, even if unrelated to  your current task.

## Documentation
- Care about lean code documentation (tsdoc). Reference the book chapter the code
- When your change modifies documented behavior, update the affected chapter and its keywords.
