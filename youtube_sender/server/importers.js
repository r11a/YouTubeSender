import { cleanPhone, id, now } from "./lib.js";

const csvLine = (line) => line.match(/("(?:[^"]|"")*"|[^,]*)/g).filter((value) => value !== "").map((value) => value.replace(/^"|"$/g, "").replace(/""/g, '"').trim());
export function parseContacts(text, filename = "") {
  if (filename.toLowerCase().endsWith(".vcf") || /BEGIN:VCARD/i.test(text)) {
    return text.split(/END:VCARD/i).map((card) => ({
      name: card.match(/(?:^|\n)FN[^:]*:(.*)/i)?.[1]?.trim() || "ללא שם",
      phone: cleanPhone(card.match(/(?:^|\n)TEL[^:]*:(.*)/i)?.[1]),
      email: card.match(/(?:^|\n)EMAIL[^:]*:(.*)/i)?.[1]?.trim() || ""
    })).filter((item) => item.phone || item.email);
  }
  const lines = text.trim().split(/\r?\n/); const headers = csvLine(lines.shift() || "").map((header) => header.toLowerCase());
  return lines.map((line) => { const values = csvLine(line); const get = (...names) => values[headers.findIndex((header) => names.includes(header))] || ""; return { name: get("name", "שם") || "ללא שם", phone: cleanPhone(get("phone", "טלפון", "mobile")), email: get("email", "דוא״ל", "דואל"), groups: get("groups", "קבוצות").split(/[;|]/).filter(Boolean) }; }).filter((item) => item.phone || item.email);
}
export function mergeContacts(store, contacts) {
  let imported = 0, skipped = 0;
  for (const contact of contacts) {
    if (store.data.contacts.some((item) => (contact.phone && item.phone === contact.phone) || (contact.email && item.email === contact.email))) { skipped += 1; continue; }
    store.data.contacts.push({ id: id("con"), ...contact, active: true, groupIds: [], createdAt: now(), updatedAt: now() }); imported += 1;
  }
  return { imported, skipped };
}

