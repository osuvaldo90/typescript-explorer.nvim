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

describe("Sidecar Lifecycle", () => {
  it("exits with code 0 when stdin closes", async () => {
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      const proc = spawnSidecar();

      const timer = setTimeout(() => {
        proc.kill();
        reject(new Error("Sidecar did not exit within 2 seconds of stdin close"));
      }, 5000);

      proc.on("close", (code) => {
        clearTimeout(timer);
        resolve(code);
      });

      // Give sidecar a moment to start, then close stdin
      setTimeout(() => {
        proc.stdin!.end();
      }, 500);
    });

    assert.equal(exitCode, 0, "Sidecar should exit with code 0 when stdin closes");
  });

  it("produces no stdout output except valid JSON responses", async () => {
    const { stdout, allValid } = await new Promise<{
      stdout: string;
      allValid: boolean;
    }>((resolve, reject) => {
      const proc = spawnSidecar();
      let stdout = "";

      const timer = setTimeout(() => {
        proc.kill();
        reject(new Error("Timed out"));
      }, 5000);

      proc.stdout!.on("data", (data) => {
        stdout += data.toString();
      });

      proc.on("close", () => {
        clearTimeout(timer);
        const lines = stdout.split("\n").filter((l) => l.trim() !== "");
        const allValid =
          lines.length === 0 ||
          lines.every((line) => {
            try {
              JSON.parse(line);
              return true;
            } catch {
              return false;
            }
          });
        resolve({ stdout, allValid });
      });

      // Send one echo request, then close stdin
      const request = JSON.stringify({
        id: 1,
        method: "echo",
        params: { test: true },
      });
      proc.stdin!.write(request + "\n");

      // Wait a bit for response, then close stdin
      setTimeout(() => {
        proc.stdin!.end();
      }, 500);
    });

    assert.ok(
      allValid,
      `All stdout lines must be valid JSON. Got: ${stdout}`,
    );
  });
});
