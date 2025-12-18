export type Method =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export interface ActivityItem {
  id: string;
  method: Method;
  url: string;
  timestamp: number;
}
