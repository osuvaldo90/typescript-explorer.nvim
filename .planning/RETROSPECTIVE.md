# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-03-10
**Phases:** 3 | **Plans:** 10 | **Sessions:** ~5

### What Was Built
- Node.js sidecar with NDJSON protocol, auto-start, crash recovery, and clean shutdown
- Full untruncated TypeScript type resolution via LanguageService with recursive walker
- Interactive side panel with collapsible tree, cursor-follow, and keyboard controls
- 66 tests covering sidecar protocol, type walker, and integration
- 5 quick-fix tasks for real-world usability issues

### What Worked
- Bottom-up phase ordering (sidecar → type resolution → panel) meant each layer was solid before building on it
- TDD approach in Phase 1 and 2 caught protocol issues early
- Gap-closure plans (03-03, 03-04) systematically addressed type-walker edge cases found during integration
- Quick tasks for real-world bugs (array interfaces, byte offsets, stale types) improved usability rapidly
- Node.js built-in test runner (node:test) eliminated test framework dependencies

### What Was Inefficient
- Phase 2 ROADMAP listed 3 plans but execution produced 4 (02-04 was an unplanned interface fix) — plan granularity could be tighter
- Nyquist VALIDATION.md files were created but never completed — validation overhead not justified for a v1.0 MVP
- tsgo research was valuable (confirmed rejection) but could have been a quicker spike

### Patterns Established
- NDJSON over stdio for Neovim ↔ Node.js communication
- safeTypeToString 3-tier fallback for stack-safe type stringification
- maxNodes/maxDepth budget pattern for recursive type walking
- Path-string addressing for tree expand/collapse state
- Fire-and-forget RPC for non-blocking file change notifications
- Per-file version tracking for incremental LanguageService updates

### Key Lessons
1. Type walker edge cases (stack overflow, overloads, private members) only surface with real-world types — integration testing with complex types is essential
2. Default expand depth matters for UX — 1 level was too shallow, 5 levels hit the sweet spot
3. Node budget (maxNodes) is more important than depth limit alone for preventing response size explosion
4. Byte vs character offset mismatch between Neovim and TypeScript is a common gotcha — always use byte offsets at the boundary

### Cost Observations
- Model mix: ~80% opus, ~20% sonnet
- Total execution time: ~0.9 hours across all plans
- Notable: Average 7 min per plan — very fast execution due to clear requirements and well-scoped phases

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | ~5 | 3 | Initial project — established patterns |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.0 | 66 | N/A | node:test (built-in) |

### Top Lessons (Verified Across Milestones)

1. Bottom-up phase ordering prevents rework — each layer must be solid before building on it
2. Real-world usage surfaces bugs that unit tests miss — quick-fix cycle after integration is expected
