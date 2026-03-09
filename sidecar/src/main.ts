import * as readline from "node:readline";
import type { Request } from "./protocol.js";
import { handleEcho } from "./handlers/echo.js";

function log(...args: unknown[]): void {
  console.error("[ts-explorer]", ...args);
}

const rl = readline.createInterface({ input: process.stdin });

// Self-terminate when stdin closes (SIDE-05)
process.stdin.on("end", () => {
  process.exit(0);
});

// Clean shutdown on SIGTERM (sent by jobstop)
process.on("SIGTERM", () => {
  process.exit(0);
});

rl.on("line", (line: string) => {
  let msg: Request;

  try {
    msg = JSON.parse(line);
  } catch {
    const errorResponse = JSON.stringify({
      id: null,
      error: { code: "PARSE_ERROR", message: "Invalid JSON" },
    });
    process.stdout.write(errorResponse + "\n");
    return;
  }

  try {
    let result: unknown;

    switch (msg.method) {
      case "echo":
        result = handleEcho(msg.params);
        break;
      default: {
        const errorResponse = JSON.stringify({
          id: msg.id,
          error: {
            code: "UNKNOWN_METHOD",
            message: `Unknown method: ${msg.method}`,
          },
        });
        process.stdout.write(errorResponse + "\n");
        return;
      }
    }

    const response = JSON.stringify({ id: msg.id, result });
    process.stdout.write(response + "\n");
  } catch (err) {
    const errorResponse = JSON.stringify({
      id: msg.id,
      error: {
        code: "HANDLER_ERROR",
        message: err instanceof Error ? err.message : String(err),
      },
    });
    process.stdout.write(errorResponse + "\n");
  }
});

log("sidecar started, pid:", process.pid);
