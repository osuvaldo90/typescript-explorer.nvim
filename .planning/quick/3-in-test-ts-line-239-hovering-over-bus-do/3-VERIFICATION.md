---
phase: quick-3
verified: 2026-03-09T00:00:00Z
status: human_needed
score: 2/3 must-haves verified
human_verification:
  - test: "Hover over bus at line 239 of test.ts in Neovim"
    expected: "Type explorer pane updates to show EventBus<TypeCheckEvent> with expandable children (handlers, on, emit)"
    why_human: "Panel rendering and live cursor-follow behavior cannot be verified programmatically without running Neovim"
---

# Quick Task 3: Fix bus hover not updating type explorer — Verification Report

**Task Goal:** Hovering over `bus` at line 239 of test.ts updates the type explorer pane
**Verified:** 2026-03-09
**Status:** human_needed (automated checks pass; live UI behavior needs human confirmation)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Hovering over `bus` at line 239 updates the pane with EventBus<TypeCheckEvent> | ? NEEDS HUMAN | Fix is implemented (character offset calculation verified in code), but live panel rendering requires Neovim |
| 2 | Panel displays resolved type tree for class instances with generic type parameters | ? NEEDS HUMAN | _update_tree + tree.new + _render pipeline is wired; correctness of rendered output needs human eyes |
| 3 | Large sidecar responses (100KB+) are correctly received and rendered | ✓ VERIFIED | rpc.lua _process_line now logs decode failures with log.error(); no silent dropping. Buffering logic unchanged (was already correct per plan). |

**Score:** 1/3 truths fully verifiable programmatically; 2/3 require human confirmation

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lua/ts-explorer/panel.lua` | Cursor-follow type resolution with debug logging | ✓ VERIFIED | Character offset via vim.fn.strchars() at lines 112 and 118; debug logging at lines 128, 131, 141; rpc.request call at line 130 |
| `lua/ts-explorer/rpc.lua` | JSON-RPC response parsing with robust large-response handling | ✓ VERIFIED | log.debug at line 23 for response size; log.error at line 26 for decode failures; multi-chunk buffering logic intact (lines 7-16) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `lua/ts-explorer/panel.lua` | `lua/ts-explorer/rpc.lua` | `rpc.request('resolve', params, callback)` | ✓ WIRED | panel.lua line 130: `rpc.request("resolve", { filePath = file, position = char_offset }, function(err, result)` |
| `lua/ts-explorer/rpc.lua` | sidecar stdout | `on_data -> _process_line -> vim.json.decode` | ✓ WIRED | rpc.lua line 12: `M._process_line(buffer)`; line 24: `pcall(vim.json.decode, line)` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| QUICK-3 | 3-PLAN.md | Fix bus hover not updating type explorer | ✓ SATISFIED | Root cause (byte vs character offset) identified and fixed in commit 63dc780; character offset calculation verified at panel.lua lines 109-118 |

### Anti-Patterns Found

None found. No TODO/FIXME/placeholder comments or empty implementations in the modified files.

### Human Verification Required

#### 1. Bus hover updates type explorer pane

**Test:** Open Neovim with the plugin loaded. Run `:TsExplorer` to open the panel. Open `test.ts`, navigate to line 239, and place cursor on `bus`. Wait 150ms+ for debounce.

**Expected:** The panel updates to show `EventBus<TypeCheckEvent>` as an object node with expandable children (handlers, on, emit).

**Why human:** Live cursor-follow events (CursorMoved/CursorHold), panel rendering, and real-time RPC response handling cannot be verified programmatically without running Neovim.

#### 2. Other symbols still resolve correctly

**Test:** With the panel open and test.ts active, navigate to:
- Line 236: cursor on `truncationTest`
- Line 240: cursor on `handler`
- Line 243: cursor on `parsed`
- Line 244: cursor on `deepObj`

**Expected:** Each symbol updates the panel with its respective resolved type (BigUnion, function type, Result type, DeepReadonly type).

**Why human:** Same as above — requires live Neovim session.

### Fix Summary

The root cause was a byte-vs-character offset mismatch. `test.ts` contains 3 multi-byte UTF-8 characters before line 239 (two em dashes at U+2014 = 3 bytes each, one arrow at U+2190 = 3 bytes), creating a 6-byte discrepancy. The plugin was sending byte offset 4926 instead of character offset 4920, landing on the `new` keyword of a `NewExpression` node. Since `NewExpression` has no symbol, the sidecar returned `{node: null}` and the panel retained the previous result.

The fix at `panel.lua` lines 109-118 replaces `vim.fn.line2byte()` with a character-counting loop using `vim.fn.strchars()`, correctly computing UTF-16-compatible character offsets. The fix is substantive, wired, and committed (63dc780).

---

_Verified: 2026-03-09_
_Verifier: Claude (gsd-verifier)_
