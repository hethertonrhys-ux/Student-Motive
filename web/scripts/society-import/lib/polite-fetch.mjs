// Fetches pages from students' union websites politely:
// - checks robots.txt first and refuses anything it disallows for us
// - at most one request per second to each website
// - says who we are (user agent with a link and a contact address)
// - keeps every page on disk, so running again doesn't fetch it again

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const USER_AGENT_NAME = "FunctionBot";

export class RobotsDisallowed extends Error {
  constructor(url) {
    super(`robots.txt doesn't allow ${url}`);
    this.url = url;
  }
}

export class FetchFailed extends Error {
  constructor(url, status) {
    super(`${url} answered ${status}${status === 401 || status === 403 ? " (blocked or needs a login)" : ""}`);
    this.url = url;
    this.status = status;
  }
}

// robots.txt rules that apply to us: the group naming FunctionBot, else "*".
// Returns { allow: string[], disallow: string[], crawlDelay: number | null }.
export function parseRobots(text, agent = USER_AGENT_NAME) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "user-agent") {
      if (!lastWasAgent) groups.push((current = { agents: [], allow: [], disallow: [], crawlDelay: null }));
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === "allow" && value) current.allow.push(value);
    else if (key === "disallow" && value) current.disallow.push(value);
    else if (key === "crawl-delay" && Number(value) > 0) current.crawlDelay = Number(value);
  }
  const ours = groups.find((g) => g.agents.includes(agent.toLowerCase())) ?? groups.find((g) => g.agents.includes("*"));
  return ours ?? { allow: [], disallow: [], crawlDelay: null };
}

// Turns a robots.txt path pattern (with * and $) into a test.
function matcher(pattern) {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp("^" + body + (anchored ? "$" : ""));
}

// The longest matching rule wins; Allow wins a tie.
export function robotsAllows(rules, pathAndQuery) {
  let best = { length: -1, allow: true };
  for (const [list, allow] of [[rules.allow, true], [rules.disallow, false]]) {
    for (const pattern of list) {
      if (matcher(pattern).test(pathAndQuery) && (pattern.length > best.length || (pattern.length === best.length && allow))) {
        best = { length: pattern.length, allow };
      }
    }
  }
  return best.allow;
}

export class PoliteFetcher {
  constructor({ contact, cacheDir, minIntervalMs = 1000, log = () => {} }) {
    this.userAgent = `${USER_AGENT_NAME}/1.0 (+https://studentfunction.com; one-off society directory import; ${contact})`;
    this.cacheDir = cacheDir;
    this.minIntervalMs = minIntervalMs;
    this.log = log;
    this.robots = new Map(); // origin -> rules
    this.nextSlot = new Map(); // host -> time the next request may start
    mkdirSync(cacheDir, { recursive: true });
  }

  cachePaths(url) {
    const key = createHash("sha256").update(url).digest("hex").slice(0, 32);
    return { body: join(this.cacheDir, key + ".body"), meta: join(this.cacheDir, key + ".json") };
  }

  // Waits for this website's next free one-second slot.
  async wait(host, crawlDelaySeconds) {
    const gap = Math.max(this.minIntervalMs, (crawlDelaySeconds ?? 0) * 1000);
    const now = Date.now();
    const at = Math.max(now, this.nextSlot.get(host) ?? 0);
    this.nextSlot.set(host, at + gap);
    if (at > now) await new Promise((r) => setTimeout(r, at - now));
  }

  async raw(url, rules) {
    const cached = this.cachePaths(url);
    if (existsSync(cached.meta)) {
      const meta = JSON.parse(readFileSync(cached.meta, "utf8"));
      return { ...meta, body: readFileSync(cached.body), fromCache: true };
    }
    const { host } = new URL(url);
    await this.wait(host, rules?.crawlDelay);
    this.log(`GET ${url}`);
    const res = await fetch(url, { headers: { "User-Agent": this.userAgent, Accept: "*/*" }, redirect: "follow" });
    const body = Buffer.from(await res.arrayBuffer());
    const meta = { url, finalUrl: res.url, status: res.status, contentType: res.headers.get("content-type") ?? "" };
    // Only keep successes (and a missing robots.txt) so failures are retried next time.
    if (res.ok || res.status === 404) {
      writeFileSync(cached.body, body);
      writeFileSync(cached.meta, JSON.stringify(meta));
    }
    return { ...meta, body, fromCache: false };
  }

  async rulesFor(url) {
    const { origin } = new URL(url);
    if (!this.robots.has(origin)) {
      const res = await this.raw(`${origin}/robots.txt`, null);
      // No robots.txt (404) means everything is allowed. Any other failure: don't risk it.
      if (res.status === 404) this.robots.set(origin, { allow: [], disallow: [], crawlDelay: null });
      else if (res.status >= 200 && res.status < 300) this.robots.set(origin, parseRobots(res.body.toString("utf8")));
      else throw new FetchFailed(`${origin}/robots.txt`, res.status);
    }
    return this.robots.get(origin);
  }

  async allowed(url) {
    const u = new URL(url);
    return robotsAllows(await this.rulesFor(url), u.pathname + u.search);
  }

  // Fetches a page (or image) robots.txt allows. Throws otherwise.
  async get(url) {
    const rules = await this.rulesFor(url);
    const u = new URL(url);
    if (!robotsAllows(rules, u.pathname + u.search)) throw new RobotsDisallowed(url);
    const res = await this.raw(url, rules);
    if (res.status < 200 || res.status >= 300) throw new FetchFailed(url, res.status);
    return res;
  }

  async text(url) {
    return (await this.get(url)).body.toString("utf8");
  }
}
