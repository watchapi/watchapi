// @ts-nocheck
import { browser } from 'fumadocs-mdx/runtime/browser';
import type * as Config from '../source.config';

const create = browser<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>();
const browserCollections = {
  docs: create.doc("docs", {"index.mdx": () => import("../content/docs/index.mdx?collection=docs"), "installation.mdx": () => import("../content/docs/installation.mdx?collection=docs"), "privacy.mdx": () => import("../content/docs/privacy.mdx?collection=docs"), "cloud/alerts.mdx": () => import("../content/docs/cloud/alerts.mdx?collection=docs"), "cloud/api-access.mdx": () => import("../content/docs/cloud/api-access.mdx?collection=docs"), "cloud/getting-started.mdx": () => import("../content/docs/cloud/getting-started.mdx?collection=docs"), "cloud/monitoring.mdx": () => import("../content/docs/cloud/monitoring.mdx?collection=docs"), }),
};
export default browserCollections;