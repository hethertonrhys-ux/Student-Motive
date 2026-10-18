// KCLSU's student groups directory.
//
// Not readable at the moment: kclsu.org answers every request, including
// robots.txt and the sitemap, with a bot check ("Just a moment…", HTTP 403)
// that needs a real browser. We don't work around that, so this uni is
// skipped and reported. If KCLSU opens its directory up (or offers a data
// feed), write the reader here; its site is the same MSL platform as
// LSESU's, so sites/lse.mjs is a good starting point.

export default {
  id: "kcl",
  uni: "KCL",
  su: "KCLSU",
  directory: "https://www.kclsu.org/groups/",

  async collect(fetcher) {
    // Fetching robots.txt is enough to hit the bot check, which the fetcher
    // reports as "answered 403 (blocked or needs a login)".
    await fetcher.allowed(this.directory);
    throw new Error("the site's page layout can't be read behind its bot check");
  },
};
