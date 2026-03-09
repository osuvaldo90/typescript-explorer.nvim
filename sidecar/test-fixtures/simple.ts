// Simple types for testing type resolution
export const num: number = 42;
export const str: string = "hello";
export const bool: boolean = true;

export interface User {
  readonly id: number;
  name: string;
  email?: string;
}

export type Status = "active" | "inactive" | "pending";

export function greet(name: string, age: number): string {
  return `${name} is ${age}`;
}

export const user: User = { id: 1, name: "test" };

export type Pair<A, B> = { first: A; second: B };
export const pair: Pair<string, number> = { first: "a", second: 1 };

export const arr: string[] = ["a", "b"];
export const tuple: [string, number] = ["a", 1];

type Tree = { value: number; left: Tree | null; right: Tree | null };
export const tree: Tree = { value: 1, left: null, right: null };

export type Merged = { a: string } & { b: number };
export const merged: Merged = { a: "hello", b: 42 };
