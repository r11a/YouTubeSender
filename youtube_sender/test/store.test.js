import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Store } from "../server/store.js";

test("store persists normalized records atomically", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "youtube-sender-"));
  try {
    const store = await new Store(dir).init();
    const contact = await store.create("contacts", "con", { name: "בדיקה", phone: "+972500000000" });
    assert.ok(contact.id.startsWith("con_"));
    const payload = JSON.parse(await readFile(path.join(dir, "youtube-sender.json"), "utf8"));
    assert.equal(payload.contacts[0].name, "בדיקה");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

