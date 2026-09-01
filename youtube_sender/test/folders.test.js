import test from "node:test";
import assert from "node:assert/strict";
import { inferVideoFolder } from "../server/youtube.js";

test("infers Albania from a video title", () => {
  assert.deepEqual(inferVideoFolder({ title: "Berat Albania from Above" }), { folder: "אלבניה", source: "country" });
});

test("infers Montenegro from title landmarks", () => {
  assert.deepEqual(inferVideoFolder({ title: "Kotor Bay and Virpazar Lake Skadar" }), { folder: "מונטנגרו", source: "country" });
});

test("falls back to the YouTube category when no country is found", () => {
  assert.deepEqual(inferVideoFolder({ title: "Aerial journey", youtubeCategoryId: "19" }), { folder: "טיולים ואירועים", source: "category" });
});
