import assert from "node:assert/strict";
import { test } from "node:test";

import { STANDARDS, shortCitation } from "./standards";

test("working memory cites Redundant Entry first", () => {
  assert.equal(shortCitation("working_memory"), "WCAG 3.3.7 Redundant Entry (Level A)");
  assert.equal(
    STANDARDS.working_memory.wcag[0].url,
    "https://www.w3.org/WAI/WCAG22/Understanding/redundant-entry.html"
  );
});

test("context switching cites cognitive guidance, not Consistent Navigation", () => {
  assert.match(shortCitation("context_switching"), /^W3C COGA: 목표 5/);
  assert.ok(STANDARDS.context_switching.wcag.every((criterion) => criterion.id !== "3.2.3"));
});

test("audio-only material cites 1.2.1 before captions", () => {
  assert.match(shortCitation("sensory_audio_only"), /^WCAG 1\.2\.1 /);
});

test("the timer citation carries the essential-purpose exception", () => {
  assert.match(STANDARDS.time_pressure.exception ?? "", /2\.2\.1 예외/);
});

test("UDL entries name 3.0 considerations", () => {
  for (const [type, entry] of Object.entries(STANDARDS)) {
    for (const label of entry.udl) {
      assert.match(label, /^고려사항 \d\.\d: /, `${type}: ${label}`);
    }
  }
});
