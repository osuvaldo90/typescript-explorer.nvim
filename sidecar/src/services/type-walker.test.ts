import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveAtPosition } from "./type-walker.js";
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
