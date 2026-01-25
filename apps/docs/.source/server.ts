// @ts-nocheck
import * as __fd_glob_8 from "../content/docs/cloud/monitoring.mdx?collection=docs"
import * as __fd_glob_7 from "../content/docs/cloud/getting-started.mdx?collection=docs"
import * as __fd_glob_6 from "../content/docs/cloud/api-access.mdx?collection=docs"
import * as __fd_glob_5 from "../content/docs/cloud/alerts.mdx?collection=docs"
import * as __fd_glob_4 from "../content/docs/privacy.mdx?collection=docs"
import * as __fd_glob_3 from "../content/docs/installation.mdx?collection=docs"
import * as __fd_glob_2 from "../content/docs/index.mdx?collection=docs"
import { default as __fd_glob_1 } from "../content/docs/cloud/meta.json?collection=docs"
import { default as __fd_glob_0 } from "../content/docs/meta.json?collection=docs"
import { server } from 'fumadocs-mdx/runtime/server';
import type * as Config from '../source.config';

const create = server<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>({"doc":{"passthroughs":["extractedReferences"]}});

export const docs = await create.docs("docs", "content/docs", {"meta.json": __fd_glob_0, "cloud/meta.json": __fd_glob_1, }, {"index.mdx": __fd_glob_2, "installation.mdx": __fd_glob_3, "privacy.mdx": __fd_glob_4, "cloud/alerts.mdx": __fd_glob_5, "cloud/api-access.mdx": __fd_glob_6, "cloud/getting-started.mdx": __fd_glob_7, "cloud/monitoring.mdx": __fd_glob_8, });