// Union and intersection type fixtures
export type StringOrNumber = string | number;
export const unionVal: StringOrNumber = "hello";

export type Status = "active" | "inactive" | "pending";
export const status: Status = "active";

export type Merged = { a: string } & { b: number };
export const merged: Merged = { a: "hello", b: 42 };

export type Complex = { x: number } & { y: number } & { z: number };
export const complex: Complex = { x: 1, y: 2, z: 3 };
