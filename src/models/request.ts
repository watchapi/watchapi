export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export type RequestLike = {
  method: HttpMethod;
  url: string;
  timestamp: number;
};
