# Phase 2: Type Resolution Engine - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Given a file path and cursor position, the sidecar returns a complete structured type tree with no truncation. The sidecar discovers the project's tsconfig.json, uses TypeScript LanguageService for incremental resolution, and handles recursive/pathological types gracefully. Panel UI and rendering are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Type expansion depth
- Always expand fully — resolve everything to structural types, never show alias names as opaque nodes
- Imported types resolve inline — no source file breadcrumbs in the tree structure
- Intersections show merged result — `{ a: string } & { b: number }` becomes a single object with both properties
- Union branches are flat children of the union node — each branch is a direct child

### Recursive type handling
- Show `[circular: TypeName]` marker at the recursion point after one expansion
- Circular markers are static labels, not interactive — no re-expansion in v1
- On resolution timeout, return partial results — resolved nodes come back normally, unresolved nodes show `[resolution timeout]` marker
- No error response on timeout — silent degradation with partial data

### Node data shape
- Specific kind system per node: `object`, `union`, `intersection`, `function`, `array`, `tuple`, `primitive`, `literal`, `enum`, `circular`, `timeout`
- Each node carries `typeString` field with the TS compiler's rendered type string (for copy-to-clipboard in v2, debugging)
- Modifier flags as separate boolean fields: `optional: true`, `readonly: true` — not baked into the name string
- Include source location (`sourcePath`, `sourceLine`) on each node for v2 "go to definition" (NAV-01) without re-resolving

### Claude's Discretion
- tsconfig.json discovery strategy (walk-up, composite projects)
- TypeScript LanguageService initialization and caching
- Timeout duration and implementation mechanism
- Handler method name and params schema for the NDJSON protocol
- Internal type traversal algorithm

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `sidecar/src/protocol.ts`: Request/Response/ErrorResponse interfaces — extend for type resolution responses
- `sidecar/src/main.ts`: Handler dispatch via switch(msg.method) — add new case for type resolution
- `sidecar/src/handlers/echo.ts`: Handler pattern to follow for new resolve handler

### Established Patterns
- NDJSON protocol: one JSON object per line, `{id, method, params}` request / `{id, result}` response
- Error codes: PARSE_ERROR, UNKNOWN_METHOD, HANDLER_ERROR
- CJS output via tsup, tests via node:test + tsx
- Logging to stderr only (`console.error`)

### Integration Points
- New handler in `sidecar/src/handlers/` following echo.ts pattern
- TypeScript `~5.7.0` in devDependencies — needs to become runtime dependency for compiler API
- Lua side (`lua/ts-explorer/rpc.lua`) already sends structured requests — will send file+position for resolution

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-type-resolution-engine*
*Context gathered: 2026-03-09*
