import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const theme = await readFile(new URL("../public/theme-granite.css", import.meta.url), "utf8");

test("navigation exposes analytics and messages with modern SVG icons", () => {
  assert.match(html, /data-nav="analytics"/);
  assert.match(html, /data-nav="messages"/);
  assert.match(html, /class="app-icon"><svg/);
});

test("mobile top campaign action is handled outside the rendered page", () => {
  assert.match(app, /action=e\.target\.closest\('\[data-action="new-campaign"\]'/);
  assert.match(theme, /\.new-campaign-top\{display:flex!important/);
});

test("video search preserves focus after debounced filtering", () => {
  assert.match(app, /state\.searchTimer=setTimeout/);
  assert.match(app, /input\?\.setSelectionRange/);
});

test("manual delivery, direct contacts and save feedback are wired", () => {
  assert.match(app, /manualSentModal/);
  assert.match(app, /navigator\.contacts\?\.select/);
  assert.match(app, /ההגדרות נשמרו בהצלחה/);
});

test("versioned assets prevent stale Home Assistant caches", () => {
  assert.match(html, /app\.js\?v=0\.2\.2/);
  assert.match(html, /theme-granite\.css\?v=0\.2\.2/);
});

test("real provider connection checks and recommendation UI are wired", () => {
  assert.match(app, /connections\/test/);
  assert.match(app, /ai\/recommendation/);
  assert.match(app, /מחובר וזמין/);
});

test("assisted send previews and confirms the exact recipient", () => {
  assert.match(app, /recipient-preview/);
  assert.match(app, /לפתוח שיחת WhatsApp עם/);
});
