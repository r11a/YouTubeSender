import { randomUUID } from "node:crypto";

export const now = () => new Date().toISOString();
export const id = (prefix) => `${prefix}_${randomUUID()}`;
export const json = (res, status, value) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(value));
};
export const readBody = async (req, limit = 2_000_000) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error("הבקשה גדולה מדי"), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("JSON לא תקין"), { status: 400 }); }
};
export const cleanPhone = (value = "") => String(value).replace(/[^+\d]/g, "");
export const publicSettings = (settings) => ({
  ...settings,
  youtubeApiKey: settings.youtubeApiKey ? "••••••••" : "",
  aiApiKey: settings.aiApiKey ? "••••••••" : ""
});

