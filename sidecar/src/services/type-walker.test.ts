import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveAtPosition, walkType } from "./type-walker.js";
import { getLanguageService } from "./language-service.js";
import type { TypeNode } from "../types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, "../../test-fixtures");

function fixturePos(fixtureName: string, identifier: string): { filePath: string; position: number } {
  const filePath = path.join(FIXTURES_DIR, fixtureName);
  const content = fs.readFileSync(filePath, "utf-8");
  const position = content.indexOf(identifier);
  if (position === -1) throw new Error(`Identifier "${identifier}" not found in ${fixtureName}`);
  return { filePath, position };
}

function findChild(node: TypeNode, name: string): TypeNode | undefined {
  return node.children?.find((c) => c.name === name);
}

function findDescendant(node: TypeNode, predicate: (n: TypeNode) => boolean): TypeNode | undefined {
  if (predicate(node)) return node;
  if (node.children) {
    for (const child of node.children) {
      const found = findDescendant(child, predicate);
      if (found) return found;
    }
  }
  return undefined;
}

describe("type-walker", () => {
  describe("object types (TRES-02)", () => {
    it("resolves object type with property children", () => {
      // Use the `user` variable which is typed as User { readonly id: number; name: string; email?: string }
      const { filePath, position } = fixturePos("simple.ts", "user:");
      // Position at the identifier "user" (skip "user:")
      const result = resolveAtPosition(filePath, position);
      assert.ok(result.node, "should resolve a node");
      assert.equal(result.node.kind, "object");
      assert.ok(result.node.children, "object should have children");

      const idChild = findChild(result.node, "id");
      assert.ok(idChild, "should have 'id' child");
      assert.equal(idChild.kind, "primitive");

      const nameChild = findChild(result.node, "name");
      assert.ok(nameChild, "should have 'name' child");
      assert.equal(nameChild.kind, "primitive");
    });

    it("resolves interface declaration directly", () => {
      // Position cursor on the "User" identifier in "interface User {"
      const { filePath, position } = fixturePos("simple.ts", "interface User");
      // Advance past "interface " to land on "User"
      const result = resolveAtPosition(filePath, position + "interface ".length);
      assert.ok(result.node, "should resolve a node");
      assert.equal(result.node.kind, "object");
      assert.ok(result.node.children, "interface should have property children");
      const idChild = findChild(result.node, "id");
      assert.ok(idChild, "should have 'id' child");
      const nameChild = findChild(result.node, "name");
      assert.ok(nameChild, "should have 'name' child");
      const emailChild = findChild(result.node, "email");
      assert.ok(emailChild, "should have 'email' child");
      assert.equal(emailChild.optional, true, "email should be optional");
    });
  });

  describe("union types (TRES-03)", () => {
    it("resolves union type with flat branch children", () => {
      const { filePath, position } = fixturePos("unions.ts", "unionVal:");
      const result = resolveAtPosition(filePath, position);
      assert.ok(result.node, "should resolve a node");
      assert.equal(result.node.kind, "union");
      assert.ok(result.node.children, "union should have children");
      assert.equal(result.node.children.length, 2, "string | number should have 2 branches");
    });

    it("resolves string literal union", () => {
      const { filePath, position } = fixturePos("unions.ts", "status:");
      const result = resolveAtPosition(filePath, position);
      assert.ok(result.node, "should resolve a node");
      assert.equal(result.node.kind, "union");
      assert.ok(result.node.children, "union should have children");
      assert.equal(result.node.children.length, 3, "3 literal branches");
    });
  });

  describe("intersection types (TRES-04)", () => {
    it("resolves intersection as merged object with all properties", () => {
      const { filePath, position } = fixturePos("unions.ts", "merged:");
      const result = resolveAtPosition(filePath, position);
      assert.ok(result.node, "should resolve a node");
      assert.equal(result.node.kind, "object");
      assert.ok(result.node.children, "merged should have children");

      const aChild = findChild(result.node, "a");
      assert.ok(aChild, "should have 'a' property");
      const bChild = findChild(result.node, "b");
      assert.ok(bChild, "should have 'b' property");
    });
  });

  describe("function types (TRES-05)", () => {
    it("resolves function type with parameter children and return child", () => {
      const { filePath, position } = fixturePos("functions.ts", "greet");
      const result = resolveAtPosition(filePath, position);
      assert.ok(result.node, "should resolve a node");
      assert.equal(result.node.kind, "function");
      assert.ok(result.node.children, "function should have children");

      const nameParam = findChild(result.node, "name");
      assert.ok(nameParam, "should have 'name' parameter");

      const ageParam = findChild(result.node, "age");
      assert.ok(ageParam, "should have 'age' parameter");

      const returnChild = findChild(result.node, "returns");
      assert.ok(returnChild, "should have 'returns' child");
    });

    it("resolves arrow function type", () => {
      const { filePath, position } = fixturePos("functions.ts", "arrowFn:");
      const result = resolveAtPosition(filePath, position);
      assert.ok(result.node, "should resolve a node");
      assert.equal(result.node.kind, "function");
      assert.ok(result.node.children, "function should have children");

      const xParam = findChild(result.node, "x");
      assert.ok(xParam, "should have 'x' parameter");
    });
  });

  describe("array types (TRES-06)", () => {
    it("resolves array type with element child", () => {
      const { filePath, position } = fixturePos("simple.ts", "arr:");
      const result = resolveAtPosition(filePath, position);
      assert.ok(result.node, "should resolve a node");
      assert.equal(result.node.kind, "array");
      assert.ok(result.node.children, "array should have children");

      const element = findChild(result.node, "element");
      assert.ok(element, "should have 'element' child");
      assert.equal(element.kind, "primitive");
    });

    it("resolves tuple type with positional children", () => {
      const { filePath, position } = fixturePos("simple.ts", "tuple:");
      const result = resolveAtPosition(filePath, position);
      assert.ok(result.node, "should resolve a node");
      assert.equal(result.node.kind, "tuple");
      assert.ok(result.node.children, "tuple should have children");
      assert.equal(result.node.children.length, 2, "tuple should have 2 elements");

      const first = findChild(result.node, "[0]");
      assert.ok(first, "should have '[0]' child");
      const second = findChild(result.node, "[1]");
      assert.ok(second, "should have '[1]' child");
    });
  });

  describe("generic types (TRES-07)", () => {
    it("resolves generic type at usage site with concrete types", () => {
      const { filePath, position } = fixturePos("generics.ts", "pair:");
      const result = resolveAtPosition(filePath, position);
      assert.ok(result.node, "should resolve a node");
      assert.equal(result.node.kind, "object");
      assert.ok(result.node.children, "generic should have children");

      const first = findChild(result.node, "first");
      assert.ok(first, "should have 'first' property");
      // first should be string (concrete)
      assert.ok(first.typeString.includes("string"), "first should be string type");

      const second = findChild(result.node, "second");
      assert.ok(second, "should have 'second' property");
      assert.ok(second.typeString.includes("number"), "second should be number type");
    });
  });

  describe("optional marker (TRES-08)", () => {
    it("marks optional properties with optional: true", () => {
      const { filePath, position } = fixturePos("simple.ts", "user:");
      const result = resolveAtPosition(filePath, position);
      assert.ok(result.node, "should resolve a node");

      const emailChild = findChild(result.node, "email");
      assert.ok(emailChild, "should have 'email' child");
      assert.equal(emailChild.optional, true, "email should be optional");

      const nameChild = findChild(result.node, "name");
      assert.ok(nameChild, "should have 'name' child");
      assert.notEqual(nameChild.optional, true, "name should not be optional");
    });
  });

  describe("readonly marker (TRES-09)", () => {
    it("marks readonly properties with readonly: true", () => {
      const { filePath, position } = fixturePos("simple.ts", "user:");
      const result = resolveAtPosition(filePath, position);
      assert.ok(result.node, "should resolve a node");

      const idChild = findChild(result.node, "id");
      assert.ok(idChild, "should have 'id' child");
      assert.equal(idChild.readonly, true, "id should be readonly");

      const nameChild = findChild(result.node, "name");
      assert.ok(nameChild, "should have 'name' child");
      assert.notEqual(nameChild.readonly, true, "name should not be readonly");
    });
  });

  describe("cycle detection", () => {
    it("produces circular marker for recursive types without stack overflow", () => {
      // Tree = { value: number; left: Tree | null; right: Tree | null }
      const { filePath, position } = fixturePos("simple.ts", "tree:");
      const result = resolveAtPosition(filePath, position);
      assert.ok(result.node, "should resolve a node");
      assert.equal(result.node.kind, "object", "top-level should be object");
      assert.ok(result.node.children, "should have children");

      // Find a circular marker somewhere in the tree
      const circular = findDescendant(result.node, (n) => n.kind === "circular");
      assert.ok(circular, "should find a circular marker in the tree");
      assert.ok(
        circular.typeString.includes("[circular:"),
        `circular typeString should contain "[circular:", got "${circular.typeString}"`,
      );
    });

    it("expands sibling branches that reference the same type", () => {
      // Both `left` and `right` are Tree | null -- both should be expanded (not just one)
      const { filePath, position } = fixturePos("simple.ts", "tree:");
      const result = resolveAtPosition(filePath, position);
      assert.ok(result.node, "should resolve a node");

      const left = findChild(result.node, "left");
      assert.ok(left, "should have 'left' child");
      assert.ok(left.children || left.kind === "union", "left should be expanded");

      const right = findChild(result.node, "right");
      assert.ok(right, "should have 'right' child");
      assert.ok(right.children || right.kind === "union", "right should be expanded");
    });
  });

  describe("timeout handling (SIDE-06)", () => {
    it("returns timeout node when time budget is exceeded", () => {
      // Use walkType directly with a startTime already in the past to guarantee timeout
      const { filePath } = fixturePos("simple.ts", "tree:");
      const service = getLanguageService(filePath);
      const program = service.getProgram()!;
      const checker = program.getTypeChecker();
      const sourceFile = program.getSourceFile(filePath)!;

      // Find the tree symbol to get its type
      const symbols = checker.getSymbolsInScope(sourceFile, 0xffffffff);
      const treeSym = symbols.find((s) => s.getName() === "tree");
      assert.ok(treeSym, "should find tree symbol");
      const treeType = checker.getTypeOfSymbol(treeSym);

      // Call walkType with startTime far in the past (already expired)
      const expiredStartTime = Date.now() - 10000; // 10 seconds ago
      const result = walkType(checker, treeType, "tree", new Set(), expiredStartTime, 5000);

      assert.equal(result.kind, "timeout", "should be timeout when budget expired");
      assert.equal(result.typeString, "[resolution timeout]");
      assert.equal(result.name, "tree");
    });

    it("resolveAtPosition returns partial results (node is non-null) even with tight timeout", () => {
      // With a very short timeout, we still get a node back (partial result, not error)
      const { filePath, position } = fixturePos("simple.ts", "tree:");
      const result = resolveAtPosition(filePath, position, 1);
      assert.ok(result.node, "should return partial results, not null");
      // The node should be either a valid type or contain timeout markers somewhere
      assert.ok(
        ["object", "timeout"].includes(result.node.kind),
        `root should be object or timeout, got ${result.node.kind}`,
      );
    });
  });

  describe("recursive class types (GAP-01)", () => {
    it("resolves EventBus instance without RangeError", () => {
      const { filePath, position } = fixturePos("classes.ts", "bus =");
      // Should not throw RangeError: Maximum call stack size exceeded
      const result = resolveAtPosition(filePath, position);
      assert.ok(result.node, "should resolve a node (not crash)");
      assert.notEqual(result.node.kind, "timeout", "should resolve fully, not timeout");
    });

    it("resolves EventBus class declaration without throwing", () => {
      const { filePath, position } = fixturePos("classes.ts", "class EventBus");
      const result = resolveAtPosition(filePath, position + "class ".length);
      assert.ok(result.node, "should resolve a node");
    });

    it("maxDepth guard produces valid node instead of stack overflow", () => {
      // walkType with depth parameter should stop at maxDepth
      const { filePath } = fixturePos("classes.ts", "bus =");
      const service = getLanguageService(filePath);
      const program = service.getProgram()!;
      const checker = program.getTypeChecker();
      const sourceFile = program.getSourceFile(filePath)!;

      const symbols = checker.getSymbolsInScope(sourceFile, 0xffffffff);
      const busSym = symbols.find((s) => s.getName() === "bus");
      assert.ok(busSym, "should find bus symbol");
      const busType = checker.getTypeOfSymbol(busSym);

      // Call walkType -- should not throw
      const result = walkType(checker, busType, "bus", new Set(), Date.now(), 5000);
      assert.ok(result, "should return a valid node");
      assert.ok(result.typeString.length > 0, "typeString should be non-empty");
    });

    it("existing cycle detection tests still pass (tree fixture)", () => {
      const { filePath, position } = fixturePos("simple.ts", "tree:");
      const result = resolveAtPosition(filePath, position);
      assert.ok(result.node, "should resolve a node");
      assert.equal(result.node.kind, "object");
      const circular = findDescendant(result.node, (n) => n.kind === "circular");
      assert.ok(circular, "should still find circular markers in tree");
    });
  });

  describe("overloaded functions (GAP-02)", () => {
    it("shows all overload signatures as children", () => {
      const { filePath, position } = fixturePos("overloads.ts", "function parse");
      const result = resolveAtPosition(filePath, position + "function ".length);
      assert.ok(result.node, "should resolve a node");
      assert.equal(result.node.kind, "function");
      assert.ok(result.node.children, "should have children");

      // Should have overload children (not just one signature's params)
      const overloads = result.node.children.filter((c) => c.name.startsWith("overload"));
      assert.ok(overloads.length >= 2, `should have at least 2 overload children, got ${overloads.length}`);
    });

    it("each overload signature has its own params and return type", () => {
      const { filePath, position } = fixturePos("overloads.ts", "function parse");
      const result = resolveAtPosition(filePath, position + "function ".length);
      assert.ok(result.node, "should resolve a node");
      assert.ok(result.node.children, "should have children");

      const overloads = result.node.children.filter((c) => c.name.startsWith("overload"));
      for (const overload of overloads) {
        assert.equal(overload.kind, "function", "each overload should be kind function");
        assert.ok(overload.children, `overload "${overload.name}" should have children`);
        const ret = findChild(overload, "returns");
        assert.ok(ret, `overload "${overload.name}" should have a returns child`);
      }
    });
  });

  describe("private class members (GAP-03)", () => {
    it("resolves private member with actual type, not any", () => {
      // Resolve instance to get the class type with members as direct children
      const { filePath, position } = fixturePos("classes.ts", "container =");
      const result = resolveAtPosition(filePath, position);
      assert.ok(result.node, "should resolve a node");
      assert.ok(result.node.children, "should have children");

      const itemsChild = findChild(result.node, "items");
      assert.ok(itemsChild, "should have 'items' child");
      assert.ok(
        itemsChild.typeString.includes("string[]") || itemsChild.typeString.includes("string"),
        `items typeString should contain 'string[]', got "${itemsChild.typeString}"`,
      );
      // Critically: should NOT be "any"
      assert.ok(
        !itemsChild.typeString.includes("any"),
        `private member items should not be 'any', got "${itemsChild.typeString}"`,
      );
    });

    it("public class members still resolve correctly", () => {
      const { filePath, position } = fixturePos("classes.ts", "container =");
      const result = resolveAtPosition(filePath, position);
      assert.ok(result.node, "should resolve a node");
      assert.ok(result.node.children, "should have children");

      const nameChild = findChild(result.node, "name");
      assert.ok(nameChild, "should have 'name' child");
      assert.ok(
        nameChild.typeString.includes("string"),
        `name typeString should contain 'string', got "${nameChild.typeString}"`,
      );
    });
  });

  describe("primitive and literal types", () => {
    it("resolves primitive type", () => {
      const { filePath, position } = fixturePos("simple.ts", "num:");
      const result = resolveAtPosition(filePath, position);
      assert.ok(result.node, "should resolve a node");
      assert.equal(result.node.kind, "primitive");
    });

    it("resolves string literal in union as literal kind", () => {
      const { filePath, position } = fixturePos("unions.ts", "status:");
      const result = resolveAtPosition(filePath, position);
      assert.ok(result.node, "should resolve a node");
      // Each child of the union should be a literal
      assert.ok(result.node.children);
      for (const child of result.node.children) {
        assert.equal(child.kind, "literal", `branch "${child.typeString}" should be literal`);
      }
    });
  });
});
