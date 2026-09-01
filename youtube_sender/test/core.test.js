import test from "node:test";
import assert from "node:assert/strict";
import { parseContacts, mergeContacts } from "../server/importers.js";
import { prepareDelivery } from "../server/providers/index.js";

test("imports Android/iPhone vCard contacts", () => {
  const contacts = parseContacts("BEGIN:VCARD\nVERSION:3.0\nFN:ישראל ישראלי\nTEL;TYPE=CELL:+972-50-123-4567\nEMAIL:test@example.com\nEND:VCARD", "contacts.vcf");
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].phone, "+972501234567");
  assert.equal(contacts[0].name, "ישראל ישראלי");
});

test("imports Hebrew CSV and ignores empty rows", () => {
  const contacts = parseContacts("שם,טלפון,דוא״ל\nדנה,050-000-0000,dana@example.com\n,,", "contacts.csv");
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].name, "דנה");
});

test("deduplicates imported contacts", () => {
  const store = { data: { contacts: [{ id: "1", name: "קיים", phone: "+972501234567", email: "" }] } };
  const result = mergeContacts(store, [{ name: "כפול", phone: "+972501234567", email: "" }, { name: "חדש", phone: "+972509999999", email: "" }]);
  assert.deepEqual(result, { imported: 1, skipped: 1 });
});

test("builds encoded assisted delivery links", () => {
  const result = prepareDelivery("whatsapp", { recipient: { phone: "+972 50-123-4567" }, message: "שלום עולם" });
  assert.match(result.launchUrl, /^https:\/\/wa\.me\/972501234567\?text=/);
  assert.equal(result.mode, "assisted");
});

test("normalizes a local Israeli mobile number for WhatsApp", () => {
  const result = prepareDelivery("whatsapp", { recipient: { phone: "050-123-4567" }, message: "בדיקה" });
  assert.match(result.launchUrl, /^https:\/\/wa\.me\/972501234567\?text=/);
});

test("rejects an invalid WhatsApp phone number", () => {
  assert.throws(() => prepareDelivery("whatsapp", { recipient: { phone: "123" }, message: "בדיקה" }), /אינו תקין/);
});
