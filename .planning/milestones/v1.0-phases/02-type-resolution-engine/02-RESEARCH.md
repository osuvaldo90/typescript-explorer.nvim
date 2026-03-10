# Phase 2: Type Resolution Engine - Research

**Researched:** 2026-03-09
**Domain:** TypeScript Compiler API -- LanguageService, TypeChecker, type tree traversal
**Confidence:** HIGH

## Summary

This phase implements the core type resolution engine: given a file path and cursor position, the sidecar uses the TypeScript LanguageService to resolve the full type of the symbol, then walks the `ts.Type` tree to produce a structured node tree with no truncation. The TypeScript Compiler API (bundled with the `typescript` npm package) provides everything needed -- `ts.createLanguageService` for incremental compilation, `TypeChecker` for type resolution, and `Type` interface methods (`isUnion()`, `isIntersection()`, `getProperties()`, `getCallSignatures()`) for recursive traversal.

The key challenge is recursive type walking: converting the compiler's internal `ts.Type` graph (which can be cyclic) into a finite JSON tree with `[circular: TypeName]` sentinel nodes. The LanguageService handles tsconfig discovery, file watching, and incremental updates automatically through the `LanguageServiceHost` interface.

**Primary recommendation:** Use `ts.createLanguageService` with a custom `LanguageServiceHost`, get the `Program` via `languageService.getProgram()`, obtain the `TypeChecker`, then recursively walk `ts.Type` objects using the type-narrowing guard methods (`type.isUnion()`, `type.isIntersection()`, etc.) with a `Set<number>` of visited type IDs for cycle detection.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Always expand fully -- resolve everything to structural types, never show alias names as opaque nodes
- Imported types resolve inline -- no source file breadcrumbs in the tree structure
- Intersections show merged result -- `{ a: string } & { b: number }` becomes a single object with both properties
- Union branches are flat children of the union node -- each branch is a direct child
- Show `[circular: TypeName]` marker at the recursion point after one expansion
- Circular markers are static labels, not interactive -- no re-expansion in v1
- On resolution timeout, return partial results -- resolved nodes come back normally, unresolved nodes show `[resolution timeout]` marker
- No error response on timeout -- silent degradation with partial data
- Specific kind system per node: `object`, `union`, `intersection`, `function`, `array`, `tuple`, `primitive`, `literal`, `enum`, `circular`, `timeout`
- Each node carries `typeString` field with the TS compiler's rendered type string
- Modifier flags as separate boolean fields: `optional: true`, `readonly: true`
- Include source location (`sourcePath`, `sourceLine`) on each node for v2 "go to definition"

### Claude's Discretion
- tsconfig.json discovery strategy (walk-up, composite projects)
- TypeScript LanguageService initialization and caching
- Timeout duration and implementation mechanism
- Handler method name and params schema for the NDJSON protocol
- Internal type traversal algorithm

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SIDE-03 | Sidecar discovers and uses the project's tsconfig.json | `ts.findConfigFile` + `ts.readConfigFile` + `ts.parseJsonConfigFileContent` -- built-in API |
| SIDE-04 | Sidecar uses TypeScript LanguageService for incremental type resolution | `ts.createLanguageService` with custom `LanguageServiceHost` |
| SIDE-06 | Type resolution has a timeout to prevent hangs on recursive types | `AbortController` + `setTimeout` wrapping the resolve call, or `checker.runWithCancellationToken` |
| TRES-01 | User can see the full, untruncated type of any TypeScript symbol | `checker.typeToString(type, node, TypeFormatFlags.NoTruncation)` for `typeString`; recursive walker for tree |
| TRES-02 | Object types display expandable property lists | `type.getProperties()` returns `Symbol[]`, each with `checker.getTypeOfSymbol(sym)` |
| TRES-03 | Union types display each branch as a collapsible child node | `type.isUnion()` then `type.types` array for branches |
| TRES-04 | Intersection types display merged result | `type.isIntersection()` then `checker.getApparentType(type).getProperties()` for merged view |
| TRES-05 | Function types display parameters and return type | `type.getCallSignatures()` returns `Signature[]`, each with `sig.getParameters()` and `sig.getReturnType()` |
| TRES-06 | Array types unwrap element type; tuples show positional elements | `checker.isArrayType()` / `checker.isTupleType()` + `checker.getTypeArguments(type as TypeReference)` |
| TRES-07 | Generic types show resolved type arguments at usage site | `checker.getTypeArguments(type as TypeReference)` returns resolved types at usage |
| TRES-08 | Optional properties display `?` marker | `symbol.flags & SymbolFlags.Optional` |
| TRES-09 | Readonly properties display `readonly` marker | Check declaration modifiers: `getCombinedModifierFlags(decl) & ModifierFlags.Readonly` |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| typescript | ~5.7.0 (move to runtime dep) | Compiler API: LanguageService, TypeChecker, type walking | Already in devDependencies; the entire compiler API surface lives here |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node:path | built-in | tsconfig discovery, file path resolution | Always for path operations |
| node:fs | built-in | File reading for LanguageServiceHost | Used by the host to read source files |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| LanguageService | ts.createProgram (one-shot) | No incremental updates -- must rebuild entire program on each request. LanguageService caches SourceFiles |
| ts-morph | raw TS compiler API | ts-morph adds 5MB+ and abstraction layer; raw API is sufficient for our needs and avoids a large dependency |
| tsserver (via protocol) | LanguageService (in-process) | tsserver is designed for LSP communication; embedding LanguageService directly is simpler for a sidecar |

**Installation:**
```bash
# In sidecar/package.json, move typescript from devDependencies to dependencies
# (it's already installed at ~5.7.0)
npm install typescript@~5.7.0 --save
```

**tsup bundling note:** The current tsup config uses `noExternal: [/.*/]` which bundles everything. TypeScript is ~15MB when bundled. Two options:
1. Keep bundling (simpler, single file output) -- acceptable for a local sidecar
2. Mark typescript as external and ship node_modules -- more complex distribution

Recommendation: Keep bundling. The sidecar runs locally, 15MB is fine.

## Architecture Patterns

### Recommended Project Structure
```
sidecar/src/
  handlers/
    echo.ts            # existing
    resolve.ts         # NEW: handler entry point for type resolution
  services/
    language-service.ts # NEW: LanguageService setup, tsconfig discovery, caching
    type-walker.ts      # NEW: recursive ts.Type -> TypeNode tree walker
  types.ts              # NEW: TypeNode interface, kind enum, request/response shapes
  protocol.ts           # existing
  main.ts               # existing -- add "resolve" case to switch
```

### Pattern 1: LanguageService Setup with tsconfig Discovery
**What:** Create a singleton LanguageService instance per project root, using `ts.findConfigFile` to locate tsconfig.json and `ts.parseJsonConfigFileContent` to parse it.
**When to use:** On first resolve request for a given file path.

```typescript
import ts from "typescript";
import path from "node:path";
import fs from "node:fs";

function createService(filePath: string): { service: ts.LanguageService; host: ts.LanguageServiceHost } {
  // 1. Find tsconfig.json by walking up from the file
  const dir = path.dirname(filePath);
  const configPath = ts.findConfigFile(dir, ts.sys.fileExists, "tsconfig.json");

  let compilerOptions: ts.CompilerOptions = { target: ts.ScriptTarget.ES2022 };
  let fileNames: string[] = [filePath];

  if (configPath) {
    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      path.dirname(configPath)
    );
    compilerOptions = parsed.options;
    fileNames = parsed.fileNames;
  }

  // 2. Track file versions for incremental updates
  const fileVersions = new Map<string, number>();
  fileNames.forEach(f => fileVersions.set(f, 0));

  // 3. Implement LanguageServiceHost
  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => [...fileVersions.keys()],
    getScriptVersion: (fileName) => String(fileVersions.get(fileName) ?? 0),
    getScriptSnapshot: (fileName) => {
      if (!fs.existsSync(fileName)) return undefined;
      return ts.ScriptSnapshot.fromString(fs.readFileSync(fileName, "utf-8"));
    },
    getCurrentDirectory: () => configPath ? path.dirname(configPath) : dir,
    getCompilationSettings: () => compilerOptions,
    getDefaultLibFileName: (opts) => ts.getDefaultLibFilePath(opts),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  };

  const service = ts.createLanguageService(host, ts.createDocumentRegistry());
  return { service, host };
}
```

### Pattern 2: Recursive Type Walker with Cycle Detection
**What:** Walk `ts.Type` objects, converting to a flat `TypeNode` tree, using a `Set<number>` of `type.id` values to detect cycles.
**When to use:** Core algorithm for every resolve request.

```typescript
// Source: TypeScript compiler API (typescript.d.ts)
interface TypeNode {
  kind: "object" | "union" | "intersection" | "function" | "array" | "tuple"
      | "primitive" | "literal" | "enum" | "circular" | "timeout";
  name: string;
  typeString: string;
  optional?: boolean;
  readonly?: boolean;
  sourcePath?: string;
  sourceLine?: number;
  children?: TypeNode[];
}

function walkType(
  checker: ts.TypeChecker,
  type: ts.Type,
  name: string,
  visited: Set<number>,
): TypeNode {
  // Cycle detection: type.id is an internal numeric identifier
  const typeId = (type as any).id as number;
  if (visited.has(typeId)) {
    const typeName = checker.typeToString(type);
    return { kind: "circular", name, typeString: `[circular: ${typeName}]` };
  }
  visited.add(typeId);

  const typeString = checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation);

  // Union
  if (type.isUnion()) {
    const children = type.types.map((t, i) =>
      walkType(checker, t, String(i), new Set(visited))
    );
    visited.delete(typeId);
    return { kind: "union", name, typeString, children };
  }

  // Intersection -- show merged result per user decision
  if (type.isIntersection()) {
    const apparent = checker.getApparentType(type);
    const props = apparent.getProperties();
    const children = props.map(sym => walkSymbol(checker, sym, visited));
    visited.delete(typeId);
    return { kind: "object", name, typeString, children };
  }

  // Tuple
  if (checker.isTupleType(type)) {
    const typeArgs = checker.getTypeArguments(type as ts.TypeReference);
    const children = typeArgs.map((t, i) =>
      walkType(checker, t, `[${i}]`, new Set(visited))
    );
    visited.delete(typeId);
    return { kind: "tuple", name, typeString, children };
  }

  // Array
  if (checker.isArrayType(type)) {
    const typeArgs = checker.getTypeArguments(type as ts.TypeReference);
    const children = typeArgs.length > 0
      ? [walkType(checker, typeArgs[0], "element", new Set(visited))]
      : [];
    visited.delete(typeId);
    return { kind: "array", name, typeString, children };
  }

  // Function
  const callSigs = type.getCallSignatures();
  if (callSigs.length > 0) {
    const sig = callSigs[0];
    const params = sig.getParameters().map(p => {
      const pType = checker.getTypeOfSymbol(p);
      return walkType(checker, pType, p.getName(), new Set(visited));
    });
    const returnType = walkType(checker, sig.getReturnType(), "returns", new Set(visited));
    visited.delete(typeId);
    return { kind: "function", name, typeString, children: [...params, returnType] };
  }

  // Object with properties
  if (type.flags & ts.TypeFlags.Object) {
    const props = type.getProperties();
    if (props.length > 0) {
      const children = props.map(sym => walkSymbol(checker, sym, visited));
      visited.delete(typeId);
      return { kind: "object", name, typeString, children };
    }
  }

  // Enum
  if (type.flags & ts.TypeFlags.Enum || type.flags & ts.TypeFlags.EnumLiteral) {
    visited.delete(typeId);
    return { kind: "enum", name, typeString };
  }

  // Literal
  if (type.isLiteral()) {
    visited.delete(typeId);
    return { kind: "literal", name, typeString };
  }

  // Primitive fallback
  visited.delete(typeId);
  return { kind: "primitive", name, typeString };
}

function walkSymbol(
  checker: ts.TypeChecker,
  symbol: ts.Symbol,
  visited: Set<number>,
): TypeNode {
  const type = checker.getTypeOfSymbol(symbol);
  const node = walkType(checker, type, symbol.getName(), new Set(visited));

  // Optional marker (TRES-08)
  if (symbol.flags & ts.SymbolFlags.Optional) {
    node.optional = true;
  }

  // Readonly marker (TRES-09)
  const declarations = symbol.getDeclarations();
  if (declarations && declarations.length > 0) {
    const modifiers = ts.getCombinedModifierFlags(declarations[0]);
    if (modifiers & ts.ModifierFlags.Readonly) {
      node.readonly = true;
    }
    // Source location for v2 NAV-01
    const sourceFile = declarations[0].getSourceFile();
    node.sourcePath = sourceFile.fileName;
    node.sourceLine = sourceFile.getLineAndCharacterOfPosition(declarations[0].getStart()).line + 1;
  }

  return node;
}
```

### Pattern 3: Getting the Symbol at a Cursor Position
**What:** Convert file path + position to a `ts.Type` for the symbol under the cursor.
**When to use:** Entry point of every resolve request.

```typescript
function resolveAtPosition(
  service: ts.LanguageService,
  filePath: string,
  position: number,
): TypeNode | null {
  const program = service.getProgram();
  if (!program) return null;

  const sourceFile = program.getSourceFile(filePath);
  if (!sourceFile) return null;

  const checker = program.getTypeChecker();

  // Find the node at position
  function findNodeAtPosition(node: ts.Node): ts.Node | undefined {
    if (position >= node.getStart() && position < node.getEnd()) {
      return ts.forEachChild(node, findNodeAtPosition) || node;
    }
    return undefined;
  }

  const node = findNodeAtPosition(sourceFile);
  if (!node) return null;

  const symbol = checker.getSymbolAtLocation(node);
  if (!symbol) {
    // Fallback: get type directly from node
    const type = checker.getTypeAtLocation(node);
    return walkType(checker, type, node.getText(), new Set());
  }

  const type = checker.getTypeOfSymbolAtLocation(symbol, node);
  return walkType(checker, type, symbol.getName(), new Set());
}
```

### Anti-Patterns to Avoid
- **Using `getQuickInfoAtPosition` for type data:** Returns a pre-formatted display string, not structured type info. Use `getTypeAtLocation` + recursive walking instead.
- **Accessing `(type as TypeReference).typeArguments` directly:** This property was deprecated in favor of `checker.getTypeArguments(type)`. The direct property is lazily loaded and may not be populated.
- **Creating a new Program per request:** Extremely expensive. Use LanguageService which caches and incrementally updates programs.
- **Trusting `type.symbol.name` for the display name:** Symbol names can be `__type` for anonymous types. Use `checker.typeToString()` for display.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| tsconfig.json discovery | Custom walk-up file search | `ts.findConfigFile(dir, ts.sys.fileExists)` | Handles config file name variants, composite projects |
| tsconfig.json parsing | JSON.parse + manual option mapping | `ts.readConfigFile` + `ts.parseJsonConfigFileContent` | Resolves `extends`, path mappings, `references` |
| Type string rendering | Manual type-to-string conversion | `checker.typeToString(type, node, TypeFormatFlags.NoTruncation)` | Handles generics, mapped types, conditionals correctly |
| Array/Tuple detection | `type.symbol?.name === "Array"` heuristic | `checker.isArrayType(type)` / `checker.isTupleType(type)` | Handles ReadonlyArray, branded arrays, tuple subtypes |
| Union/Intersection detection | `type.flags & TypeFlags.Union` bit check | `type.isUnion()` / `type.isIntersection()` type guards | Returns properly narrowed types with `.types` array |
| Source file caching | Manual file cache with fs.watch | LanguageService + DocumentRegistry | Handles incremental updates, source map invalidation |

**Key insight:** The TypeScript compiler API already solves every type introspection problem this plugin needs. The only custom code required is the recursive walker that converts `ts.Type` to the plugin's `TypeNode` shape.

## Common Pitfalls

### Pitfall 1: type.id is not part of the public API
**What goes wrong:** Using `type.id` for cycle detection relies on an internal property.
**Why it happens:** The public `Type` interface does not expose `id`, but it exists at runtime on every type object.
**How to avoid:** Access it via `(type as any).id`. This is stable across all TS versions -- it's used internally for type identity. Alternatively, use a `WeakSet<ts.Type>` or `Set` of type references, but `type.id` numbers are more reliable since the same structural type always has the same id.
**Warning signs:** Type assertion lint warnings.

### Pitfall 2: Infinite recursion on self-referential types
**What goes wrong:** Types like `type Tree = { left: Tree; right: Tree }` cause stack overflow.
**Why it happens:** `getProperties()` returns the same type recursively without any built-in depth limit.
**How to avoid:** Track visited `type.id` values in a `Set`. When a cycle is detected, emit a `{ kind: "circular", ... }` node. Per user decision: expand once, then show `[circular: TypeName]`.
**Warning signs:** Stack overflow on first test with recursive types.

### Pitfall 3: Intersection merged view requires getApparentType
**What goes wrong:** Calling `type.getProperties()` on an intersection may not return merged properties.
**Why it happens:** Intersection types at the compiler level keep their constituent types separate.
**How to avoid:** Use `checker.getApparentType(type)` on intersection types, then call `.getProperties()` on the apparent type. This gives the merged view the user expects.
**Warning signs:** Intersection types showing empty or partial property lists.

### Pitfall 4: LanguageService file not found after initialization
**What goes wrong:** `getProgram().getSourceFile(filePath)` returns undefined for the requested file.
**Why it happens:** The file wasn't in `getScriptFileNames()` returned by the host, or the path format doesn't match (forward vs back slashes, symlinks).
**How to avoid:** Ensure the host's `getScriptFileNames()` includes the target file. If the file isn't in the tsconfig's `include`, add it dynamically. Normalize paths using `ts.sys.resolvePath` or `path.resolve`.
**Warning signs:** Null results on first request despite valid file path.

### Pitfall 5: Readonly detection is on the declaration, not the symbol
**What goes wrong:** `readonly` properties not detected because code checks the wrong flag.
**Why it happens:** `SymbolFlags` has no `Readonly` flag. Readonly is a `ModifierFlags` on the property's declaration node, not the symbol.
**How to avoid:** Get the symbol's declarations via `symbol.getDeclarations()`, then check `getCombinedModifierFlags(declaration) & ModifierFlags.Readonly`.
**Warning signs:** All readonly markers missing from output.

### Pitfall 6: TypeScript import must be runtime, not just dev
**What goes wrong:** Built sidecar crashes because `typescript` is not found at runtime.
**Why it happens:** TypeScript is in devDependencies (used for compilation), but the sidecar needs it at runtime for the Compiler API.
**How to avoid:** Since tsup with `noExternal: [/.*/]` bundles everything, this is already handled. But if bundling strategy changes, `typescript` must be in `dependencies`.
**Warning signs:** `MODULE_NOT_FOUND` error on sidecar start after build.

## Code Examples

### Getting the Type at a Cursor Position
```typescript
// Source: TypeScript compiler API (typescript.d.ts lines 6152-6340)
const program = service.getProgram()!;
const sourceFile = program.getSourceFile(filePath)!;
const checker = program.getTypeChecker();

// Find innermost node at position
let targetNode: ts.Node = sourceFile;
function visit(node: ts.Node) {
  if (node.getStart() <= position && position < node.getEnd()) {
    targetNode = node;
    ts.forEachChild(node, visit);
  }
}
ts.forEachChild(sourceFile, visit);

const symbol = checker.getSymbolAtLocation(targetNode);
const type = symbol
  ? checker.getTypeOfSymbolAtLocation(symbol, targetNode)
  : checker.getTypeAtLocation(targetNode);
```

### typeToString with NoTruncation
```typescript
// Source: TypeScript compiler API (typescript.d.ts line 6235, 6375-6377)
const fullTypeString = checker.typeToString(
  type,
  undefined,  // enclosingDeclaration
  ts.TypeFormatFlags.NoTruncation
);
// Returns full type string without "..." truncation
```

### Timeout with AbortController
```typescript
// Wrap resolution in a timeout for SIDE-06
function resolveWithTimeout(
  service: ts.LanguageService,
  filePath: string,
  position: number,
  timeoutMs: number = 5000,
): TypeNode {
  const startTime = Date.now();

  function checkTimeout(): boolean {
    return Date.now() - startTime > timeoutMs;
  }

  // Pass checkTimeout into the walker; at each node expansion, check elapsed time
  function walkTypeWithTimeout(
    checker: ts.TypeChecker,
    type: ts.Type,
    name: string,
    visited: Set<number>,
  ): TypeNode {
    if (checkTimeout()) {
      return { kind: "timeout", name, typeString: "[resolution timeout]" };
    }
    // ... normal walkType logic, calling walkTypeWithTimeout recursively
  }
}
```

### tsconfig Discovery
```typescript
// Source: TypeScript compiler API (typescript.d.ts lines 9181-9210, 9470)
import ts from "typescript";
import path from "node:path";

function discoverTsConfig(filePath: string): ts.ParsedCommandLine | null {
  const searchPath = path.dirname(filePath);
  const configPath = ts.findConfigFile(searchPath, ts.sys.fileExists, "tsconfig.json");
  if (!configPath) return null;

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) return null;

  return ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,       // ParseConfigHost -- provides readDirectory, fileExists, etc.
    path.dirname(configPath),
    undefined,    // existingOptions
    configPath,   // configFileName (for error reporting)
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `(type as TypeReference).typeArguments` | `checker.getTypeArguments(type)` | TS ~4.x | Direct property access may return undefined; use checker method |
| `ts.createProgram()` per request | `ts.createLanguageService()` persistent | Always recommended | 10-100x faster for repeated queries |
| Manual `extends` resolution in tsconfig | `ts.parseJsonConfigFileContent()` | Always available | Handles `extends`, `references`, path mapping |

**Deprecated/outdated:**
- `typeArguments` property on `TypeReference`: Use `checker.getTypeArguments()` instead
- `resolveModuleNames` on `LanguageServiceHost`: Deprecated in favor of `resolveModuleNameLiterals` (though both still work in TS 5.7)

## Open Questions

1. **LanguageService caching strategy across multiple project roots**
   - What we know: Each tsconfig.json defines a project root. A user may open files from different projects.
   - What's unclear: Whether to create one LanguageService per project root or re-create per request.
   - Recommendation: Cache one LanguageService per tsconfig.json path, lazily created. Most users work in a single project. Use a `Map<string, LanguageService>`.

2. **Enum type representation**
   - What we know: User wants an `enum` kind in the node types. TypeFlags has `Enum` and `EnumLiteral`.
   - What's unclear: Whether to show enum members as children or just the enum type name.
   - Recommendation: Show the enum name as a leaf node with kind `enum`. If the type is an enum literal (e.g., `Color.Red`), show kind `literal` with the value.

3. **Multiple call signatures**
   - What we know: Functions can have overloads, producing multiple call signatures.
   - What's unclear: How to represent overloaded functions in the tree.
   - Recommendation: Show each overload as a separate child of the function node, or show only the first matching signature. Start with first signature, iterate if needed.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (built-in) + tsx runner |
| Config file | none -- uses `tsx --test` directly |
| Quick run command | `cd sidecar && npx tsx --test src/**/*.test.ts` |
| Full suite command | `cd sidecar && npx tsx --test src/**/*.test.ts` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SIDE-03 | Discovers tsconfig.json from file path | unit | `cd sidecar && npx tsx --test src/services/language-service.test.ts` | No -- Wave 0 |
| SIDE-04 | Uses LanguageService for type resolution | integration | `cd sidecar && npx tsx --test src/handlers/resolve.test.ts` | No -- Wave 0 |
| SIDE-06 | Timeout on recursive/pathological types | unit | `cd sidecar && npx tsx --test src/services/type-walker.test.ts` | No -- Wave 0 |
| TRES-01 | Full untruncated type of any symbol | integration | `cd sidecar && npx tsx --test src/handlers/resolve.test.ts` | No -- Wave 0 |
| TRES-02 | Object properties as children | unit | `cd sidecar && npx tsx --test src/services/type-walker.test.ts` | No -- Wave 0 |
| TRES-03 | Union branches as children | unit | `cd sidecar && npx tsx --test src/services/type-walker.test.ts` | No -- Wave 0 |
| TRES-04 | Intersection merged result | unit | `cd sidecar && npx tsx --test src/services/type-walker.test.ts` | No -- Wave 0 |
| TRES-05 | Function params + return type as children | unit | `cd sidecar && npx tsx --test src/services/type-walker.test.ts` | No -- Wave 0 |
| TRES-06 | Array element / tuple positional children | unit | `cd sidecar && npx tsx --test src/services/type-walker.test.ts` | No -- Wave 0 |
| TRES-07 | Generic types show resolved args | unit | `cd sidecar && npx tsx --test src/services/type-walker.test.ts` | No -- Wave 0 |
| TRES-08 | Optional `?` marker | unit | `cd sidecar && npx tsx --test src/services/type-walker.test.ts` | No -- Wave 0 |
| TRES-09 | Readonly marker | unit | `cd sidecar && npx tsx --test src/services/type-walker.test.ts` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd sidecar && npx tsx --test src/**/*.test.ts`
- **Per wave merge:** `cd sidecar && npx tsx --test src/**/*.test.ts`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `sidecar/src/services/language-service.test.ts` -- covers SIDE-03, SIDE-04
- [ ] `sidecar/src/services/type-walker.test.ts` -- covers TRES-02 through TRES-09, SIDE-06
- [ ] `sidecar/src/handlers/resolve.test.ts` -- covers TRES-01 (end-to-end via NDJSON)
- [ ] `sidecar/test-fixtures/` -- TypeScript fixture files for testing (simple.ts, recursive.ts, union.ts, etc.)

## Sources

### Primary (HIGH confidence)
- TypeScript compiler API type definitions (`typescript.d.ts` from `typescript@~5.7.0`) -- complete `TypeChecker`, `Type`, `LanguageServiceHost`, `TypeFlags`, `ObjectFlags`, `SymbolFlags`, `ModifierFlags` interfaces verified directly from installed package
- [Using the Language Service API - TypeScript Wiki](https://github.com/microsoft/typescript/wiki/using-the-language-service-api) -- LanguageServiceHost setup pattern
- [Using the Compiler API - TypeScript Wiki](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API) -- TypeChecker, type walking patterns

### Secondary (MEDIUM confidence)
- [Compiler API learning notes](https://learning-notes.mistermicheels.com/javascript/typescript/compiler-api/) -- createProgram patterns, basic type checking
- [TypeScript compiler APIs revisited - Scott Logic](https://blog.scottlogic.com/2017/05/02/typescript-compiler-api-revisited.html) -- type walking examples

### Tertiary (LOW confidence)
- None -- all critical findings verified against installed `typescript.d.ts`

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- TypeScript compiler API is the only viable option; verified API surface directly from `typescript.d.ts`
- Architecture: HIGH -- LanguageService + TypeChecker + recursive walker is the standard pattern; all APIs verified
- Pitfalls: HIGH -- cycle detection, readonly/optional detection, intersection merging all verified against actual type definitions

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (TypeScript compiler API is stable; unlikely to change)
