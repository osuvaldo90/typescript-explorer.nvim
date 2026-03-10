// Test fixture for function overloads

export function parse(input: string): number;
export function parse(input: number): string;
export function parse(input: string | number): string | number {
  return typeof input === "string" ? Number(input) : String(input);
}
