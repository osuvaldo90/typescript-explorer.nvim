# Feature Landscape

**Domain:** Neovim TypeScript type explorer/inspector plugin
**Researched:** 2026-03-09

## Table Stakes

Features users expect. Missing = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Full untruncated type display | This is the entire reason the plugin exists. Standard LSP hover truncates types. TypeScript 5.9 improved this with expandable hovers, but Neovim LSP clients don't yet expose the expand/collapse UI. | Medium | Use `ts.TypeFormatFlags.NoTruncation` in sidecar. This is the core value prop. |
| Collapsible tree view of type members | Both ts-type-explorer (VS Code) and ts-type-expand show types as expandable trees. Users expect to drill into nested types without seeing the entire structure at once. | High | Must handle: object properties, union branches, intersection members, tuple elements, function signatures. |
| Automatic update on cursor move | ts-type-explorer (VS Code) updates the tree view when you click/select text. Users expect the panel to reflect the symbol under cursor without manual action. | Medium | Debounce required (200-300ms). Replace entire tree on each update. |
| Side panel rendering | A persistent panel (not a floating window) is expected for exploration workflows. Every comparable VS Code extension uses a dedicated panel/view. | Medium | Use a scratch buffer in a vertical split. Treesitter highlighting for TypeScript syntax. |
| Object property expansion | ts-type-expand lists this as a core expandable category. Every type explorer supports drilling into object properties. | Medium | Show property name, type, optional marker, readonly marker. |
| Union and intersection display | Union (`A \| B`) and intersection (`A & B`) types must be expandable to show individual branches/members. ts-type-expand supports "union type candidates" as expandable nodes. | Medium | Each branch should be a collapsible child node in the tree. |
| Function signature display | Function types must show parameters and return type. ts-type-expand supports "function/method arguments and return values" as expandable categories. | Medium | Show parameter names, types, and return type as child nodes. |
| Array/tuple element types | ts-type-expand directly shows `T` from `Array<T>`. Users expect to see what's inside container types. | Low | Unwrap `Array<T>` to show `T` directly. Tuples show positional elements. |
| Syntax highlighting | Type information should be syntax-highlighted, not plain text. This is expected in any code-adjacent UI in Neovim. | Low | Apply treesitter TypeScript highlighting to the buffer content. |

## Differentiators

Features that set the product apart. Not expected, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Go-to-definition from tree nodes | ts-type-explorer (VS Code) supports navigating to the definition of any type in the tree. No Neovim plugin does this. Pressing enter on a tree node jumps to where that type/property is defined. | Medium | Requires the sidecar to track source positions for each type node. TypeScript compiler API exposes declaration source locations. |
| Copy type as alias | ts-type-expand has an experimental "copy type information" button that lets users extract expanded types as reusable type aliases. Extremely useful when you need to materialize an inferred type. | Low | Serialize the resolved type to a `type Foo = { ... }` string and copy to clipboard/register. |
| Configurable default expand depth | Let users control how many levels deep the tree expands by default (0 = collapsed, 1 = root + immediate children, N = deeper). PROJECT.md specifies default of 1. | Low | Simple config option. Default to 1. Power users may want 2-3 for deeply nested types. |
| Readonly/optional markers | ts-type-explorer supports displaying "readonly" markers on properties and arrays. ts-type-expand supports compact optional notation (`T?`). These visual cues save users from misunderstanding mutability/optionality. | Low | Show `?` for optional, `readonly` prefix for readonly. Configurable display. |
| Generic type parameter display | Show resolved generic instantiations clearly. When you have `Map<string, User[]>`, show what `K` and `V` resolve to. ts-type-explorer lists generics as a supported type. | Medium | Must resolve generic type arguments at the usage site, not just show the generic definition. |
| Conditional type resolution | Show what conditional types (`T extends U ? X : Y`) resolve to in context. ts-type-explorer supports conditional types and `infer`. | High | Requires evaluating conditional types with the actual type arguments. Complex for nested conditionals. |
| Lock/pin current type | ts-type-explorer supports "selection lock" to prevent the displayed type from changing during editor navigation. Useful when you want to study a type while browsing other code. | Low | Toggle that pauses cursor-follow behavior. Simple state flag. |
| JSDoc/documentation on hover | ts-type-explorer shows JSDoc when hovering over tree items. Contextual documentation without leaving the type tree. | Medium | Requires extracting JSDoc comments from declarations via the TypeScript compiler API. Display in a floating window on hover/keypress. |
| Icon indicators for type kinds | ts-type-explorer uses icons and coloring to distinguish type kinds (object, function, enum, class, etc.). Visual scanning becomes much faster. | Low | Use Nerd Font icons or Unicode symbols. Map: object, function, enum, class, interface, primitive, literal, union, intersection. |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Type editing/refactoring | Out of scope per PROJECT.md. This is a read-only exploration tool. Refactoring is handled by LSP code actions and dedicated plugins like typescript-tools.nvim. | Focus on read-only inspection. Provide "copy type" for the one write-adjacent use case. |
| Inline virtual text / inlay hints | Already solved by ts-inlay-hints and built-in Neovim LSP inlay hints (Neovim 0.10+). Duplicating this creates confusion. | Point users to existing inlay hint solutions. Our value is the side panel deep exploration. |
| Floating window mode | PROJECT.md explicitly scopes to side panel only for v1. Floating windows are ephemeral and conflict with the "persistent exploration" UX. | Side panel only. Floating windows can be considered post-v1 if users request. |
| History/back navigation | PROJECT.md rules this out. Adds state management complexity for marginal benefit. The panel replaces on cursor move. | Replace tree entirely on cursor move. Keep it simple. |
| Multi-language support | TypeScript-only per PROJECT.md. Attempting to generalize the sidecar for other languages would dilute focus and explode complexity. | Hardcode TypeScript. If the architecture is clean, other languages could be added by others later. |
| Diagnostics/error display | tsc.nvim and built-in LSP diagnostics handle this. Type exploration and error reporting are different concerns. | Stay focused on type structure visualization. |
| Import management | typescript-tools.nvim handles organize/add/remove imports. Not related to type exploration. | Do not touch imports. |
| Compete with LSP hover | TypeScript 5.9 added expandable hovers to the standard LSP hover. Our tool complements hover (deep persistent exploration) rather than replacing it (quick glance). | Position as "the deep dive tool" not "a better hover." |

## Feature Dependencies

```
Sidecar communication (stdio JSON) --> All type resolution features
  |
  +--> Full type resolution (NoTruncation) --> Tree view rendering
  |                                              |
  |                                              +--> Collapsible nodes
  |                                              |     |
  |                                              |     +--> Object property expansion
  |                                              |     +--> Union/intersection branches
  |                                              |     +--> Function signature params
  |                                              |     +--> Array/tuple elements
  |                                              |
  |                                              +--> Syntax highlighting (treesitter)
  |                                              +--> Icon indicators
  |                                              +--> Readonly/optional markers
  |
  +--> Cursor-follow updates (debounced) --> Lock/pin toggle
  |
  +--> Source position tracking --> Go-to-definition from tree
  |
  +--> Type serialization --> Copy type as alias
  |
  +--> JSDoc extraction --> Documentation on hover
  |
  +--> Generic resolution --> Conditional type resolution
```

## MVP Recommendation

Prioritize:
1. **Sidecar with full type resolution** - Without this, nothing works. The NoTruncation flag is the core technical differentiator over LSP hover.
2. **Side panel with collapsible tree view** - The primary UI. Object properties, unions, intersections, functions, arrays as expandable nodes.
3. **Cursor-follow with debounce** - Automatic updates make the tool feel alive. Without this, users must manually trigger updates.
4. **Syntax highlighting** - Low effort, high polish. Treesitter TypeScript highlighting on the buffer.
5. **Go-to-definition from tree nodes** - First differentiator to implement. This is the feature that makes users choose this over just reading hover output.

Defer:
- **Conditional type resolution**: High complexity, niche use case. Implement after core tree is solid.
- **JSDoc on hover**: Medium effort for a nice-to-have. Add after core interaction patterns are stable.
- **Copy type as alias**: Low complexity but not needed for v1 launch. Easy to add in a follow-up.
- **Lock/pin current type**: Trivial to implement but needs the core cursor-follow working first.
- **Icon indicators**: Polish feature. Plain text with indentation works fine initially.

## Competitive Landscape Summary

| Tool | Platform | Approach | Key Limitation |
|------|----------|----------|----------------|
| ts-type-explorer (mxsdev) | VS Code | Side panel tree view, go-to-definition, JSDoc | VS Code only. No Neovim equivalent exists. |
| ts-type-expand (d-kimuson) | VS Code | Tree view with expandable categories | VS Code only. Limited TypeScript version support (up to 5.4). |
| better-type-hover | Neovim | Floating windows with letter-hint navigation | Floating windows only, not a persistent panel. Letter-hint UX is non-standard. |
| prettify-ts | VS Code | Prettified hover tooltips | Still a hover tooltip, not deep exploration. |
| TypeScript 5.9 expandable hovers | VS Code (built-in) | +/- buttons on hover to expand types | Neovim LSP doesn't expose this UI. Still ephemeral hover, not persistent. |
| typescript-tools.nvim | Neovim | Full LSP replacement via tsserver protocol | Provides standard hover, not deep type exploration. Different tool category. |

**The gap:** No Neovim plugin provides a persistent side panel with a collapsible type tree. ts-type-explorer (VS Code) is the closest analogue, and it has no Neovim counterpart. This is the opportunity.

## Sources

- [ts-type-explorer (mxsdev)](https://github.com/mxsdev/ts-type-explorer) - VS Code extension with tree view, go-to-definition, JSDoc
- [ts-type-expand (d-kimuson)](https://github.com/d-kimuson/ts-type-expand) - VS Code extension with expandable type categories
- [better-type-hover](https://github.com/Sebastian-Nielsen/better-type-hover) - Neovim floating window type hover
- [typescript-tools.nvim](https://github.com/pmizio/typescript-tools.nvim) - Neovim TypeScript LSP integration
- [TypeScript Explorer VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=mxsdev.typescript-explorer) - Feature details
- [TypeScript 5.9 Expandable Hovers](https://devblogs.microsoft.com/typescript/announcing-typescript-5-9/) - Built-in hover expansion
- [Prettify TypeScript](https://marketplace.visualstudio.com/items?itemName=MylesMurphy.prettify-ts) - Hover prettification
- [VS Code issue #76480](https://github.com/microsoft/vscode/issues/76480) - Full type hover request (long-standing demand)
- [TypeScript issue #35601](https://github.com/microsoft/TypeScript/issues/35601) - Full type hover popup request
- [neo-tree.nvim](https://github.com/nvim-neo-tree/neo-tree.nvim) - Tree view UI patterns for Neovim
