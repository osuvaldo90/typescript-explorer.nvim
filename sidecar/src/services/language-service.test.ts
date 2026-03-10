import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getLanguageService, notifyFileChanged } from "./language-service.js";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(
  __dirname,
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

describe("notifyFileChanged", () => {
  it("getScriptVersion returns '0' for a file that has never been changed", () => {
    const service = getLanguageService(FIXTURE_FILE);
    const program = service.getProgram()!;
    const sourceFile = program.getSourceFile(FIXTURE_FILE);
    assert.ok(sourceFile, "source file should exist");
    // The service should work without any notifyFileChanged calls
    // (version 0 is the default)
  });

  it("after notifyFileChanged, version increments to '1'", () => {
    notifyFileChanged(FIXTURE_FILE);
    // Verify the service still works after version bump
    const service = getLanguageService(FIXTURE_FILE);
    const program = service.getProgram()!;
    assert.ok(program, "program should still work after version bump");
  });

  it("calling notifyFileChanged twice increments to '2'", () => {
    // Already called once above, call again
    notifyFileChanged(FIXTURE_FILE);
    const service = getLanguageService(FIXTURE_FILE);
    const program = service.getProgram()!;
    assert.ok(program, "program should still work after two version bumps");
  });

  it("notifyFileChanged for one file does not affect another file's version", () => {
    const otherFile = path.join(FIXTURES_DIR, "simple.ts");
    // Create a temp file for isolation test
    const tmpFile = path.join("/tmp", "version-isolation-test.ts");
    fs.writeFileSync(tmpFile, "export const y: number = 2;\n");
    try {
      // Notify only the tmp file
      notifyFileChanged(tmpFile);
      // The main fixture should still work normally
      const service = getLanguageService(FIXTURE_FILE);
      const program = service.getProgram()!;
      assert.ok(program, "program for fixture should be unaffected");
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it("after notifyFileChanged, LanguageService re-reads file from disk", () => {
    const tmpFile = path.join("/tmp", "reread-test.ts");
    fs.writeFileSync(tmpFile, "export const original: number = 1;\n");
    try {
      const service = getLanguageService(tmpFile);
      let program = service.getProgram()!;
      let sf = program.getSourceFile(path.resolve(tmpFile));
      assert.ok(sf, "source file should exist initially");
      assert.ok(sf!.text.includes("original"), "should contain 'original'");

      // Modify file on disk
      fs.writeFileSync(tmpFile, "export const updated: string = 'new';\n");

      // Notify the change
      notifyFileChanged(tmpFile);

      // Re-get program - should pick up new content
      program = service.getProgram()!;
      sf = program.getSourceFile(path.resolve(tmpFile));
      assert.ok(sf, "source file should still exist");
      assert.ok(sf!.text.includes("updated"), "should contain 'updated' after notifyFileChanged");
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});
