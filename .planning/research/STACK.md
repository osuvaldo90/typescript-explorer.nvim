# Technology Stack

**Project:** nvim-ts-type-explorer
**Researched:** 2026-03-09

## Recommended Stack

### Neovim Plugin (Lua side)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Lua 5.1 API | - | Plugin language | Required by Neovim. Use 5.1 API even if LuaJIT is available for compatibility across all Neovim builds. | HIGH |
| Neovim | >= 0.9 | Editor platform | Extmark APIs, `vim.fn.jobstart`, treesitter integration all stable from 0.9+. | HIGH |
| `vim.fn.jobstart` | Built-in | Sidecar lifecycle & stdio | Preferred over `vim.system()` for long-running sidecar processes. `jobstart` provides `on_stdout`/`on_stderr`/`on_exit` callbacks and `nvim_chan_send()` for stdin. `vim.system()` (added 0.10) is better for one-shot commands, not persistent bidirectional communication. | HIGH |
| nvim-treesitter | latest | Syntax highlighting in type panel | Users already have it. Register the TypeScript parser for the custom filetype to get free syntax highlighting of type annotations. No custom grammar needed. | HIGH |

### Node.js Sidecar (TypeScript side)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Node.js | >= 18 LTS | Sidecar runtime | LTS baseline. The sidecar is lightweight (no HTTP server, just stdio). | HIGH |
| TypeScript (npm) | ~5.9.x | Compiler API for type resolution | Stable, battle-tested `ts.createProgram` / `ts.TypeChecker` API. `typeToString()` with `TypeFormatFlags.NoTruncation` is the core mechanism. TypeScript 6.0 RC exists but is not yet stable; stay on 5.9.x for production reliability. | HIGH |
| typescript (dev) | 5.9.x | Compile sidecar source | Same package used at runtime for the compiler API. | HIGH |

### Communication Protocol

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Newline-delimited JSON over stdio | Custom | Lua <-> Node.js messaging | Simpler than JSON-RPC or MessagePack-RPC. Each message is a single JSON line terminated by `\n`. No need for headers, content-length framing, or a full RPC library. The sidecar reads lines from stdin, writes JSON lines to stdout. Lua side uses `jobstart` with `on_stdout` callback and `nvim_chan_send`. | HIGH |

### Supporting Libraries (Node.js sidecar)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `readline` | Built-in Node.js | Parse stdin line-by-line | Always -- process incoming requests from Neovim |
| `path` | Built-in Node.js | File path resolution | Always -- resolve tsconfig and source files |

### Infrastructure

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Treesitter TypeScript parser | Bundled with nvim-treesitter | Highlight type annotations | Reuse the existing `typescript` treesitter parser. Register it for the custom `tstype` filetype via `vim.treesitter.language.register('typescript', 'tstype')`. Write minimal highlight queries in `queries/tstype/highlights.scm` that inherit from TypeScript queries. | MEDIUM |

## Key Technical Decisions

### 1. TypeScript npm package over tsgo -- Use TypeScript 5.9.x

**Decision:** Use the standard `typescript` npm package, not tsgo (`@typescript/native-preview`).

**Rationale:**

- **tsgo's programmatic API is experimental and unstable.** As of March 2026, the `--api` flag exists but the API is "still under development." The team explicitly stated: "Corsa/TypeScript 7.0 will not support the existing Strada API." The IPC-based API returns types as opaque IDs requiring follow-up requests -- more complex than direct `TypeChecker` access.
- **The TypeScript npm compiler API is stable and well-documented.** `ts.createProgram()`, `checker.getTypeAtLocation()`, `checker.typeToString(type, node, TypeFormatFlags.NoTruncation)` -- these APIs have been stable across dozens of TypeScript releases.
- **Performance is not the bottleneck.** The sidecar runs a long-lived `ts.Program` that gets incrementally updated. Type resolution for a single symbol is fast (milliseconds). The 10x speedup of tsgo matters for full-project type-checking, not single-symbol queries.
- **Migration path exists.** When tsgo's API stabilizes (likely late 2026+), the sidecar's type resolution layer can be swapped out. The Lua plugin side is completely decoupled from the type resolution backend.

**Confidence:** HIGH -- tsgo API instability is confirmed by official Microsoft discussion (github.com/microsoft/typescript-go/discussions/455).

### 2. Newline-delimited JSON over stdio -- Not JSON-RPC, not MessagePack

**Decision:** Use simple newline-delimited JSON (`\n`-terminated JSON objects) for Lua <-> Node.js communication.

**Rationale:**

- **JSON-RPC adds unnecessary complexity.** JSON-RPC requires request IDs, method names, error codes, and a formal spec. This plugin has ~3 message types (resolve_type, response, error). A full RPC framework is overkill.
- **MessagePack-RPC is what Neovim uses internally** (via `neovim/node-client`), but using it means importing the heavy `neovim` npm package which monkey-patches `console.log` and brings in the entire Neovim remote plugin infrastructure. We don't need remote plugin registration -- just stdin/stdout message passing.
- **Newline-delimited JSON is trivially parseable** on both sides. Node.js: `readline` on stdin, `JSON.parse` each line. Lua: accumulate `on_stdout` data, split on `\n`, `vim.json.decode` each line.
- **Partial line handling is critical.** Neovim's `on_stdout` callback may deliver partial lines. The Lua side must buffer incoming data and only parse complete `\n`-terminated lines. This is a known pattern documented in Neovim's job_control docs.

**Confidence:** HIGH

### 3. vim.fn.jobstart over vim.system -- For long-running sidecar

**Decision:** Use `vim.fn.jobstart` with callback table, not `vim.system()`.

**Rationale:**

- `vim.system()` (Neovim 0.10+) is designed for one-shot commands that produce output and exit. It collects all stdout into a result object.
- `vim.fn.jobstart` supports streaming `on_stdout` callbacks for persistent bidirectional communication. It returns a channel ID usable with `vim.api.nvim_chan_send()` for writing to stdin.
- This plugin needs a long-running sidecar that stays alive for the entire Neovim session, receiving requests and sending responses continuously.
- `jobstart` is available since Neovim 0.5+ (well within our 0.9+ requirement).

**Confidence:** HIGH

### 4. Reuse TypeScript treesitter parser -- No custom grammar

**Decision:** Register the existing TypeScript treesitter parser for the custom buffer filetype. Do not write a custom tree-sitter grammar.

**Rationale:**

- The type panel displays TypeScript type syntax (interfaces, unions, intersections, generics). The existing TypeScript treesitter parser handles all of this.
- Creating a custom tree-sitter grammar is a significant effort (writing the grammar in JavaScript, compiling the C parser, distributing the `.so`/`.dylib`).
- Register via `vim.treesitter.language.register('typescript', 'tstype')` and provide minimal `queries/tstype/highlights.scm` that extends or copies from TypeScript's queries.
- If the type display format diverges significantly from valid TypeScript syntax, consider falling back to Neovim's extmark-based highlighting (setting highlight groups on specific ranges programmatically). This is simpler than a custom grammar and gives full control.

**Confidence:** MEDIUM -- depends on whether the output format is parseable by the TypeScript grammar. If the tree display uses custom formatting (indentation markers, fold indicators), extmark highlighting may be needed instead. Validate during implementation.

## TypeScript Compiler API -- Core Pattern

The sidecar's type resolution uses this fundamental pattern:

```typescript
import * as ts from 'typescript';

// Create program once, reuse across requests
const program = ts.createProgram(rootFiles, compilerOptions);
const checker = program.getTypeChecker();

// For each request: resolve type at position
function resolveType(fileName: string, position: number) {
  const sourceFile = program.getSourceFile(fileName);
  const node = findNodeAtPosition(sourceFile, position);
  const symbol = checker.getSymbolAtLocation(node);
  const type = checker.getTypeOfSymbolAtLocation(symbol, node);

  // Full, untruncated type string
  const typeString = checker.typeToString(
    type,
    node,
    ts.TypeFormatFlags.NoTruncation
      | ts.TypeFormatFlags.MultilineObjectLiterals
      | ts.TypeFormatFlags.WriteClassExpressionAsTypeLiteral
  );

  // Structured type tree (for collapsible UI)
  const properties = type.getProperties().map(prop => ({
    name: prop.getName(),
    type: checker.typeToString(
      checker.getTypeOfSymbolAtLocation(prop, node),
      node,
      ts.TypeFormatFlags.NoTruncation
    ),
    // Recursively resolve for nested expansion
  }));
}
```

**Key flags:**
- `TypeFormatFlags.NoTruncation` -- the entire reason this plugin exists
- `TypeFormatFlags.MultilineObjectLiterals` -- readable formatting
- `TypeFormatFlags.WriteClassExpressionAsTypeLiteral` -- better display for class types

**Caveats (HIGH confidence, from official GitHub issues):**
- `typeToTypeNode()` can infinite-loop on deeply recursive types (issue #29564). Use `typeToString()` with depth limits instead.
- Large union types (100+ members) can produce very long strings. The sidecar should paginate or truncate at a configurable depth.

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Type resolution | `typescript` npm 5.9.x | tsgo (`@typescript/native-preview`) | Programmatic API unstable, no `TypeChecker` equivalent, IPC overhead for simple queries |
| Type resolution | `typescript` npm 5.9.x | `ts-morph` | Adds abstraction layer we don't need. Direct compiler API is sufficient and avoids the dependency. |
| Type resolution | `typescript` npm 5.9.x | LSP `textDocument/hover` | LSP hover truncates types -- that's the problem we're solving. Would need a custom LSP command, which is more complex than a dedicated sidecar. |
| Communication | Newline-delimited JSON | `neovim` npm (MessagePack-RPC) | Heavy dependency, monkey-patches console, designed for remote plugins not custom sidecars |
| Communication | Newline-delimited JSON | JSON-RPC (`vscode-jsonrpc`) | Overkill for ~3 message types. Adds parsing complexity and dependency. |
| Sidecar lifecycle | `vim.fn.jobstart` | `vim.system()` | `vim.system` designed for one-shot commands, not long-running bidirectional processes |
| Sidecar lifecycle | `vim.fn.jobstart` | Manual `vim.uv.spawn` | Lower-level, more boilerplate, `jobstart` provides the right abstraction |
| Highlighting | Reuse TS treesitter parser | Custom tree-sitter grammar | Months of effort for marginal benefit. TS parser handles type syntax. |
| Highlighting | Reuse TS treesitter parser | Vim syntax highlighting | Treesitter is more accurate and users already have the parser installed |
| Plugin framework | No framework (raw Neovim API) | nui.nvim | Adds dependency for UI components we can build with `nvim_buf_set_lines` and `nvim_open_win`. The type panel is a simple split window, not a complex UI. |

## Installation

```bash
# Sidecar dependencies (in plugin's node/ or sidecar/ directory)
npm install typescript@~5.9

# No other npm dependencies needed -- readline, path, fs are built-in Node.js modules
```

```lua
-- Neovim plugin dependencies (in plugin spec)
-- Only nvim-treesitter for syntax highlighting (most users already have it)
{ 'nvim-treesitter/nvim-treesitter' }
```

## Project Structure

```
nvim-ts-type-explorer/
  lua/
    ts-type-explorer/
      init.lua          -- Plugin entry point, setup(), commands
      sidecar.lua       -- jobstart lifecycle, message send/receive
      panel.lua         -- Split window management, buffer creation
      tree.lua          -- Type tree rendering, fold management
      config.lua        -- User configuration with defaults
  node/
    package.json        -- typescript dependency
    src/
      index.ts          -- Stdin/stdout message loop
      resolver.ts       -- TypeScript compiler API type resolution
      types.ts          -- Shared message type definitions
    tsconfig.json
  queries/
    tstype/
      highlights.scm    -- Treesitter highlight queries for type panel
  plugin/
    ts-type-explorer.lua -- Autocommand/command registration (lazy-loadable)
```

## Sources

- [Neovim Lua Plugin Best Practices](https://github.com/nvim-neorocks/nvim-best-practices) -- plugin structure, lazy loading, LuaCATS
- [Neovim Job Control Docs](https://neovim.io/doc/user/job_control.html) -- jobstart, on_stdout, partial line handling
- [TypeScript Compiler API Wiki](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API) -- createProgram, TypeChecker, typeToString
- [tsgo API Discussion #455](https://github.com/microsoft/typescript-go/discussions/455) -- API instability confirmation, IPC-based design
- [tsgo December 2025 Progress](https://devblogs.microsoft.com/typescript/progress-on-typescript-7-december-2025/) -- TypeScript 7 status
- [nvim-treesitter README](https://github.com/nvim-treesitter/nvim-treesitter) -- parser registration, highlight queries
- [TypeScript typeToTypeNode infinite loop #29564](https://github.com/microsoft/TypeScript/issues/29564) -- recursive type safety
- [Neovim Treesitter Docs](http://neovim.io/doc/user/treesitter/) -- vim.treesitter.language.register, custom filetype setup
- [@typescript/native-preview on npm](https://www.npmjs.com/package/@typescript/native-preview) -- tsgo npm package status
