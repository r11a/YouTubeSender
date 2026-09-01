import test from "node:test";
import assert from "node:assert/strict";
import { recommendedModel } from "../server/ai.js";

test("selects the economical recommended model for each AI provider", () => {
  assert.equal(recommendedModel("openai"), "gpt-5.6-luna");
  assert.equal(recommendedModel("gemini"), "gemini-3.5-flash-lite");
  assert.equal(recommendedModel("local"), "local");
});
