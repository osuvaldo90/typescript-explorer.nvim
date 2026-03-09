import path from "node:path";
import { resolveAtPosition } from "../services/type-walker.js";
import type { ResolveParams, ResolveResult } from "../types.js";

/**
 * Handle a "resolve" request: validate params, resolve type at position,
 * return TypeNode tree.
 */
export function handleResolve(params: unknown): ResolveResult {
  if (
    typeof params !== "object" ||
    params === null ||
    !("filePath" in params) ||
    typeof (params as ResolveParams).filePath !== "string"
  ) {
    throw new Error("Missing or invalid 'filePath' parameter (expected string)");
  }

  if (
    !("position" in params) ||
    typeof (params as ResolveParams).position !== "number"
  ) {
    throw new Error("Missing or invalid 'position' parameter (expected number)");
  }

  const { filePath, position } = params as ResolveParams;
  const absolutePath = path.resolve(filePath);

  return resolveAtPosition(absolutePath, position);
}
