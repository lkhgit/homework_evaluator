import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/references/route";

test("참고 자료 검색은 답변의 인용이 없어도 웹 검색 출처를 반환한다", async t => {
  const url = "https://example.org/diffraction";
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  t.after(() => {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  });

  let output: unknown[] = [{
    type: "web_search_call",
    status: "completed",
    action: { type: "search", sources: [{ type: "url", url }, { type: "url", url }, { type: "url", url: "javascript:void(0)" }] },
  }];
  let status = "incomplete";
  let sent: Record<string, unknown> = {};
  t.mock.method(globalThis, "fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
    sent = JSON.parse(String(init?.body));
    return Response.json({ status, output });
  });

  const search = () => POST(new Request("http://localhost/api/references", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "회절과 간섭: 회절 격자로 파장 측정하기" }),
  }));

  const withSources = await search();
  assert.equal(withSources.status, 200);
  assert.deepEqual(await withSources.json(), { links: [{ title: "example.org", url }] });
  assert.deepEqual(sent.include, ["web_search_call.action.sources"]);

  output = [];
  assert.equal((await search()).status, 502);

  status = "completed";
  output = [{ type: "web_search_call", status: "completed", action: { type: "search", sources: [] } }];
  assert.deepEqual(await (await search()).json(), { links: [] });
});
