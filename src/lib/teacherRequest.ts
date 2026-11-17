import type { ResponseInputContent } from "openai/resources/responses/responses";

export async function readTeacherRequest(request: Request): Promise<{ body: unknown; files: ResponseInputContent[] } | Response> {
  if (!request.headers.get("content-type")?.includes("multipart/form-data")) return { body: await request.json().catch(() => null), files: [] };
  const length = Number(request.headers.get("content-length"));
  if (!length || length > 12_000_000) return Response.json({ error: "자료의 전체 크기는 12MB 이하여야 합니다." }, { status: 413 });
  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "자료를 읽을 수 없습니다." }, { status: 400 });
  const text = form.get("assignmentText");
  const files = form.getAll("files");
  if (typeof text !== "string" || text.length > 80000 || files.length > 8) return Response.json({ error: "자료와 추가 글을 확인해 주세요." }, { status: 400 });
  const input: ResponseInputContent[] = [];
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
  return { body: { assignmentText: text, lockedObjective: form.get("lockedObjective") }, files: input };
}
