# Requirements: nvim-ts-type-explorer

**Defined:** 2026-03-09
**Core Value:** Users can see the complete, untruncated type of any TypeScript symbol instantly

## v1 Requirements

### Type Resolution

- [ ] **TRES-01**: User can see the full, untruncated type of any TypeScript symbol
- [ ] **TRES-02**: Object types display expandable property lists with name and type
- [ ] **TRES-03**: Union types display each branch as a collapsible child node
- [ ] **TRES-04**: Intersection types display the merged result (e.g., `{ a: string } & { b: number }` shows as a single object with both properties)
- [ ] **TRES-05**: Function types display parameters (name + type) and return type as children
- [ ] **TRES-06**: Array types unwrap to show element type; tuples show positional elements
- [ ] **TRES-07**: Generic types show resolved type arguments at the usage site
- [ ] **TRES-08**: Optional properties display `?` marker
- [ ] **TRES-09**: Readonly properties display `readonly` marker

### Sidecar

- [ ] **SIDE-01**: Node.js sidecar starts automatically when Neovim loads the plugin
- [ ] **SIDE-02**: Sidecar communicates with Neovim over stdio using newline-delimited JSON
- [ ] **SIDE-03**: Sidecar discovers and uses the project's tsconfig.json
- [ ] **SIDE-04**: Sidecar uses TypeScript LanguageService for incremental type resolution
- [ ] **SIDE-05**: Sidecar self-terminates when stdin closes (no zombie processes)
- [ ] **SIDE-06**: Type resolution has a timeout to prevent hangs on recursive types

### Panel

- [ ] **PANE-01**: User can open a persistent side panel (vertical split) showing the type tree
- [ ] **PANE-02**: Tree nodes are collapsible/expandable with keyboard controls
- [ ] **PANE-03**: Default expand depth is 1 level (root + immediate children)
- [ ] **PANE-04**: Panel updates automatically on cursor move (debounced)
- [ ] **PANE-05**: Panel replaces the entire tree when cursor moves to a new symbol
- [ ] **PANE-06**: User can open/close the panel with a command

## v2 Requirements

### Navigation

- **NAV-01**: User can jump to the definition of a type from a tree node
- **NAV-02**: User can copy the resolved type as a type alias to clipboard

### UI Polish

- **UIPOL-01**: Syntax highlighting via treesitter in the panel buffer
- **UIPOL-02**: Icon indicators for type kinds (object, function, union, etc.)
- **UIPOL-03**: Lock/pin current type to prevent cursor-follow updates
- **UIPOL-04**: Configurable default expand depth

### Advanced Types

- **ADVT-01**: Conditional type resolution showing evaluated result
- **ADVT-02**: JSDoc/documentation display for type members

## Out of Scope

| Feature | Reason |
|---------|--------|
| Non-TypeScript languages | TypeScript-only plugin |
| Type editing/refactoring | Read-only exploration tool |
| Inline virtual text | Existing tools handle this (inlay hints) |
| Floating window mode | Side panel only for v1 |
| History/back navigation | Panel replaces on cursor move — simplicity |
| tsserver plugin approach | Sidecar chosen for independence from LSP server |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TRES-01 | — | Pending |
| TRES-02 | — | Pending |
| TRES-03 | — | Pending |
| TRES-04 | — | Pending |
| TRES-05 | — | Pending |
| TRES-06 | — | Pending |
| TRES-07 | — | Pending |
| TRES-08 | — | Pending |
| TRES-09 | — | Pending |
| SIDE-01 | — | Pending |
| SIDE-02 | — | Pending |
| SIDE-03 | — | Pending |
| SIDE-04 | — | Pending |
| SIDE-05 | — | Pending |
| SIDE-06 | — | Pending |
| PANE-01 | — | Pending |
| PANE-02 | — | Pending |
| PANE-03 | — | Pending |
| PANE-04 | — | Pending |
| PANE-05 | — | Pending |
| PANE-06 | — | Pending |

**Coverage:**
- v1 requirements: 21 total
- Mapped to phases: 0
- Unmapped: 21 ⚠️

---
*Requirements defined: 2026-03-09*
*Last updated: 2026-03-09 after initial definition*
