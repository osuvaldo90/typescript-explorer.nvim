# Project Research Summary

**Project:** nvim-ts-type-explorer
**Domain:** Neovim plugin with Node.js sidecar for TypeScript type exploration
**Researched:** 2026-03-09
**Confidence:** HIGH

## Executive Summary

This project is a Neovim plugin that provides a persistent side panel with a collapsible tree view of TypeScript types -- filling a clear gap where no Neovim equivalent exists for VS Code extensions like ts-type-explorer and ts-type-expand. The proven architecture is a two-process model: a thin Lua plugin handles UI and keymaps, while a long-running Node.js sidecar uses the TypeScript compiler API (`ts.createLanguageService()`) to resolve types with `NoTruncation`. Communication happens over stdio using newline-delimited JSON. This pattern is well-established (coc.nvim uses similar architecture) and all core technologies are stable and well-documented.

The recommended approach is to build foundation-first: get the sidecar communication working with a round-trip echo test, then add TypeScript LanguageService integration, then the panel UI, and finally wire everything together. The stack is minimal by design -- the only npm dependency is `typescript@~5.9.x`, and the only Neovim plugin dependency is nvim-treesitter. No framework libraries (nui.nvim, neovim node-client) are needed. Use `vim.fn.jobstart()` for the sidecar lifecycle and `ts.createLanguageService()` (not `createProgram()`) for incremental type resolution.

The top risks are: (1) `typeToString` with `NoTruncation` can infinite-loop on recursive types -- mitigate with timeouts and depth limits on every call; (2) orphan sidecar processes when Neovim crashes -- mitigate with stdin EOF detection as the primary safety net; (3) LanguageService memory leaks from stale SourceFiles -- mitigate with proper `getScriptVersion()` implementation; (4) stdout corruption killing the RPC channel -- mitigate by banning `console.log` and redirecting all logging to stderr. These are all solvable with known patterns, but they must be addressed in the initial implementation, not retrofitted.

## Key Findings

### Recommended Stack

The stack is deliberately minimal. The Lua side uses only built-in Neovim APIs (`vim.fn.jobstart`, `vim.json`, `nvim_buf_set_lines`). The Node.js side depends only on the `typescript` npm package. No frameworks, no UI libraries, no RPC libraries.

**Core technologies:**
- **Lua 5.1 / Neovim >= 0.9:** Plugin language and platform. `jobstart` for sidecar, extmarks for highlighting. All APIs stable.
- **TypeScript npm ~5.9.x:** Compiler API for type resolution. `createLanguageService()` + `TypeChecker.typeToString()` with `NoTruncation`. Stable, battle-tested. Do NOT use tsgo -- its programmatic API is experimental and unstable.
- **Newline-delimited JSON over stdio:** Simpler than JSON-RPC or MessagePack. Human-debuggable. Both sides parse trivially. Only ~3 message types needed.
- **nvim-treesitter:** Syntax highlighting for the type panel. Register the TypeScript parser for the custom `tstype` filetype.

**Critical version note:** Stay on TypeScript 5.9.x. TypeScript 6.0 RC exists but is not yet stable. tsgo (TypeScript 7 / native-preview) has an unstable API -- the team has stated Corsa will NOT support the existing Strada API.

### Expected Features

**Must have (table stakes):**
- Full untruncated type display -- the core value proposition
- Collapsible tree view with object properties, unions, intersections, functions, arrays
- Automatic cursor-follow updates (debounced via CursorHold)
- Persistent side panel (not floating window)
- Syntax highlighting via treesitter

**Should have (differentiators):**
- Go-to-definition from tree nodes -- the strongest differentiator, no Neovim plugin does this
- Configurable default expand depth
- Readonly/optional property markers
- Copy type as alias
- Lock/pin current type

**Defer to v2+:**
- Conditional type resolution (high complexity, niche)
- JSDoc/documentation on hover (medium effort, nice-to-have)
- Icon indicators for type kinds (polish)
- Generic type parameter display (medium complexity)

**Anti-features (explicitly do NOT build):**
- Type editing/refactoring, inline virtual text, floating window mode, history navigation, multi-language support, diagnostics, import management

### Architecture Approach

Two-process model with clear separation: Lua handles UI/keymaps/buffer management, Node.js handles TypeScript compiler API operations. The Lua side has 6 modules (init, sidecar, protocol, renderer, tree, panel/config) and the Node.js side has 3 (server, service, type-tree). Communication is request/response with monotonic integer IDs over NDJSON. The sidecar starts lazily on first TypeScript file open, not at Neovim startup. Tree rendering uses plain buffer lines with extmarks (not native Vim folds), following the pattern established by neo-tree and outline.nvim. The Node.js source is bundled to a single `dist/server.js` via esbuild.

**Major components:**
1. **sidecar.lua + protocol.lua** -- Process lifecycle (jobstart/jobstop) and NDJSON request/response with ID tracking
2. **node/src/service.ts** -- TypeScript LanguageService wrapper with proper LanguageServiceHost implementation
3. **node/src/type-tree.ts** -- Recursive type walker with depth limits and cycle detection
4. **panel.lua + renderer.lua + tree.lua** -- Side panel window, tree-to-buffer-lines conversion, expand/collapse state
5. **init.lua** -- Plugin entry point, setup(), autocommands, user commands

### Critical Pitfalls

1. **Recursive type infinite loops** -- `typeToString(NoTruncation)` hangs on self-referential types. Timeout every call (2-3s max). Set depth limits on tree expansion. This is the most likely "works on my project, hangs on yours" bug.
2. **Orphan sidecar processes** -- Node.js outlives Neovim on crash/SIGKILL. Primary safety net: sidecar detects stdin EOF and self-terminates. Secondary: VimLeavePre cleanup. Tertiary: heartbeat timeout.
3. **LanguageService memory leaks** -- Stale SourceFiles accumulate if `getScriptVersion()` is wrong. Use LanguageService (not createProgram), implement proper version tracking, share DocumentRegistry.
4. **stdout corruption** -- Any `console.log` in the sidecar destroys the RPC channel. Ban it. Redirect all logging to stderr. Override console methods at startup.
5. **CursorMoved event storms** -- Use CursorHold (not CursorMoved) for initial implementation. Implement proper cancellable debounce with `vim.uv.new_timer()`. Sidecar should support request cancellation.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Sidecar Communication Foundation
**Rationale:** Everything depends on reliable Lua-to-Node.js communication. The protocol design locks in patterns that are hard to change later (stdout corruption, message framing, request IDs).
**Delivers:** Working bidirectional NDJSON communication between Neovim and a Node.js process. Echo test proving round-trip works.
**Addresses:** Sidecar lifecycle (jobstart/jobstop), protocol serialization, stdin EOF detection for orphan prevention.
**Avoids:** Pitfalls #2 (zombie processes), #4 (stdout corruption) -- must be correct from day one.

### Phase 2: TypeScript Type Resolution
**Rationale:** Depends on Phase 1 communication. This is the core value -- everything after is UI on top of type data.
**Delivers:** Send a file path + position, get back a structured type tree as JSON. LanguageService with proper tsconfig resolution.
**Addresses:** Full untruncated type resolution, recursive type tree building with depth limits, tsconfig.json discovery.
**Avoids:** Pitfalls #1 (recursive type hangs), #3 (memory leaks), #7 (tsconfig resolution failures), #11 (initial load blocking).

### Phase 3: Side Panel and Tree Rendering
**Rationale:** Can be partially developed in parallel with Phase 2 using mock data. Depends on Phase 1 for real data.
**Delivers:** Persistent side panel with tree rendering, expand/collapse interaction, extmark-based highlighting.
**Addresses:** Table stakes features: side panel, collapsible tree, syntax highlighting.
**Avoids:** Pitfalls #6 (invalid buffer), #8 (autocmd loops), #10 (treesitter mismatch).

### Phase 4: End-to-End Integration
**Rationale:** Wires Phases 1-3 together. Cursor events trigger type resolution, results render in the panel.
**Delivers:** Working plugin: open a .ts file, move cursor, see types in the side panel. Expand/collapse nodes.
**Addresses:** Cursor-follow with debounce, expand-on-demand (lazy child loading), user commands (:TsExplorer).
**Avoids:** Pitfall #5 (event storms). Debounce and request cancellation must be correct here.

### Phase 5: Polish and Differentiators
**Rationale:** Core functionality is complete. Now add the features that make this better than "just reading hover output."
**Delivers:** Go-to-definition from tree nodes, copy type as alias, lock/pin, configurable depth, readonly/optional markers, error recovery, :checkhealth.
**Addresses:** All differentiator features from FEATURES.md. Sidecar crash recovery with restart logic.
**Avoids:** Pitfall #12 (crash leaves plugin broken).

### Phase Ordering Rationale

- **Foundation first:** Phases 1-2 establish the data pipeline. Getting the protocol and type resolution right avoids costly rewrites -- 4 of 5 critical pitfalls live in these phases.
- **UI can partially parallel:** Phase 3 can start with mock data while Phase 2 is in progress, but integration testing requires both.
- **Differentiators last:** Go-to-definition, copy-type, and lock/pin all require a working core. They are additive, not structural.
- **Pitfall clustering:** The most dangerous pitfalls (recursive types, zombie processes, memory leaks, stdout corruption) all live in Phases 1-2. Solving them early prevents compounding failures.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2:** TypeScript LanguageServiceHost implementation is nuanced. The `getScriptVersion`/`getScriptSnapshot` contract has subtle requirements. tsconfig resolution in monorepos needs testing against real projects.
- **Phase 3:** The decision between treesitter highlighting vs extmark-based highlighting for the panel buffer needs validation -- depends on whether the rendered tree format is parseable by the TypeScript treesitter grammar.

Phases with standard patterns (skip research-phase):
- **Phase 1:** NDJSON over stdio, `vim.fn.jobstart`, stdin EOF detection -- all well-documented patterns with reference implementations (coc.nvim).
- **Phase 4:** Wiring autocommands to sidecar requests is straightforward Neovim plugin development.
- **Phase 5:** Go-to-definition and copy-to-clipboard are standard Neovim operations. Crash recovery is a known pattern.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies are mature, stable, and well-documented. TypeScript compiler API has years of community usage. No experimental dependencies. |
| Features | HIGH | Clear competitive landscape analysis. VS Code extensions provide strong feature reference. The gap (no Neovim equivalent) is well-established. |
| Architecture | HIGH | Two-process sidecar model is proven by coc.nvim, typescript-tools.nvim, and others. Component boundaries are clean and well-justified. |
| Pitfalls | HIGH | All critical pitfalls sourced from official GitHub issues with confirmed reproduction. Prevention strategies are specific and actionable. |

**Overall confidence:** HIGH

### Gaps to Address

- **Treesitter vs extmarks for panel highlighting:** Research identified this as MEDIUM confidence. The rendered tree format may not be valid TypeScript syntax. Validate early in Phase 3 -- if treesitter parsing fails on the tree format, fall back to extmark-based highlighting (which gives more control anyway).
- **LanguageServiceHost implementation details:** The TypeScript wiki documents the interface, but subtle behaviors around `getScriptVersion`, `getScriptSnapshot`, and `DocumentRegistry` caching are best learned through implementation. Budget time for this in Phase 2.
- **Large monorepo performance:** Scalability numbers (5-15s startup, 200-500ms lookups for 5000+ file projects) are estimates. Real-world testing with large projects is needed during Phase 2 to validate and tune.
- **Windows path handling:** Identified as minor pitfall. Normalize paths at the RPC boundary from the start, but deep Windows testing can be deferred.

## Sources

### Primary (HIGH confidence)
- [TypeScript Compiler API Wiki](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API) -- createProgram, TypeChecker, typeToString
- [TypeScript Language Service API Wiki](https://github.com/Microsoft/TypeScript/wiki/Using-the-Language-Service-API) -- LanguageService, LanguageServiceHost
- [Neovim Job Control docs](https://neovim.io/doc/user/job_control.html) -- jobstart, on_stdout, partial line handling
- [Neovim Treesitter docs](http://neovim.io/doc/user/treesitter/) -- parser registration, custom filetype
- [TypeScript issue #29564](https://github.com/microsoft/TypeScript/issues/29564) -- typeToTypeNode infinite loop
- [TypeScript issue #60237](https://github.com/microsoft/TypeScript/issues/60237) -- recursive conditional type infinite expansion
- [tsgo API Discussion #455](https://github.com/microsoft/typescript-go/discussions/455) -- API instability confirmation
- [Neovim issue #6530](https://github.com/neovim/neovim/issues/6530) -- jobstop does not kill children
- [Neovim node-client issue #107](https://github.com/neovim/node-client/issues/107) -- stdout corruption

### Secondary (MEDIUM confidence)
- [ts-type-explorer (mxsdev)](https://github.com/mxsdev/ts-type-explorer) -- VS Code feature reference
- [ts-type-expand (d-kimuson)](https://github.com/d-kimuson/ts-type-expand) -- VS Code feature reference
- [coc.nvim architecture](https://deepwiki.com/neoclide/coc.nvim/1-introduction-to-coc.nvim) -- sidecar architecture precedent
- [nvim-best-practices](https://github.com/nvim-neorocks/nvim-best-practices) -- plugin structure
- [outline.nvim](https://github.com/hedyhli/outline.nvim) -- tree rendering patterns
- [neo-tree.nvim](https://github.com/nvim-neo-tree/neo-tree.nvim) -- tree UI patterns

---
*Research completed: 2026-03-09*
*Ready for roadmap: yes*
