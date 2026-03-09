import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";

const SIDECAR_ENTRY = path.resolve(__dirname, "main.ts");

function spawnSidecar(): ReturnType<typeof spawn> {
  return spawn("npx", ["tsx", SIDECAR_ENTRY], {
    stdio: ["pipe", "pipe", "pipe"],
    cwd: path.resolve(__dirname, ".."),
  });
}

function sendAndReceive(
  input: string,
  timeoutMs = 5000,
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
      // Once we have a complete line, close stdin to let process exit
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

describe("NDJSON Protocol", () => {
  it("echo round-trip: returns the same params back", async () => {
    const request = JSON.stringify({
      id: 1,
      method: "echo",
      params: { text: "hello" },
    });

    const { stdout } = await sendAndReceive(request + "\n");
    const response = JSON.parse(stdout);

    assert.equal(response.id, 1);
    assert.deepEqual(response.result, { text: "hello" });
  });

  it("unknown method: returns error response with same id", async () => {
    const request = JSON.stringify({
      id: 42,
      method: "nonexistent",
      params: {},
    });

    const { stdout } = await sendAndReceive(request + "\n");
    const response = JSON.parse(stdout);

    assert.equal(response.id, 42);
    assert.ok(response.error, "Expected error field in response");
    assert.equal(response.error.code, "UNKNOWN_METHOD");
    assert.ok(response.error.message.includes("nonexistent"));
  });

  it("malformed JSON: returns parse error response", async () => {
    const { stdout } = await sendAndReceive("not json\n");
    const response = JSON.parse(stdout);

    assert.equal(response.id, null);
    assert.ok(response.error, "Expected error field in response");
    assert.equal(response.error.code, "PARSE_ERROR");
  });
});
