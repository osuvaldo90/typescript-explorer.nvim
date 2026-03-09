import ts from "typescript";
import { getLanguageService } from "./language-service.js";
import type { TypeNode, ResolveResult } from "../types.js";

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Entry point: resolve the type at a given file position into a TypeNode tree.
 */
export function resolveAtPosition(
  filePath: string,
  position: number,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): ResolveResult {
  const service = getLanguageService(filePath);
  const program = service.getProgram();
  if (!program) return { node: null };

  const sourceFile = program.getSourceFile(filePath);
  if (!sourceFile) return { node: null };

  const checker = program.getTypeChecker();

  // Find the innermost token at position
  const node = findTokenAtPosition(sourceFile, position);
  if (!node) return { node: null };

  // Get symbol at the node
  const symbol = checker.getSymbolAtLocation(node);
  if (!symbol) return { node: null };

  // For type aliases (e.g., `type Status = ...`), getTypeOfSymbol returns `any`.
  // Use getDeclaredTypeOfSymbol for type alias symbols, getTypeOfSymbol for value symbols.
  const isTypeAlias = !!(symbol.flags & ts.SymbolFlags.TypeAlias);
  const type = isTypeAlias
    ? checker.getDeclaredTypeOfSymbol(symbol)
    : checker.getTypeOfSymbol(symbol);
  const name = symbol.getName();

  const visited = new Set<number>();
  const startTime = Date.now();

  const typeNode = walkType(checker, type, name, visited, startTime, timeoutMs);
  return { node: typeNode };
}

/**
 * Find the innermost token at a given position in the source file.
 */
function findTokenAtPosition(
  sourceFile: ts.SourceFile,
  position: number,
): ts.Node | undefined {
  function find(node: ts.Node): ts.Node | undefined {
    if (position < node.getStart(sourceFile) || position >= node.getEnd()) {
      return undefined;
    }
    // Try children first (depth-first, innermost wins)
    const childResult = ts.forEachChild(node, find);
    if (childResult) return childResult;
    // This node contains the position and has no child that does
    return node;
  }
  return find(sourceFile);
}

/**
 * Recursively walk a ts.Type and convert it to a TypeNode tree.
 */
export function walkType(
  checker: ts.TypeChecker,
  type: ts.Type,
  name: string,
  visited: Set<number>,
  startTime: number,
  timeoutMs: number,
): TypeNode {
  // Check timeout
  if (Date.now() - startTime > timeoutMs) {
    return { kind: "timeout", name, typeString: "[resolution timeout]" };
  }

  const typeId = (type as any).id as number | undefined;

  // Check cycle
  if (typeId !== undefined && visited.has(typeId)) {
    const typeName = checker.typeToString(type);
    return { kind: "circular", name, typeString: `[circular: ${typeName}]` };
  }

  if (typeId !== undefined) {
    visited.add(typeId);
  }

  const typeString = checker.typeToString(
    type,
    undefined,
    ts.TypeFormatFlags.NoTruncation,
  );

  let result: TypeNode;

  // Order matters for correct classification
  if (type.isUnion()) {
    // Union type -- each branch is a direct child
    const children = type.types.map((branch, i) => {
      const branchName = checker.typeToString(branch);
      return walkType(checker, branch, branchName, new Set(visited), startTime, timeoutMs);
    });
    result = { kind: "union", name, typeString, children };
  } else if (type.isIntersection()) {
    // Intersection type -- use apparent type for merged view
    const apparent = checker.getApparentType(type);
    const properties = apparent.getProperties();
    const children = properties.map((prop) =>
      walkSymbol(checker, prop, visited, startTime, timeoutMs),
    );
    result = { kind: "object", name, typeString, children };
  } else if (checker.isTupleType(type)) {
    // Tuple type
    const typeArgs = checker.getTypeArguments(type as ts.TypeReference);
    const children = typeArgs.map((arg, i) =>
      walkType(checker, arg, `[${i}]`, new Set(visited), startTime, timeoutMs),
    );
    result = { kind: "tuple", name, typeString, children };
  } else if (checker.isArrayType(type)) {
    // Array type
    const typeArgs = checker.getTypeArguments(type as ts.TypeReference);
    const elementType = typeArgs[0];
    const children: TypeNode[] = [];
    if (elementType) {
      children.push(
        walkType(checker, elementType, "element", new Set(visited), startTime, timeoutMs),
      );
    }
    result = { kind: "array", name, typeString, children };
  } else if (type.getCallSignatures().length > 0) {
    // Function type
    const sig = type.getCallSignatures()[0];
    const children: TypeNode[] = [];

    for (const param of sig.getParameters()) {
      const paramType = checker.getTypeOfSymbol(param);
      const paramNode = walkType(
        checker,
        paramType,
        param.getName(),
        new Set(visited),
        startTime,
        timeoutMs,
      );
      children.push(paramNode);
    }

    const returnType = sig.getReturnType();
    children.push(
      walkType(checker, returnType, "returns", new Set(visited), startTime, timeoutMs),
    );

    result = { kind: "function", name, typeString, children };
  } else if (
    type.flags & ts.TypeFlags.Object &&
    type.getProperties().length > 0
  ) {
    // Object type with properties
    const properties = type.getProperties();
    const children = properties.map((prop) =>
      walkSymbol(checker, prop, visited, startTime, timeoutMs),
    );
    result = { kind: "object", name, typeString, children };
  } else if (type.flags & (ts.TypeFlags.Enum | ts.TypeFlags.EnumLiteral)) {
    result = { kind: "enum", name, typeString };
  } else if (type.isLiteral()) {
    result = { kind: "literal", name, typeString };
  } else {
    result = { kind: "primitive", name, typeString };
  }

  // Backtrack: remove from visited
  if (typeId !== undefined) {
    visited.delete(typeId);
  }

  return result;
}

/**
 * Walk a symbol (property) to produce a TypeNode, including optional/readonly flags.
 */
function walkSymbol(
  checker: ts.TypeChecker,
  symbol: ts.Symbol,
  visited: Set<number>,
  startTime: number,
  timeoutMs: number,
): TypeNode {
  const type = checker.getTypeOfSymbol(symbol);
  const name = symbol.getName();
  const node = walkType(checker, type, name, new Set(visited), startTime, timeoutMs);

  // Check optional
  if (symbol.flags & ts.SymbolFlags.Optional) {
    node.optional = true;
  }

  // Check readonly
  const declarations = symbol.getDeclarations();
  if (declarations && declarations.length > 0) {
    const modifiers = ts.getCombinedModifierFlags(declarations[0]);
    if (modifiers & ts.ModifierFlags.Readonly) {
      node.readonly = true;
    }

    // Extract source location
    const decl = declarations[0];
    const sourceFile = decl.getSourceFile();
    node.sourcePath = sourceFile.fileName;
    const lineAndChar = sourceFile.getLineAndCharacterOfPosition(decl.getStart());
    node.sourceLine = lineAndChar.line + 1; // 1-based
  }

  return node;
}
