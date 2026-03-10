// Test fixture for GAP-04/05/06 closure verification
// Contains types from the project root test.ts that exercise cascading gaps

// Discriminated union (GAP-04: parsed variable should resolve to this, not function type)
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

// Complex interface hierarchy (GAP-06: diagnostics should have array children)
interface BaseEvent {
  id: string;
  timestamp: number;
}

interface TypeCheckEvent extends BaseEvent {
  kind: "typecheck";
  file: string;
  diagnostics: Diagnostic[];
}

interface Diagnostic {
  message: string;
  severity: "error" | "warning" | "info";
  range: { start: number; end: number };
}

// Generic class with constraints (GAP-05: bus should resolve without crash)
class EventBus<TEvent extends BaseEvent> {
  private handlers = new Map<string, ((e: TEvent) => void)[]>();

  on(kind: TEvent["kind"], handler: (e: TEvent) => void): void {
    const existing = this.handlers.get(kind) ?? [];
    this.handlers.set(kind, [...existing, handler]);
  }

  emit(event: TEvent): void {
    this.handlers.get(event.kind)?.forEach((h) => h(event));
  }
}

// Function overloads with Result return type (GAP-04)
function parse(input: string): Result<number>;
function parse(input: number): Result<string>;
function parse(input: string | number): Result<string | number> {
  if (typeof input === "string") {
    const n = Number(input);
    return isNaN(n) ? { ok: false, error: new Error("NaN") } : { ok: true, value: n };
  }
  return { ok: true, value: String(input) };
}

// GAP-04: parsed should be Result<number, Error>, not the parse function type
export const parsed = parse("42");

// GAP-05: bus should resolve without crash or timeout
export const bus = new EventBus<TypeCheckEvent>();

// GAP-05: handler should resolve without stall
export const handler = (e: TypeCheckEvent) => e.diagnostics.map((d) => d.severity);

// GAP-06: TypeCheckEvent should have diagnostics with Diagnostic[] children
export type { TypeCheckEvent, Diagnostic };
