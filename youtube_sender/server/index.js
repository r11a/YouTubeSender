import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "./store.js";
import { json, now, publicSettings, readBody } from "./lib.js";
import { resolveChannel, syncChannel } from "./youtube.js";
import { providers, prepareDelivery } from "./providers/index.js";
import { generateMessage } from "./ai.js";
import { mergeContacts, parseContacts } from "./importers.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 8099);
const store = await new Store(process.env.DATA_DIR || path.join(ROOT, ".data")).init();
if (process.env.YOUTUBE_API_KEY) store.data.settings.youtubeApiKey = process.env.YOUTUBE_API_KEY;
if (process.env.AI_PROVIDER) store.data.settings.aiProvider = process.env.AI_PROVIDER;
if (process.env.AI_API_KEY) store.data.settings.aiApiKey = process.env.AI_API_KEY;
if (process.env.AI_MODEL) store.data.settings.aiModel = process.env.AI_MODEL;
if (process.env.APP_TIMEZONE) store.data.settings.timezone = process.env.APP_TIMEZONE;
if (process.env.DEFAULT_FRIDAY_TIME) store.data.settings.defaultFridayTime = process.env.DEFAULT_FRIDAY_TIME;

const route = (method, pattern, handler) => ({ method, pattern, handler });
const routes = [];
const add = (...args) => routes.push(route(...args));

add("GET", /^\/api\/bootstrap$/, async (_req, res) => json(res, 200, {
  channels: store.data.channels, videos: store.data.videos, contacts: store.data.contacts, groups: store.data.groups,
  campaigns: store.data.campaigns, deliveries: store.data.deliveries, notifications: store.data.notifications.slice(0, 30),
  syncLogs: store.data.syncLogs.slice(-20).reverse(), providers: Object.values(providers).map(({ buildUrl, ...item }) => item),
  settings: publicSettings(store.data.settings)
}));

add("POST", /^\/api\/channels$/, async (req, res) => {
  const body = await readBody(req); const channelData = await resolveChannel(body.input || "", store.data.settings.youtubeApiKey);
  const existing = store.data.channels.find((item) => item.youtubeId === channelData.youtubeId);
  if (existing) return json(res, 200, existing);
  const channel = await store.create("channels", "chn", { ...channelData, enabled: true }); json(res, 201, channel);
});
add("POST", /^\/api\/channels\/([^/]+)\/sync$/, async (_req, res, match) => {
  const channel = store.get("channels", match[1]); if (!channel) return json(res, 404, { error: "הערוץ לא נמצא" });
  json(res, 200, await syncChannel(store, channel, store.data.settings.youtubeApiKey));
});
add("DELETE", /^\/api\/channels\/([^/]+)$/, async (_req, res, match) => json(res, (await store.remove("channels", match[1])) ? 204 : 404, null));

for (const [resource, prefix] of [["contacts", "con"], ["groups", "grp"], ["campaigns", "cam"]]) {
  add("POST", new RegExp(`^/api/${resource}$`), async (req, res) => json(res, 201, await store.create(resource, prefix, await readBody(req))));
  add("PATCH", new RegExp(`^/api/${resource}/([^/]+)$`), async (req, res, match) => { const item = await store.update(resource, match[1], await readBody(req)); json(res, item ? 200 : 404, item || { error: "לא נמצא" }); });
  add("DELETE", new RegExp(`^/api/${resource}/([^/]+)$`), async (_req, res, match) => json(res, (await store.remove(resource, match[1])) ? 204 : 404, null));
}
add("POST", /^\/api\/contacts\/import$/, async (req, res) => { const body = await readBody(req); const result = mergeContacts(store, parseContacts(body.text || "", body.filename || "")); await store.save(); json(res, 200, result); });

add("PATCH", /^\/api\/videos\/([^/]+)$/, async (req, res, match) => { const item = await store.update("videos", match[1], await readBody(req)); json(res, item ? 200 : 404, item || { error: "הסרטון לא נמצא" }); });
add("POST", /^\/api\/ai\/message$/, async (req, res) => {
  const body = await readBody(req); const video = store.get("videos", body.videoId); if (!video) return json(res, 404, { error: "הסרטון לא נמצא" });
  const message = await generateMessage({ provider: store.data.settings.aiProvider, apiKey: store.data.settings.aiApiKey, model: store.data.settings.aiModel, video, tone: body.tone }); json(res, 200, { message });
});
add("POST", /^\/api\/deliveries\/prepare$/, async (req, res) => {
  const body = await readBody(req); const video = store.get("videos", body.videoId); const contact = store.get("contacts", body.contactId);
  if (!video || !contact) return json(res, 404, { error: "הסרטון או איש הקשר לא נמצאו" });
  const duplicate = store.data.deliveries.find((item) => item.videoId === video.id && item.contactId === contact.id && item.status === "sent");
  const prepared = prepareDelivery(body.provider || "whatsapp", { recipient: contact, subject: body.subject, message: body.message, videoUrl: video.url });
  json(res, 200, { ...prepared, duplicate: duplicate ? { sentAt: duplicate.sentAt, message: duplicate.message } : null });
});
add("POST", /^\/api\/deliveries\/confirm$/, async (req, res) => {
  const body = await readBody(req); const delivery = await store.create("deliveries", "del", { campaignId: body.campaignId || null, videoId: body.videoId, contactId: body.contactId || null, provider: body.provider || "manual", message: body.message || "", status: body.status || "sent", sentAt: body.sentAt || now(), providerMessageId: body.providerMessageId || null, failureReason: body.failureReason || null });
  const video = store.get("videos", body.videoId); if (video) Object.assign(video, { distributionStatus: "sent", latestDeliveryAt: delivery.sentAt });
  await store.save(); json(res, 201, delivery);
});
add("POST", /^\/api\/settings$/, async (req, res) => {
  const body = await readBody(req); for (const key of ["youtubeApiKey", "aiApiKey"]) if (body[key] === "••••••••") delete body[key];
  Object.assign(store.data.settings, body); await store.save(); json(res, 200, publicSettings(store.data.settings));
});
add("POST", /^\/api\/notifications\/read$/, async (_req, res) => { store.data.notifications.forEach((item) => { item.read = true; }); await store.save(); json(res, 200, { ok: true }); });

function dashboard() {
  const sentIds = new Set(store.data.deliveries.filter((item) => item.status === "sent").map((item) => item.videoId));
  return { videos: store.data.videos.length, unsent: store.data.videos.filter((item) => !sentIds.has(item.id)).length, contacts: store.data.contacts.filter((item) => item.active !== false).length, deliveries: store.data.deliveries.filter((item) => item.status === "sent").length, totalViews: store.data.videos.reduce((sum, item) => sum + (item.viewCount || 0), 0), unreadNotifications: store.data.notifications.filter((item) => !item.read).length };
}
add("GET", /^\/api\/dashboard$/, async (_req, res) => json(res, 200, dashboard()));

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
async function staticFile(req, res, pathname) {
  const candidate = path.join(ROOT, "public", pathname === "/" ? "index.html" : pathname);
  const safe = candidate.startsWith(path.join(ROOT, "public"));
  try { if (!safe || !(await stat(candidate)).isFile()) throw new Error(); const data = await readFile(candidate); res.writeHead(200, { "content-type": MIME[path.extname(candidate)] || "application/octet-stream", "cache-control": pathname === "/" ? "no-cache" : "public, max-age=3600" }); res.end(data); }
  catch { const data = await readFile(path.join(ROOT, "public", "index.html")); res.writeHead(200, { "content-type": MIME[".html"], "cache-control": "no-cache" }); res.end(data); }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/health") return json(res, 200, { status: "ok", version: "0.1.2", time: now() });
  try {
    for (const item of routes) { const match = url.pathname.match(item.pattern); if (req.method === item.method && match) return await item.handler(req, res, match, url); }
    if (url.pathname.startsWith("/api/")) return json(res, 404, { error: "הנתיב לא נמצא" });
    return await staticFile(req, res, url.pathname);
  } catch (error) { console.error(error); return json(res, error.status || 500, { error: error.message || "שגיאת שרת" }); }
});
server.listen(PORT, "0.0.0.0", () => console.log(`YouTubeSender listening on ${PORT}`));

const interval = Math.max(1, Number(process.env.SYNC_INTERVAL_HOURS || 24)) * 60 * 60 * 1000;
setInterval(async () => { for (const channel of store.data.channels.filter((item) => item.enabled)) { try { await syncChannel(store, channel, store.data.settings.youtubeApiKey); } catch (error) { await store.create("syncLogs", "sync", { channelId: channel.id, status: "failed", error: error.message, startedAt: now(), finishedAt: now() }); } } }, interval).unref();
