import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { id, now } from "./lib.js";

const EMPTY = {
  schemaVersion: 1,
  channels: [], videos: [], contacts: [], groups: [], campaigns: [], deliveries: [], syncLogs: [], notifications: [],
  settings: { locale: "he", timezone: "Asia/Jerusalem", defaultFridayTime: "09:00", aiProvider: "local", aiModel: "gpt-5-mini", youtubeApiKey: "", aiApiKey: "" }
};

export class Store {
  constructor(dir) { this.dir = dir; this.file = path.join(dir, "youtube-sender.json"); this.data = structuredClone(EMPTY); this.queue = Promise.resolve(); }
  async init() {
    await mkdir(this.dir, { recursive: true });
    try { this.data = { ...structuredClone(EMPTY), ...JSON.parse(await readFile(this.file, "utf8")) }; }
    catch (error) { if (error.code !== "ENOENT") throw error; await this.save(); }
    return this;
  }
  async save() {
    const write = async () => {
      const temp = `${this.file}.tmp`;
      await writeFile(temp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
      await rename(temp, this.file);
    };
    this.queue = this.queue.then(write, write);
    return this.queue;
  }
  list(name) { return this.data[name] ?? []; }
  get(name, recordId) { return this.list(name).find((item) => item.id === recordId); }
  async create(name, prefix, values) {
    const record = { id: id(prefix), ...values, createdAt: now(), updatedAt: now() };
    this.data[name].push(record); await this.save(); return record;
  }
  async update(name, recordId, values) {
    const record = this.get(name, recordId);
    if (!record) return null;
    Object.assign(record, values, { id: record.id, updatedAt: now() }); await this.save(); return record;
  }
  async remove(name, recordId) {
    const before = this.data[name].length;
    this.data[name] = this.data[name].filter((item) => item.id !== recordId);
    if (this.data[name].length !== before) await this.save();
    return before !== this.data[name].length;
  }
}

