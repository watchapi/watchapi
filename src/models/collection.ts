import { HttpMethod } from "./request";

export type CollectionEndpoint = {
  id: string;
  name?: string;
  method: HttpMethod;
  url: string;
  timestamp: number;
};

export type Collection = {
  id: string;
  name: string;
  createdAt: number;
  endpoints: CollectionEndpoint[];
};
