export type TypeKind =
  | "object"
  | "union"
  | "intersection"
  | "function"
  | "array"
  | "tuple"
  | "primitive"
  | "literal"
  | "enum"
  | "circular"
  | "timeout";

export interface TypeNode {
  kind: TypeKind;
  name: string;
  typeString: string;
  optional?: boolean;
  readonly?: boolean;
  sourcePath?: string;
  sourceLine?: number;
  children?: TypeNode[];
}

export interface ResolveParams {
  filePath: string;
  position: number;
}

export interface ResolveResult {
  node: TypeNode | null;
}
