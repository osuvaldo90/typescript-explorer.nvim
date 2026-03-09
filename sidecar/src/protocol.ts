export interface Request {
  id: number;
  method: string;
  params: unknown;
}

export interface Response {
  id: number;
  result: unknown;
}

export interface ErrorResponse {
  id: number;
  error: { code: string; message: string };
}
