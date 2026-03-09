import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const SIDECAR_ENTRY = path.resolve(__dirname, "../main.ts");
const FIXTURE_DIR = path.resolve(__dirname, "../../test-fixtures");
const SIMPLE_FIXTURE = path.resolve(FIXTURE_DIR, "simple.ts");

/** Read fixture content and find byte offset of an identifier */
function fixturePos(fixturePath: string, identifier: string): number {
  const content = fs.readFileSync(fixturePath, "utf-8");
  const pos = content.indexOf(identifier);
  if (pos === -1) throw new Error(`Identifier "${identifier}" not found in ${fixturePath}`);
  return pos;
}

function spawnSidecar(): ReturnType<typeof spawn> {
  return spawn("npx", ["tsx", SIDECAR_ENTRY], {
    stdio: ["pipe", "pipe", "pipe"],
    cwd: path.resolve(__dirname, "../.."),
  });
}

function sendAndReceive(
  input: string,
  timeoutMs = 15000,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawnSidecar();
    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`Timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.stdout!.on("data", (data) => {
      stdout += data.toString();
      if (stdout.includes("\n")) {
        proc.stdin!.end();
      }
    });

    proc.stderr!.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", () => {
      clearTimeout(timer);
      resolve({ stdout: stdout.trim(), stderr });
    });

    proc.stdin!.write(input);
  });
}

describe("Resolve Handler Integration", () => {
  it("resolves an object type (User) with property children", async () => {
    const pos = fixturePos(SIMPLE_FIXTURE, "user");
    // Find the `user` variable on the last relevant line
    const content = fs.readFileSync(SIMPLE_FIXTURE, "utf-8");
    const userVarPos = content.indexOf("const user: User");
    const finalPos = content.indexOf("user", userVarPos + "const ".length);

    const request = JSON.stringify({
      id: 1,
      method: "resolve",
      params: { filePath: SIMPLE_FIXTURE, position: finalPos },
    });

    const { stdout } = await sendAndReceive(request + "\n");
    const response = JSON.parse(stdout);

    assert.equal(response.id, 1);
    assert.ok(response.result, "Expected result field");
    assert.ok(response.result.node, "Expected node in result");
    assert.equal(response.result.node.kind, "object");
    assert.ok(
      Array.isArray(response.result.node.children),
      "Object node should have children",
    );
    assert.ok(
      response.result.node.children.length > 0,
      "Object node should have at least one property child",
    );
  });

  it("resolves a primitive type (num)", async () => {
    const pos = fixturePos(SIMPLE_FIXTURE, "num");

    const request = JSON.stringify({
      id: 2,
      method: "resolve",
      params: { filePath: SIMPLE_FIXTURE, position: pos },
    });

    const { stdout } = await sendAndReceive(request + "\n");
    const response = JSON.parse(stdout);

    assert.equal(response.id, 2);
    assert.ok(response.result.node);
    assert.equal(response.result.node.kind, "primitive");
  });

  it("resolves a union type (Status)", async () => {
    const content = fs.readFileSync(SIMPLE_FIXTURE, "utf-8");
    const typePos = content.indexOf("type Status");
    const pos = content.indexOf("Status", typePos + "type ".length);

    const request = JSON.stringify({
      id: 3,
      method: "resolve",
      params: { filePath: SIMPLE_FIXTURE, position: pos },
    });

    const { stdout } = await sendAndReceive(request + "\n");
    const response = JSON.parse(stdout);

    assert.equal(response.id, 3);
    assert.ok(response.result.node);
    assert.equal(response.result.node.kind, "union");
    assert.ok(
      Array.isArray(response.result.node.children),
      "Union node should have children (branches)",
    );
  });

  it("resolves a function type (greet)", async () => {
    const content = fs.readFileSync(SIMPLE_FIXTURE, "utf-8");
    const fnPos = content.indexOf("function greet");
    const pos = content.indexOf("greet", fnPos + "function ".length);

    const request = JSON.stringify({
      id: 4,
      method: "resolve",
      params: { filePath: SIMPLE_FIXTURE, position: pos },
    });

    const { stdout } = await sendAndReceive(request + "\n");
    const response = JSON.parse(stdout);

    assert.equal(response.id, 4);
    assert.ok(response.result.node);
    assert.equal(response.result.node.kind, "function");
    assert.ok(
      Array.isArray(response.result.node.children),
      "Function node should have param children",
    );
  });
});

describe("Resolve Handler Validation", () => {
  it("returns error when filePath is missing", async () => {
    const request = JSON.stringify({
      id: 5,
      method: "resolve",
      params: { position: 0 },
    });

    const { stdout } = await sendAndReceive(request + "\n");
    const response = JSON.parse(stdout);

    assert.equal(response.id, 5);
    assert.ok(response.error, "Expected error field");
    assert.equal(response.error.code, "HANDLER_ERROR");
    assert.ok(response.error.message.toLowerCase().includes("filepath"));
  });

  it("returns error when position is missing", async () => {
    const request = JSON.stringify({
      id: 6,
      method: "resolve",
      params: { filePath: SIMPLE_FIXTURE },
    });

    const { stdout } = await sendAndReceive(request + "\n");
    const response = JSON.parse(stdout);

    assert.equal(response.id, 6);
    assert.ok(response.error, "Expected error field");
    assert.equal(response.error.code, "HANDLER_ERROR");
    assert.ok(response.error.message.toLowerCase().includes("position"));
  });
});
