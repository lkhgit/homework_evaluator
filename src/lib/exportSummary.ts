import { CONSERVATIVE_READING_WPM, MEAN_READING_WPM, type EngineReport } from "./engine";
import type { FrictionResolution } from "./repairs";
import { revisionCheckMarkdown, type RevisionCheck } from "./revisionCheck";
import type { Analysis, RevisedAssignment } from "./schema";

export interface SummaryMeasurements {
  analysis: Analysis;
  report: EngineReport;
  scoreBefore: number;
  /** The same graph with the accepted repairs applied. The file carries the
   *  revised assignment, so it has to carry the revised assignment's numbers
   *  too — reporting the original's measurements beside the rewritten text
   *  would describe a task the educator is no longer setting. */
  repairedAnalysis: Analysis;
  repairedReport: EngineReport;
  scoreAfter: number;
  frictionResolutions: FrictionResolution[];
  /** Local text comparison of the rewrite, when there is one. */
  revisionCheck?: RevisionCheck | null;
}

/**
 * Builds the file an educator actually takes away: the revised assignment they
 * can paste straight into their LMS, followed by the record of what changed and
 * the measurements behind it, before and after.
 */
/**
 * What the file carries. With no accepted repair the educator's deliverable is
 * their own assignment, unchanged; it is labelled as such rather than passed
 * off as a rewrite, and no model is asked to produce it.
 */
export type SummaryDeliverable =
  | { kind: "revised"; revision: RevisedAssignment }
  | { kind: "original"; title: string; text: string };

const VERDICT_LABEL = {
  comfortable: "여유 있음",
  tight: "빠듯함",
  infeasible: "부족함",
} as const;

export function buildSummary(
  deliverable: SummaryDeliverable,
  objective: string,
  measurements: SummaryMeasurements
): string {
  const { analysis, report, scoreBefore, repairedReport, scoreAfter, frictionResolutions } =
    measurements;
  const lines: string[] = [];

  if (deliverable.kind === "revised") {
    const revised = deliverable.revision;
    lines.push(`# ${revised.title}`, "");
    lines.push("## AI 수정본 (채택한 개선안 반영)", "");
    lines.push(
      "*채택한 개선안을 바탕으로 AI가 다시 쓴 과제입니다. 학생에게 나눠 주기 전에 직접 읽어 보세요. 아래 측정값은 개선안에 적힌 효과 기준으로 계산했습니다. 이 문장을 다시 분석한 결과가 아닙니다. 본문은 원본 과제와 같은 언어로 썼으며 번역하지 않았습니다.*",
      ""
    );
    lines.push(revised.revisedText.trim(), "");
    lines.push("---", "");

    lines.push("## 학습 목표 (교사가 확정함)", "");
    lines.push(objective, "");

    lines.push("## 바뀐 내용과 이유", "");
    if (revised.changes.length === 0) {
      lines.push("바뀐 내용이 없습니다.", "");
    } else {
      for (const change of revised.changes) {
        lines.push(`- **${change.what}**`, `  ${change.why}`, "");
      }
    }
  } else {
    lines.push(`# ${deliverable.title}`, "");
    lines.push("## 원본 과제 (변경 없음)", "");
    lines.push(
      "*채택한 개선안이 없어 분석한 과제를 그대로 담았습니다. 다시 작성한 내용은 없습니다.*",
      ""
    );
    lines.push(deliverable.text.trim(), "");
    lines.push("---", "");

    lines.push("## 학습 목표 (교사가 확정함)", "");
    lines.push(objective, "");

    lines.push("## 바뀐 내용과 이유", "");
    lines.push("채택된 개선안이 없어 과제가 바뀌지 않았습니다.", "");
  }

  const decayCount = (source: EngineReport) =>
    source.memory.carried.filter((item) => item.decayRisk).length;
  const timing = (source: EngineReport) =>
    source.timing.constraints.length === 0
      ? "시간 제한 없음"
      : `${source.timing.constraints.map((constraint) => `${constraint.id}: 단계 ${constraint.stepIds.length}개에 약 ${constraint.requiredMinutesMean}분 필요, 제한 ${constraint.limitMinutes}분 (${VERDICT_LABEL[constraint.verdict]})`).join("; ")}. 과제 전체 약 ${source.timing.requiredMinutesMean}분`;
  const resolutionCount = (status: FrictionResolution["status"]) =>
    frictionResolutions.filter((resolution) => resolution.status === status).length;

  const rows: Array<[string, string, string]> = [
    ["접근성 점수 (100 = 측정된 문제 없음)", `${scoreBefore}/100`, `${scoreAfter}/100`],
    [
      `작업 기억 최고 부하 (용량 약 ${report.memory.capacity}개 청크, Cowan 2001)`,
      `${report.memory.peakLoad}개 항목`,
      `${repairedReport.memory.peakLoad}개 항목`,
    ],
    [
      "환경을 바꿀 때 도움 없이 기억해야 하는 값",
      `${decayCount(report)}개`,
      `${decayCount(repairedReport)}개`,
    ],
    [
      "도구 전환",
      `${report.switching.transitions}회 (환경 ${report.switching.uniqueEnvironments.length}개)`,
      `${repairedReport.switching.transitions}회 (환경 ${repairedReport.switching.uniqueEnvironments.length}개)`,
    ],
    ["시간", timing(report), timing(repairedReport)],
    [
      "문제 지점",
      `${analysis.frictionMoments.length}개`,
      `해소 ${resolutionCount("resolved")}개, 미해소 ${resolutionCount("unresolved")}개, 확인 불가 ${resolutionCount("unverified")}개`,
    ],
  ];

  if (deliverable.kind === "revised" && measurements.revisionCheck) {
    lines.push(...revisionCheckMarkdown(measurements.revisionCheck));
  }

  lines.push("## 측정값 (단계 분석 기준)", "");
  const afterHeading =
    deliverable.kind === "revised" ? "채택한 개선안 반영 (예측)" : "변경 없음 (채택된 개선안 없음)";
  lines.push(`| | 원본 | ${afterHeading} |`, "| --- | --- | --- |");
  for (const [label, before, after] of rows) {
    lines.push(`| ${label} | ${before} | ${after} |`);
  }
  lines.push("");

  lines.push("---", "");
  lines.push(
    "측정값은 모두 작업 구조에서 계산했습니다. 모델이 정한 숫자는 없습니다. 두 번째 열은 위에서 채택한 개선안에 적힌 효과만 단계 분석에 반영한 예측입니다. AI 수정본 문장을 다시 분석한 결과가 아닙니다. 이 수치는 과제 단위의 접근성 문제를 나타내며 법적 준수 여부는 판단하지 않습니다. 모든 결정은 교사가 직접 판단해야 합니다.",
    ""
  );
  lines.push(
    "참고: 단계별 소요 시간은 과제에 적혀 있을 때만 계산합니다. 길이가 적혀 있지 않은 과제는 위 수치보다 오래 걸릴 수 있습니다.",
    "",
    `읽기 시간은 분당 ${MEAN_READING_WPM}단어(Brysbaert 2019, 성인 영어 비문학 묵독 평균)와, 느린 독자를 보수적으로 가정한 분당 ${CONSERVATIVE_READING_WPM}단어로 계산합니다. 한국어 과제의 단어 수는 어절로 센 추정치이고 실제 읽기 속도는 학생의 연령과 언어에 따라 다릅니다. 단계별 부담 수준, 목표 관련성, 심각도 같은 입력에는 AI 판단이 들어갑니다. 점수 가중치는 제품 설계 단계에서 정한 기준이며 연구로 검증한 값은 아닙니다.`,
    ""
  );
  lines.push("AccessLens로 작성했습니다.");

  return lines.join("\n");
}

/** Long enough for any browser to start the download before the URL is released. */
const REVOKE_DELAY_MS = 30_000;

export function downloadSummary(filename: string, contents: string): void {
  downloadFile(filename, contents, "text/markdown;charset=utf-8");
}

export function downloadFile(filename: string, contents: string, type: string): void {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking synchronously after click() can cancel the download in some
  // browsers, so the URL is released once the download has had time to start.
  window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const FILENAME_UNSAFE = /[\u0000-\u001f\u007f<>:"/\\|?*#%]/g;

/**
 * A filename that keeps the title readable in any script. Only characters a
 * filesystem or URL rejects are removed, so a Korean title no longer collapses
 * to a generic name.
 */
function titleSlug(title: string): string {
  const cleaned = title
    .normalize("NFC")
    .replace(FILENAME_UNSAFE, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+/, "");
  // Sliced by code point so a Hangul syllable or emoji is never cut in half.
  let slug = [...cleaned].slice(0, 60).join("").replace(/[-.]+$/, "");
  if (WINDOWS_RESERVED.test(slug)) slug = `${slug}-과제`;
  return slug || "과제";
}

/** The teacher's diagnostic report. */
export function summaryFilename(title: string): string {
  return `${titleSlug(title)}-accesslens.md`;
}

/** The student handout: named for the assignment, not for the tool. */
export function handoutFilename(title: string): string {
  return `${titleSlug(title)}-학생용.html`;
}
