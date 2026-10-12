// Stand-in for the ConGenEng content engine during e2e runs: same endpoints and HMAC signing as the real one, but it
// answers instantly with canned results and calls the app back the way the engine does. No OpenAI calls, no cost.
//
//   POST /v1/generate               → { job_id }, then a signed callback with drafts, insights, competitors
//   POST /v1/competitors/discover   → { competitors }
//   POST /v1/video/proposal         → { job_id }, then a signed callback with three concepts
//   POST /v1/video/build            → { job_id }, then a signed callback with the film (served from /media)
//   GET  /v1/jobs/:id               → still running (callbacks are the delivery path)
//   GET  /media/:file               → files from public/images/doodle (imported by the app as generated media)
//   GET  /__requests                → every signed request received, for assertions
import { createHmac, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { basename, join } from "node:path";

const PORT = Number(process.env.ENGINE_PORT ?? 8799);
const SECRET = process.env.ENGINE_SECRET ?? "";
const SELF = `http://127.0.0.1:${PORT}`;
const MEDIA_DIR = join(process.cwd(), "public", "images", "doodle");

const received = [];
let seq = 0;

const sign = (ts, body) => createHmac("sha256", SECRET).update(`${ts}.${body}`).digest("hex");

function verified(req, body) {
  const ts = req.headers["x-timestamp"];
  const sig = req.headers["x-signature"];
  if (!ts || !sig) return false;
  const want = Buffer.from(sign(ts, body));
  const got = Buffer.from(String(sig));
  return want.length === got.length && timingSafeEqual(want, got);
}

/** Delivers a result the way the engine does; retries while `next dev` is still compiling the route. */
async function callback(url, result) {
  await new Promise((r) => setTimeout(r, 1500));
  const body = JSON.stringify(result);
  for (let attempt = 1; attempt <= 8; attempt++) {
    const ts = Math.floor(Date.now() / 1000).toString();
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Timestamp": ts, "X-Signature": sign(ts, body) },
        body,
      });
      if (res.ok) return;
      console.error(`[stub-engine] callback ${res.status}: ${(await res.text()).slice(0, 300)}`);
    } catch (e) {
      console.error(`[stub-engine] callback failed: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

const inDays = (n) => new Date(Date.now() + n * 864e5).toISOString();

function generationResult(req, jobId) {
  const drafts = [];
  for (const row of req.post_plan ?? []) {
    for (const platform of row.platforms) {
      for (let i = 1; i <= row.count; i++) {
        drafts.push({
          platform,
          content: `E2E ${row.type} draft ${i} for ${platform}: what your HDB flat is really worth this quarter.`,
          title: `E2E ${row.type} idea ${i}`,
          hashtags: ["SGProperty", "HDB"],
          suggested_time: inDays(2 + i),
          rationale: "Valuation posts outperform listing posts in this niche (stub engine).",
          idea: { post_type: row.type, title: `E2E ${row.type} idea ${i}`, topic: "HDB valuations", hook: "Your flat is worth more than you think" },
          media: row.type === "image" ? [{ url: `${SELF}/media/house-still.webp`, mime: "image/webp", kind: "image" }] : [],
        });
      }
    }
  }
  return {
    job_ref: req.job_ref,
    job_id: jobId,
    status: "succeeded",
    drafts,
    competitors: [{ name: "E2E Rival Realty", website: "https://rival.example.com", top_topics: ["condo launches"], posting_frequency: "3x a week", why: "Same audience" }],
    insights: {
      summary: "E2E insight: valuation explainers get twice the engagement of listing posts.",
      best_formats: [{ format: "image" }],
      best_topics: [{ topic: "HDB valuations" }],
      best_times: [{ label: "Tue 7pm" }],
      cost: {
        total_usd: 0.0123,
        seconds: 42,
        stages: [
          { stage: "research", calls: 2, input_tokens: 1000, cached_tokens: 0, output_tokens: 200, usd: 0.01 },
          { stage: "copywriting", calls: 1, input_tokens: 500, cached_tokens: 0, output_tokens: 300, usd: 0.0023 },
        ],
        videos: {},
      },
    },
  };
}

const concept = (key, title, script) => ({
  key,
  title,
  format: "problem_solution",
  hook_angle: "curiosity",
  central_idea: `${title}: a homeowner checks their flat's value in seconds.`,
  motif: "The postal code field",
  hook: "A postal code typed in one breath",
  script,
  beats: [{ line: 0, headline: "Know your price", accent: "price", visual: "type", picture: "Big type over the hero", carry: "Cut to the widget" }],
  capture: [{ name: "home", url: "/", viewport: "desktop", purpose: "Hero and valuation widget" }],
  post_caption: `${title} caption`,
});

function proposalResult(req, jobId) {
  return {
    kind: "video_proposal",
    job_ref: req.job_ref,
    job_id: jobId,
    status: "succeeded",
    insights: { cost: { total_usd: 0.05 } },
    video_proposal: {
      length_s: req.length_s,
      voice_mode: req.voice_mode,
      research: { pages: 5, signed_in_as: [], blocked_writes: 0 },
      screens: [],
      voices: [{ voice: "af_heart", url: `${SELF}/media/none.wav` }],
      treatment: {
        product_summary: "PropertyPro AI gives Singapore homeowners an instant valuation, then a personal agent.",
        story: "From a postal code to a confident asking price.",
        recommended: "alpha",
        recommended_why: "Clearest promise in the first second.",
        concepts: [
          concept("alpha", "E2E Concept Alpha", ["What is your flat worth today?", "Type your postal code and see it in seconds."]),
          concept("beta", "E2E Concept Beta", ["Selling soon? Start with the numbers."]),
          concept("gamma", "E2E Concept Gamma", ["Upgrade with confidence."]),
        ],
        disclosures: [],
        risks: [],
      },
    },
  };
}

function buildResult(req, jobId) {
  return {
    kind: "video_build",
    job_ref: req.job_ref,
    job_id: jobId,
    status: "succeeded",
    insights: { cost: { total_usd: 0.4 } },
    video: {
      url: `${SELF}/media/house-draw.mp4`,
      duration: 12,
      size: [1080, 1920],
      qa_pass: true,
      voice_mode: "voiceover",
      post_caption: "E2E film caption",
      capture: { screens: 4, blocked_writes: 2, failed: [] },
      disclosures: [],
    },
  };
}

const json = (res, status, data) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", SELF);
  let body = "";
  for await (const chunk of req) body += chunk;

  if (req.method === "GET" && url.pathname === "/__health") return json(res, 200, { ok: true });
  if (req.method === "GET" && url.pathname === "/__requests") return json(res, 200, received);
  if (req.method === "GET" && url.pathname.startsWith("/media/")) {
    try {
      const file = await readFile(join(MEDIA_DIR, basename(url.pathname)));
      res.writeHead(200, { "Content-Type": url.pathname.endsWith(".mp4") ? "video/mp4" : "image/webp" });
      return res.end(file);
    } catch {
      return json(res, 404, { error: "no such media" });
    }
  }

  if (!verified(req, body)) return json(res, 401, { error: "bad signature" });
  const payload = body ? JSON.parse(body) : null;
  received.push({ method: req.method, path: url.pathname, payload });

  if (req.method === "GET" && url.pathname.startsWith("/v1/jobs/")) {
    return json(res, 200, { status: "running", stage: "research", progress: 0.5, error: null, result: null, cost_usd: 0.01 });
  }
  if (req.method !== "POST") return json(res, 404, { error: "not found" });

  const jobId = `stub-${++seq}`;
  switch (url.pathname) {
    case "/v1/generate":
      json(res, 200, { job_id: jobId });
      return void callback(payload.callback_url, generationResult(payload, jobId));
    case "/v1/competitors/discover":
      return json(res, 200, {
        competitors: [
          { name: "E2E Discovered Agency", website: "https://discovered.example.com", handles: { instagram: "@discovered" }, top_topics: ["HDB upgrading"], posting_frequency: "daily", why: "Ranks for HDB valuation searches" },
        ],
      });
    case "/v1/video/proposal":
      json(res, 200, { job_id: jobId });
      return void callback(payload.callback_url, proposalResult(payload, jobId));
    case "/v1/video/build":
      json(res, 200, { job_id: jobId });
      return void callback(payload.callback_url, buildResult(payload, jobId));
    default:
      return json(res, 404, { error: "not found" });
  }
}).listen(PORT, "127.0.0.1", () => console.log(`[stub-engine] listening on ${SELF}`));
