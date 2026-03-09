---
phase: 1
slug: sidecar-communication
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in test runner (`node --test`) + Neovim headless |
| **Config file** | none — Wave 0 installs |
| **Quick run command** | `node --test sidecar/src/**/*.test.ts` |
| **Full suite command** | `make test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test sidecar/src/**/*.test.ts`
- **After every plan wave:** Run `make test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 0 | SIDE-02 | unit | `node --test sidecar/src/protocol.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 0 | SIDE-05 | unit | `node --test sidecar/src/lifecycle.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 1 | SIDE-01 | integration | `nvim --headless -c "lua require('ts-explorer.sidecar').start()" -c "qa"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `sidecar/src/protocol.test.ts` — stubs for SIDE-02 echo round-trip
- [ ] `sidecar/src/lifecycle.test.ts` — stubs for SIDE-05 stdin close self-termination
- [ ] `Makefile` with `test` target orchestrating both Lua and Node tests
- [ ] Node.js test runner setup (built-in `node --test`, no framework needed)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sidecar starts on plugin load in real Neovim | SIDE-01 | Requires real Neovim with plugin manager | 1. Install plugin via lazy.nvim 2. Open Neovim 3. Check `:!ps aux \| grep node` for sidecar process |
| No orphaned processes after `:qa` | SIDE-05 | Process cleanup timing is OS-dependent | 1. Start Neovim with plugin 2. `:qa` 3. Verify no lingering node processes |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
