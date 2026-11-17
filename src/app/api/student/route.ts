import { z } from "zod";
import type { ResponseInputContent } from "openai/resources/responses/responses";
import { getClient, MODEL, describeModelFailure, parseStructured } from "@/lib/openai";
import { studentSchema, STUDENT_INSTRUCTIONS } from "@/lib/studentAnalysis";
import { ANALYSIS_LIMIT, checkRateLimit } from "@/lib/rateLimit";

export const maxDuration = 300;
export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length"));
  if (!length || length > 12_000_000) return Response.json({ error: "자료의 전체 크기는 12MB 이하여야 합니다." }, { status: 413 });
  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "자료를 읽을 수 없습니다." }, { status: 400 });
  const text = form.get("text");
  const files = form.getAll("files");
  if (typeof text !== "string" || text.length > 80_000 || files.length > 8 || (!text.trim() && files.length === 0)) return Response.json({ error: "자료와 추가 글을 확인해 주세요. 파일은 최대 8개입니다." }, { status: 400 });
  const input: ResponseInputContent[] = [{ type: "input_text", text: `추가 글 (출처: 직접 입력):\n${text}` }];
  for (const file of files) {
    if (!(file instanceof File) || file.size > 8_000_000) return Response.json({ error: "파일은 각각 8MB 이하여야 합니다." }, { status: 400 });
    const bytes = Buffer.from(await file.arrayBuffer());
    const pdf = bytes.subarray(0, 5).toString() === "%PDF-";
    const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!pdf && !png && !jpg) return Response.json({ error: `${file.name}: PDF, PNG, JPEG만 지원합니다.` }, { status: 400 });
    const mime = pdf ? "application/pdf" : png ? "image/png" : "image/jpeg";
    const data = `data:${mime};base64,${bytes.toString("base64")}`;
    input.push({ type: "input_text", text: `다음 자료의 파일명: ${file.name}` });
    if (pdf) input.push({ type: "input_file", filename: file.name, file_data: data });
    else input.push({ type: "input_image", image_url: data, detail: "auto" });
  }
  const rate = checkRateLimit(request, "student", ANALYSIS_LIMIT);
  if (!rate.allowed) return Response.json({ error: rate.message }, { status: 429 });
  try {
    const schema = z.toJSONSchema(studentSchema) as Record<string, unknown>;
    delete schema.$schema;
    const response = await getClient().responses.create({ model: MODEL, instructions: STUDENT_INSTRUCTIONS + " requirements에 모든 필수 요구사항을 나열하고 연결된 단계 번호(1부터)를 stepNumbers에, 제출 전 점검에 반영했다면 submissionCheck를 true로 기록한다. 연결하지 못한 조건도 반드시 기록한다.", input: [{ role: "user", content: input }], max_output_tokens: 12000, text: { format: { type: "json_schema", name: "student_guide", strict: true, schema } } });
    const result = parseStructured(studentSchema, response.output_text);
    if (!result) return Response.json({ error: "분석 결과를 읽지 못했습니다. 자료를 나누어 다시 시도해 주세요." }, { status: 502 });
    for (const requirement of result.requirements) {
      if (!requirement.submissionCheck && !requirement.stepNumbers.some(number => number > 0 && number <= result.steps.length)) result.warnings.push(`안내에 연결되지 않은 조건: ${requirement.text}`);
    }
    return Response.json(result);
  } catch (error) {
    console.error("student analysis failed", error);
    const failure = describeModelFailure(error);
    return Response.json({ error: failure.message }, { status: failure.status });
  }
}
