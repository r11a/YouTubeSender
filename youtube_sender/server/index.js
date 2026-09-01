import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "./store.js";
import { json, now, publicSettings, readBody } from "./lib.js";
import { inferVideoFolder, resolveChannel, syncChannel, testYouTubeConnection } from "./youtube.js";
import { providers, prepareDelivery } from "./providers/index.js";
import { generateContentKit, generateMessage, recommendedModel, testAiConnection } from "./ai.js";
import { mergeContacts, parseContacts } from "./importers.js";
import { contactInSmartGroup, dailyWorkspace, runAutomations } from "./workflow.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 8099);
const store = await new Store(process.env.DATA_DIR || path.join(ROOT, ".data")).init();
let foldersMigrated = false;
for (const video of store.data.videos) {
  if (video.folderSource === "manual") continue;
  const inferred = inferVideoFolder(video);
  if (video.folder !== inferred.folder || video.folderSource !== inferred.source) { video.folder = inferred.folder; video.folderSource = inferred.source; foldersMigrated = true; }
}
if (foldersMigrated) await store.save();
if (process.env.YOUTUBE_API_KEY) store.data.settings.youtubeApiKey = process.env.YOUTUBE_API_KEY;
if (process.env.AI_PROVIDER) store.data.settings.aiProvider = process.env.AI_PROVIDER;
if (process.env.AI_API_KEY) store.data.settings.aiApiKey = process.env.AI_API_KEY;
if (process.env.AI_MODEL) store.data.settings.aiModel = process.env.AI_MODEL;
if (process.env.APP_TIMEZONE) store.data.settings.timezone = process.env.APP_TIMEZONE;
if (process.env.DEFAULT_FRIDAY_TIME) store.data.settings.defaultFridayTime = process.env.DEFAULT_FRIDAY_TIME;
if (process.env.TELEGRAM_BOT_TOKEN) store.data.settings.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
if (process.env.TELEGRAM_CHAT_ID) store.data.settings.telegramChatId = process.env.TELEGRAM_CHAT_ID;
if (process.env.WHATSAPP_TOKEN) store.data.settings.whatsappToken = process.env.WHATSAPP_TOKEN;
if (process.env.WHATSAPP_PHONE_NUMBER_ID) store.data.settings.whatsappPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
if (process.env.MAX_MESSAGES_PER_CONTACT_WEEK) store.data.settings.maxMessagesPerContactWeek = Number(process.env.MAX_MESSAGES_PER_CONTACT_WEEK);

const route = (method, pattern, handler) => ({ method, pattern, handler });
const routes = [];
const add = (...args) => routes.push(route(...args));

add("GET", /^\/api\/bootstrap$/, async (_req, res) => json(res, 200, {
  channels: store.data.channels, videos: store.data.videos, contacts: store.data.contacts, groups: store.data.groups, automations: store.data.automations, tasks: store.data.tasks,
  campaigns: store.data.campaigns, deliveries: store.data.deliveries, notifications: store.data.notifications.slice(0, 30),
  syncLogs: store.data.syncLogs.slice(-20).reverse(), analyticsSnapshots: store.data.analyticsSnapshots, providers: Object.values(providers).map(({ buildUrl, ...item }) => item),
  settings: publicSettings(store.data.settings)
}));
add("GET", /^\/api\/workspace$/, async (_req, res) => json(res, 200, dailyWorkspace(store.data)));
add("GET", /^\/api\/groups\/([^/]+)\/members$/, async (_req, res, match) => { const group=store.get("groups",match[1]); if(!group)return json(res,404,{error:"הקבוצה לא נמצאה"}); json(res,200,store.data.contacts.filter(c=>contactInSmartGroup(c,group,store.data.deliveries))); });

add("POST", /^\/api\/channels$/, async (req, res) => {
  const body = await readBody(req); const channelData = await resolveChannel(body.input || "", store.data.settings.youtubeApiKey);
  const existing = store.data.channels.find((item) => item.youtubeId === channelData.youtubeId);
  if (existing) return json(res, 200, existing);
  const channel = await store.create("channels", "chn", { ...channelData, enabled: true }); json(res, 201, channel);
});
add("POST", /^\/api\/channels\/([^/]+)\/sync$/, async (_req, res, match) => {
  const channel = store.get("channels", match[1]); if (!channel) return json(res, 404, { error: "הערוץ לא נמצא" });
  const before = new Set(store.data.videos.map(v=>v.id)); const result = await syncChannel(store, channel, store.data.settings.youtubeApiKey); const videoIds=store.data.videos.filter(v=>!before.has(v.id)).map(v=>v.id); await runAutomations(store,"video_synced",{videoIds}); json(res, 200, result);
});
add("DELETE", /^\/api\/channels\/([^/]+)$/, async (_req, res, match) => json(res, (await store.remove("channels", match[1])) ? 204 : 404, null));

for (const [resource, prefix] of [["contacts", "con"], ["groups", "grp"], ["campaigns", "cam"], ["automations", "aut"], ["tasks", "tsk"]]) {
  add("POST", new RegExp(`^/api/${resource}$`), async (req, res) => json(res, 201, await store.create(resource, prefix, await readBody(req))));
  add("PATCH", new RegExp(`^/api/${resource}/([^/]+)$`), async (req, res, match) => { const item = await store.update(resource, match[1], await readBody(req)); json(res, item ? 200 : 404, item || { error: "לא נמצא" }); });
  add("DELETE", new RegExp(`^/api/${resource}/([^/]+)$`), async (_req, res, match) => json(res, (await store.remove(resource, match[1])) ? 204 : 404, null));
}
add("POST", /^\/api\/contacts\/import$/, async (req, res) => { const body = await readBody(req); const result = mergeContacts(store, parseContacts(body.text || "", body.filename || "")); await store.save(); json(res, 200, result); });
add("POST", /^\/api\/automations\/run$/, async (req,res)=>{const body=await readBody(req);json(res,200,{results:await runAutomations(store,body.trigger||"manual",{videoIds:body.videoIds||store.data.videos.filter(v=>v.distributionStatus==="new").map(v=>v.id)})})});

add("PATCH", /^\/api\/videos\/([^/]+)$/, async (req, res, match) => { const item = await store.update("videos", match[1], await readBody(req)); json(res, item ? 200 : 404, item || { error: "הסרטון לא נמצא" }); });
add("POST", /^\/api\/videos\/folder$/, async (req, res) => {
  const body = await readBody(req); const videoIds = [...new Set(body.videoIds || [])].slice(0, 100);
  if (!videoIds.length) return json(res, 400, { error: "לא נבחרו סרטונים" });
  if (body.mode !== "auto" && !String(body.folder || "").trim()) return json(res, 400, { error: "יש לבחור או להזין תיקייה" });
  let updated = 0;
  for (const videoId of videoIds) {
    const video = store.get("videos", videoId); if (!video) continue;
    if (body.mode === "auto") { const inferred = inferVideoFolder(video); Object.assign(video, { folder: inferred.folder, folderSource: inferred.source }); }
    else Object.assign(video, { folder: String(body.folder).trim().slice(0, 80), folderSource: "manual" });
    updated++;
  }
  await store.save(); json(res, 200, { updated });
});
add("POST", /^\/api\/ai\/message$/, async (req, res) => {
  const body = await readBody(req); const video = store.get("videos", body.videoId); if (!video) return json(res, 404, { error: "הסרטון לא נמצא" });
  const message = await generateMessage({ provider: store.data.settings.aiProvider, apiKey: store.data.settings.aiApiKey, model: store.data.settings.aiModel, video, tone: body.tone, detailed: body.detailed }); json(res, 200, { message });
});
add("POST", /^\/api\/ai\/messages$/, async (req, res) => {
  const body = await readBody(req); const videoIds = [...new Set(body.videoIds || [])].slice(0, 20);
  if (!videoIds.length) return json(res, 400, { error: "לא נבחרו סרטונים" });
  const messages = [];
  for (const videoId of videoIds) {
    const video = store.get("videos", videoId); if (!video) continue;
    const message = await generateMessage({ provider: store.data.settings.aiProvider, apiKey: store.data.settings.aiApiKey, model: store.data.settings.aiModel, video, tone: body.tone, detailed: true });
    messages.push({ videoId, title: video.title, message });
  }
  json(res, 200, { messages });
});
add("POST", /^\/api\/ai\/content-kit$/, async(req,res)=>{const body=await readBody(req);const video=store.get("videos",body.videoId);if(!video)return json(res,404,{error:"הסרטון לא נמצא"});json(res,200,await generateContentKit({provider:store.data.settings.aiProvider,apiKey:store.data.settings.aiApiKey,model:store.data.settings.aiModel,video,tone:body.tone||"professional"}))});
add("POST", /^\/api\/deliveries\/prepare$/, async (req, res) => {
  const body = await readBody(req); const video = store.get("videos", body.videoId); const contact = store.get("contacts", body.contactId);
  if (!video || !contact) return json(res, 404, { error: "הסרטון או איש הקשר לא נמצאו" });
  const duplicate = store.data.deliveries.find((item) => item.videoId === video.id && item.contactId === contact.id && item.status === "sent");
  const prepared = prepareDelivery(body.provider || "whatsapp", { recipient: contact, subject: body.subject, message: body.message, videoUrl: video.url });
  const weekAgo=Date.now()-7*86400000;const recent=store.data.deliveries.filter(d=>d.contactId===contact.id&&d.status==="sent"&&new Date(d.sentAt).getTime()>weekAgo).length;const max=Number(store.data.settings.maxMessagesPerContactWeek||3);
  json(res, 200, { ...prepared, recipient: { name: contact.name, phone: contact.phone, email: contact.email }, duplicate: duplicate ? { sentAt: duplicate.sentAt, message: duplicate.message } : null, frequencyWarning:recent>=max?`איש הקשר כבר קיבל ${recent} הודעות השבוע`:null });
});
add("POST", /^\/api\/deliveries\/confirm$/, async (req, res) => {
  const body = await readBody(req); const delivery = await store.create("deliveries", "del", { campaignId: body.campaignId || null, videoId: body.videoId, contactId: body.contactId || null, provider: body.provider || "manual", message: body.message || "", status: body.status || "sent", sentAt: body.sentAt || now(), providerMessageId: body.providerMessageId || null, failureReason: body.failureReason || null });
  const video = store.get("videos", body.videoId); if (video) Object.assign(video, { distributionStatus: "sent", latestDeliveryAt: delivery.sentAt });
  await store.save(); json(res, 201, delivery);
});
add("POST", /^\/api\/settings$/, async (req, res) => {
  const body = await readBody(req); for (const key of ["youtubeApiKey", "aiApiKey", "telegramBotToken", "whatsappToken"]) if (body[key] === "••••••••") delete body[key];
  Object.assign(store.data.settings, body); await store.save(); json(res, 200, publicSettings(store.data.settings));
});
add("POST", /^\/api\/connections\/test$/, async (req, res) => {
  const body = await readBody(req);
  if (body.service === "youtube") return json(res, 200, await testYouTubeConnection(store.data.settings.youtubeApiKey));
  if (body.service === "ai") return json(res, 200, await testAiConnection({ provider: store.data.settings.aiProvider, apiKey: store.data.settings.aiApiKey, model: store.data.settings.aiModel }));
  return json(res, 400, { error: "שירות לא מוכר" });
});
add("GET", /^\/api\/ai\/recommendation$/, async (_req, res, _match, url) => {
  const provider = url.searchParams.get("provider") || store.data.settings.aiProvider;
  json(res, 200, { provider, model: recommendedModel(provider), automatic: true });
});
add("POST", /^\/api\/providers\/test$/, async (req,res)=>{const body=await readBody(req);if(body.provider==="telegram"){if(!store.data.settings.telegramBotToken)throw new Error("Telegram Bot Token לא הוגדר");const response=await fetch(`https://api.telegram.org/bot${store.data.settings.telegramBotToken}/getMe`);const data=await response.json();if(!data.ok)throw new Error(data.description||"חיבור Telegram נכשל");return json(res,200,{ok:true,message:`Telegram מחובר כ־${data.result.username}`})}if(body.provider==="whatsapp_business"){if(!store.data.settings.whatsappToken||!store.data.settings.whatsappPhoneNumberId)throw new Error("פרטי WhatsApp Business לא הוגדרו");const response=await fetch(`https://graph.facebook.com/v23.0/${store.data.settings.whatsappPhoneNumberId}`,{headers:{authorization:`Bearer ${store.data.settings.whatsappToken}`}});if(!response.ok)throw new Error("חיבור WhatsApp Business נכשל");return json(res,200,{ok:true,message:"WhatsApp Business מחובר"})}json(res,200,{ok:true,message:"ספק השליחה המסייע זמין"})});
add("GET", /^\/api\/backup$/, async (_req,res)=>json(res,200,{format:"youtube-sender-backup",version:2,exportedAt:now(),data:store.data}));
add("POST", /^\/api\/backup\/restore$/, async(req,res)=>{const body=await readBody(req);if(body.format!=="youtube-sender-backup"||!body.data) return json(res,400,{error:"קובץ גיבוי אינו תקין"});store.data={...store.data,...body.data,settings:{...store.data.settings,...body.data.settings},schemaVersion:2};await store.save();json(res,200,{ok:true})});
add("GET", /^\/api\/diagnostics$/, async(_req,res)=>json(res,200,{version:"0.6.0",schemaVersion:store.data.schemaVersion,counts:Object.fromEntries(["channels","videos","contacts","groups","campaigns","deliveries","automations","tasks"].map(k=>[k,store.data[k].length])),connections:{youtube:Boolean(store.data.settings.youtubeApiKey),ai:store.data.settings.aiProvider==="local"||Boolean(store.data.settings.aiApiKey),telegram:Boolean(store.data.settings.telegramBotToken),whatsappBusiness:Boolean(store.data.settings.whatsappToken&&store.data.settings.whatsappPhoneNumberId)},lastSync:store.data.syncLogs.at(-1)||null}));
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
  try { if (!safe || !(await stat(candidate)).isFile()) throw new Error(); const data = await readFile(candidate); const dynamicAsset = /\.(?:html|js|css|webmanifest)$/.test(candidate) || pathname.endsWith("sw.js"); res.writeHead(200, { "content-type": MIME[path.extname(candidate)] || "application/octet-stream", "cache-control": dynamicAsset ? "no-cache, must-revalidate" : "public, max-age=3600" }); res.end(data); }
  catch { const data = await readFile(path.join(ROOT, "public", "index.html")); res.writeHead(200, { "content-type": MIME[".html"], "cache-control": "no-cache" }); res.end(data); }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/health") return json(res, 200, { status: "ok", version: "0.6.0", time: now() });
  try {
    for (const item of routes) { const match = url.pathname.match(item.pattern); if (req.method === item.method && match) return await item.handler(req, res, match, url); }
    if (url.pathname.startsWith("/api/")) return json(res, 404, { error: "הנתיב לא נמצא" });
    return await staticFile(req, res, url.pathname);
  } catch (error) { console.error(error); return json(res, error.status || 500, { error: error.message || "שגיאת שרת" }); }
});
server.listen(PORT, "0.0.0.0", () => console.log(`YouTubeSender listening on ${PORT}`));

const interval = Math.max(1, Number(process.env.SYNC_INTERVAL_HOURS || 24)) * 60 * 60 * 1000;
setInterval(async () => { for (const channel of store.data.channels.filter((item) => item.enabled)) { try { await syncChannel(store, channel, store.data.settings.youtubeApiKey); } catch (error) { await store.create("syncLogs", "sync", { channelId: channel.id, status: "failed", error: error.message, startedAt: now(), finishedAt: now() }); } } }, interval).unref();
