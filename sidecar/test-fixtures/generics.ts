// Generic type fixtures
export type Pair<A, B> = { first: A; second: B };
export const pair: Pair<string, number> = { first: "a", second: 1 };

export type Wrapper<T> = { value: T };
export const wrapped: Wrapper<boolean> = { value: true };

export type Container<T> = { items: T[]; count: number };
export const container: Container<string> = { items: ["a"], count: 1 };
