# Requirements: nvim-ts-type-explorer

**Defined:** 2026-03-09
**Core Value:** Users can see the complete, untruncated type of any TypeScript symbol instantly

## v1 Requirements

### Type Resolution

- [x] **TRES-01**: User can see the full, untruncated type of any TypeScript symbol
- [x] **TRES-02**: Object types display expandable property lists with name and type
- [x] **TRES-03**: Union types display each branch as a collapsible child node
- [x] **TRES-04**: Intersection types display the merged result (e.g., `{ a: string } & { b: number }` shows as a single object with both properties)
- [x] **TRES-05**: Function types display parameters (name + type) and return type as children
- [x] **TRES-06**: Array types unwrap to show element type; tuples show positional elements
- [x] **TRES-07**: Generic types show resolved type arguments at the usage site
- [x] **TRES-08**: Optional properties display `?` marker
- [x] **TRES-09**: Readonly properties display `readonly` marker

### Sidecar

- [x] **SIDE-01**: Node.js sidecar starts automatically when Neovim loads the plugin
- [x] **SIDE-02**: Sidecar communicates with Neovim over stdio using newline-delimited JSON
- [x] **SIDE-03**: Sidecar discovers and uses the project's tsconfig.json
- [x] **SIDE-04**: Sidecar uses TypeScript LanguageService for incremental type resolution
- [x] **SIDE-05**: Sidecar self-terminates when stdin closes (no zombie processes)
- [x] **SIDE-06**: Type resolution has a timeout to prevent hangs on recursive types

### Panel

- [ ] **PANE-01**: User can open a persistent side panel (vertical split) showing the type tree
- [x] **PANE-02**: Tree nodes are collapsible/expandable with keyboard controls
- [x] **PANE-03**: Default expand depth is 1 level (root + immediate children)
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
| SIDE-01 | Phase 1 | Complete |
| SIDE-02 | Phase 1 | Complete |
| SIDE-05 | Phase 1 | Complete |
| SIDE-03 | Phase 2 | Complete |
| SIDE-04 | Phase 2 | Complete |
| SIDE-06 | Phase 2 | Complete |
| TRES-01 | Phase 2 | Complete |
| TRES-02 | Phase 2 | Complete |
| TRES-03 | Phase 2 | Complete |
| TRES-04 | Phase 2 | Complete |
| TRES-05 | Phase 2 | Complete |
| TRES-06 | Phase 2 | Complete |
| TRES-07 | Phase 2 | Complete |
| TRES-08 | Phase 2 | Complete |
| TRES-09 | Phase 2 | Complete |
| PANE-01 | Phase 3 | Pending |
| PANE-02 | Phase 3 | Complete |
| PANE-03 | Phase 3 | Complete |
| PANE-04 | Phase 3 | Pending |
| PANE-05 | Phase 3 | Pending |
| PANE-06 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 21 total
- Mapped to phases: 21
- Unmapped: 0

---
*Requirements defined: 2026-03-09*
*Last updated: 2026-03-09 after roadmap creation*
