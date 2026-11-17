import test from "node:test";
import assert from "node:assert/strict";
import { readTeacherRequest } from "./teacherRequest";

test("teacher files remain visual model input alongside the separate text", async () => {
  const form = new FormData();
  form.append("assignmentText", "Additional instructions");
  form.append("lockedObjective", "Read the diagram");
  form.append("files", new File([new Uint8Array([137,80,78,71,13,10,26,10])], "diagram.png", { type: "image/png" }));
  const result = await readTeacherRequest(new Request("http://localhost", { method: "POST", headers: { "content-length": "1000" }, body: form }));
  assert.ok(!(result instanceof Response));
  assert.equal((result.body as {assignmentText:string}).assignmentText, "Additional instructions");
  assert.equal(result.files[1].type, "input_image");
});

test("teacher rejects unsupported file bytes", async () => {
  const form = new FormData(); form.append("assignmentText", "notes");
  form.append("files", new File(["not a PDF"], "fake.pdf"));
  const result = await readTeacherRequest(new Request("http://localhost", { method: "POST", headers: { "content-length": "1000" }, body: form }));
  assert.ok(result instanceof Response); assert.equal(result.status, 400);
});
