import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { getLanguageService } from "./language-service.js";

const FIXTURES_DIR = path.resolve(
  import.meta.dirname,
  "../../test-fixtures",
);
const FIXTURE_FILE = path.join(FIXTURES_DIR, "simple.ts");

describe("getLanguageService", () => {
  it("returns a LanguageService for a file inside test-fixtures/", () => {
    const service = getLanguageService(FIXTURE_FILE);
    assert.ok(service, "service should not be null");
  });

  it("getProgram() is not null", () => {
    const service = getLanguageService(FIXTURE_FILE);
    const program = service.getProgram();
    assert.ok(program, "program should not be null");
  });

  it("getProgram().getSourceFile() returns the source file", () => {
    const service = getLanguageService(FIXTURE_FILE);
    const program = service.getProgram()!;
    const sourceFile = program.getSourceFile(FIXTURE_FILE);
    assert.ok(sourceFile, "source file should not be null");
    assert.ok(
      sourceFile.fileName.endsWith("simple.ts"),
      "source file should be simple.ts",
    );
  });

  it("TypeChecker can resolve a type from the fixture", () => {
    const service = getLanguageService(FIXTURE_FILE);
    const program = service.getProgram()!;
    const checker = program.getTypeChecker();
    assert.ok(checker, "checker should not be null");

    const sourceFile = program.getSourceFile(FIXTURE_FILE)!;
    // The file should have symbols we can check
    const symbols = checker.getSymbolsInScope(
      sourceFile,
      // SymbolFlags.Variable = 3
      3,
    );
    assert.ok(symbols.length > 0, "should find symbols in scope");
  });

  it("returns the same cached instance for the same project root", () => {
    const service1 = getLanguageService(FIXTURE_FILE);
    const service2 = getLanguageService(FIXTURE_FILE);
    assert.strictEqual(
      service1,
      service2,
      "should return cached instance",
    );
  });

  it("works for a file with no tsconfig.json (fallback defaults)", async () => {
    // Use a temp file path outside any tsconfig project
    const tmpFile = path.join("/tmp", "no-tsconfig-test.ts");
    // Write a minimal file so it exists
    const fs = await import("node:fs");
    fs.writeFileSync(tmpFile, "export const x: number = 1;\n");
    try {
      const service = getLanguageService(tmpFile);
      assert.ok(service, "service should not be null for no-tsconfig file");
      const program = service.getProgram();
      assert.ok(program, "program should not be null");
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});
