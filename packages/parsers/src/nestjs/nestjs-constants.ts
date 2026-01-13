/**
 * NestJS parser constants
 */

import { HTTP_METHODS } from "../lib/constants";
import type { HttpMethod } from "../lib/constants";

export const NESTJS_CONTROLLER_DECORATOR = "Controller";
export const NESTJS_BODY_DECORATOR = "Body";
export const NESTJS_QUERY_DECORATOR = "Query";
export const NESTJS_HEADER_DECORATOR = "Header";

export const NESTJS_METHOD_DECORATORS: Record<
  string,
  HttpMethod | HttpMethod[]
> = {
  Get: "GET",
  Post: "POST",
  Put: "PUT",
  Patch: "PATCH",
  Delete: "DELETE",
  Options: "OPTIONS",
  Head: "HEAD",
  All: [...HTTP_METHODS],
};
