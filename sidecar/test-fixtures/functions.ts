// Function type fixtures
export function greet(name: string, age: number): string {
  return `${name} is ${age}`;
}

export const arrowFn: (x: number, y: number) => number = (x, y) => x + y;

export type Callback = (err: Error | null, data: string) => void;
export const cb: Callback = (_err, _data) => {};
