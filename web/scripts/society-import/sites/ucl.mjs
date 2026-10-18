// Students' Union UCL's public society directory. Each SU's site is laid out differently
// and changes over time, so its reading code lives here on its own.
//
// collect(fetcher, log) returns one record per society (see lib/common.mjs).
// Use fetcher.text(url) for every page: it checks robots.txt, waits a
// second between requests and caches pages.

import { NotReady } from "../lib/common.mjs";

export default {
  id: "ucl",
  uni: "UCL",
  su: "Students' Union UCL",
  directory: "https://studentsunionucl.org/clubs-societies/directory",

  async collect(fetcher) {
    // Checks robots.txt now, so a refusal is reported even before this
    // site's reader is written.
    if (!(await fetcher.allowed(this.directory))) throw new NotReady("robots.txt doesn't allow the society directory");
    throw new NotReady("this site's page layout hasn't been checked yet, so there's no reader for it");
  },
};
