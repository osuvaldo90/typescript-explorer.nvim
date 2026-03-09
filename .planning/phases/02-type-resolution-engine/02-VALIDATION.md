---
phase: 2
slug: type-resolution-engine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in) + tsx runner |
| **Config file** | none — uses `tsx --test` directly |
| **Quick run command** | `cd sidecar && npx tsx --test src/**/*.test.ts` |
| **Full suite command** | `cd sidecar && npx tsx --test src/**/*.test.ts` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd sidecar && npx tsx --test src/**/*.test.ts`
- **After every plan wave:** Run `cd sidecar && npx tsx --test src/**/*.test.ts`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | SIDE-03 | unit | `cd sidecar && npx tsx --test src/services/language-service.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | SIDE-04 | unit | `cd sidecar && npx tsx --test src/services/language-service.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 2 | TRES-02 | unit | `cd sidecar && npx tsx --test src/services/type-walker.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 2 | TRES-03 | unit | `cd sidecar && npx tsx --test src/services/type-walker.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-03 | 02 | 2 | TRES-04 | unit | `cd sidecar && npx tsx --test src/services/type-walker.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-04 | 02 | 2 | TRES-05 | unit | `cd sidecar && npx tsx --test src/services/type-walker.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-05 | 02 | 2 | TRES-06 | unit | `cd sidecar && npx tsx --test src/services/type-walker.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-06 | 02 | 2 | TRES-07 | unit | `cd sidecar && npx tsx --test src/services/type-walker.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-07 | 02 | 2 | TRES-08 | unit | `cd sidecar && npx tsx --test src/services/type-walker.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-08 | 02 | 2 | TRES-09 | unit | `cd sidecar && npx tsx --test src/services/type-walker.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-09 | 02 | 2 | SIDE-06 | unit | `cd sidecar && npx tsx --test src/services/type-walker.test.ts` | ❌ W0 | ⬜ pending |
| 02-03-01 | 03 | 3 | TRES-01 | integration | `cd sidecar && npx tsx --test src/handlers/resolve.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `sidecar/src/services/language-service.test.ts` — stubs for SIDE-03, SIDE-04
- [ ] `sidecar/src/services/type-walker.test.ts` — stubs for TRES-02 through TRES-09, SIDE-06
- [ ] `sidecar/src/handlers/resolve.test.ts` — stubs for TRES-01 (end-to-end via NDJSON)
- [ ] `sidecar/test-fixtures/` — TypeScript fixture files for testing (simple.ts, recursive.ts, union.ts, etc.)

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
