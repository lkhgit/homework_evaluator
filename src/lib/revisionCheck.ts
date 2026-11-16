import { CONSERVATIVE_READING_WPM, MEAN_READING_WPM } from "./engine";
import { normalizeEvidence } from "./evidenceGuard";
import { timeConstraintChangesOf, type Step, type TimeConstraint } from "./schemaTypes";

/**
 * Checks run locally on the rewritten text itself, without a model.
 *
 * They are deliberately narrow. Each one reports only what string comparison
 * can establish; anything that needs understanding is reported as "teacher
 * check" rather than guessed. None of this re-measures the task graph: the
 * resolution figures elsewhere remain projections from declared effects.
 */

export interface TextLength {
  characters: number;
  /** Whitespace-separated words (어절 for Korean). */
  words: number;
  readingMinutesMean: number;
  readingMinutesConservative: number;
}

export type KeywordStatus = "kept" | "missing";

export interface KeywordCheck {
  keyword: string;
  status: KeywordStatus;
}

export type RepairCheckStatus =
  /** A specific, detectable trace of the change is in the revision. */
  | "detected"
  /** A detectable sign the change was not made, e.g. the sentence is unchanged. */
  | "not_detected"
  /** Text comparison cannot tell; the teacher must read it. */
  | "teacher_check";

export interface RepairCheck {
  stepId: string;
  action: string;
  status: RepairCheckStatus;
  detail: string;
}

export interface RevisionCheck {
  identical: boolean;
  original: TextLength;
  revised: TextLength;
  /** Objective words found in the original, and whether the revision keeps them. */
  keywords: KeywordCheck[];
  /** Numbers in the original that no longer appear in the revision. */
  missingNumbers: string[];
  repairs: RepairCheck[];
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

export function measureText(text: string): TextLength {
  // NFC first: decomposed Hangul (e.g. from macOS) would otherwise count each jamo.
  const trimmed = text.normalize("NFC").trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  return {
    characters: [...trimmed].length,
    words,
    readingMinutesMean: round(words / MEAN_READING_WPM),
    readingMinutesConservative: round(words / CONSERVATIVE_READING_WPM),
  };
}

const ENGLISH_STOPWORDS = new Set(
  "the and for with from into onto that this these those their them they its can will able how what when where which who whom why are was were been being has have had does did not but about across over under between within without your you our students student explain describe identify understand demonstrate apply analyze analyse interpret use using show learn".split(
    " "
  )
);

// Particles and endings stripped from the end of a Korean 어절 so the stem can
// be found inside other inflections ("농도가" and "농도를" both contain "농도").
const KOREAN_SUFFIXES = [
  "에서는", "으로써", "에서", "으로", "에게", "까지", "부터", "하고", "하여", "하기", "하는", "한다", "합니다", "하시오", "하세요",
  "을", "를", "이", "가", "은", "는", "에", "의", "와", "과", "도", "만", "로", "고",
];
const KOREAN_STOPWORDS = new Set(["설명", "이해", "학생", "있다", "수", "것", "등", "및", "통해", "대한", "대해",
  // Connective and verb stems that carry no subject matter ("막을 통한", "영향을 미치는").
  "통한", "위한", "위해", "따른", "따라", "관한", "관해", "의한", "미치", "미친", "있는", "되는"]);

function koreanStem(token: string): string {
  for (const suffix of KOREAN_SUFFIXES) {
    if (token.length - suffix.length >= 2 && token.endsWith(suffix)) return token.slice(0, -suffix.length);
  }
  return token;
}

/**
 * Content words of the objective. A lexical proxy only: it can notice that a
 * term disappeared, never that a concept is still taught.
 */
export function objectiveKeywords(objective: string): string[] {
  const keywords = new Set<string>();
  for (const raw of objective.normalize("NFC").toLowerCase().split(/[^\p{L}\p{N}-]+/u)) {
    const token = raw.replace(/^-+|-+$/g, "");
    if (!token) continue;
    if (/\p{Script=Hangul}/u.test(token)) {
      const stem = koreanStem(token);
      if (stem.length >= 2 && !KOREAN_STOPWORDS.has(stem)) keywords.add(stem);
    } else if (/^[a-z][a-z-]*$/.test(token) && token.length >= 4 && !ENGLISH_STOPWORDS.has(token)) {
      keywords.add(token);
    }
  }
  return [...keywords];
}

function containsKeyword(text: string, keyword: string): boolean {
  const haystack = text.normalize("NFC").toLowerCase();
  if (/\p{Script=Hangul}/u.test(keyword)) return haystack.includes(keyword);
  // English: match a word that starts with the stem, so "gradients" in the
  // objective also finds "gradient" in the text and the reverse.
  const stem = keyword.length > 5 ? keyword.replace(/(?:es|s)$/, "") : keyword;
  return new RegExp(`(^|[^\\p{L}])${stem.replace(/-/g, "\\-")}`, "u").test(haystack);
}

function numbersIn(text: string): Set<string> {
  return new Set(text.match(/\d+(?:[.,]\d+)?/g) ?? []);
}

function includesNormalized(text: string, fragment: string): boolean {
  const needle = normalizeEvidence(fragment);
  return needle.length > 0 && normalizeEvidence(text).includes(needle);
}

function repairCheck(
  step: Step,
  originalText: string,
  revisedText: string,
  timeConstraints: readonly TimeConstraint[]
): RepairCheck {
  const base = { stepId: step.id, action: step.action };
  const effects = step.repair?.effects;
  const change = effects ? timeConstraintChangesOf(effects)[0] : undefined;

  if (change) {
    const timer = timeConstraints.find((constraint) => constraint.id === change.constraintId);
    if (change.action === "set_limit" && change.limitMinutes !== null) {
      const stated = numbersIn(revisedText).has(String(change.limitMinutes));
      return {
        ...base,
        status: stated ? "detected" : "not_detected",
        detail: stated
          ? `새 제한 시간 숫자(${change.limitMinutes})가 수정본에 있습니다. 문맥은 직접 확인하세요.`
          : `새 제한 시간 숫자(${change.limitMinutes})가 수정본에 없습니다.`,
      };
    }
    if (change.action === "remove" && timer?.evidence && includesNormalized(originalText, timer.evidence)) {
      const stillThere = includesNormalized(revisedText, timer.evidence);
      return {
        ...base,
        status: stillThere ? "not_detected" : "teacher_check",
        detail: stillThere
          ? "원본의 시간 제한 문장이 수정본에 그대로 남아 있습니다."
          : "원본의 시간 제한 문장은 바뀌었습니다. 제한이 실제로 없어졌는지는 직접 확인하세요.",
      };
    }
  }

  // The step's own source sentence, unchanged, is a reliable sign that this
  // part of the text was not edited; a changed sentence proves nothing more.
  if (step.evidence && includesNormalized(originalText, step.evidence) && includesNormalized(revisedText, step.evidence)) {
    return {
      ...base,
      status: "teacher_check",
      detail: "이 단계의 원문 문장이 수정본에 그대로 있습니다. 개선 내용이 다른 곳에 들어갔는지 직접 확인하세요.",
    };
  }
  return {
    ...base,
    status: "teacher_check",
    detail: "이 개선안이 반영됐는지는 문장 비교만으로 알 수 없습니다. 직접 읽어 보세요.",
  };
}

export function checkRevision(input: {
  originalText: string;
  revisedText: string;
  objective: string;
  acceptedSteps: readonly Step[];
  timeConstraints: readonly TimeConstraint[];
}): RevisionCheck {
  const { originalText, revisedText } = input;
  const revisedNumbers = numbersIn(revisedText);
  return {
    identical: normalizeEvidence(originalText) === normalizeEvidence(revisedText),
    original: measureText(originalText),
    revised: measureText(revisedText),
    keywords: objectiveKeywords(input.objective)
      // Only words the original used can be "lost"; others say nothing.
      .filter((keyword) => containsKeyword(originalText, keyword))
      .map((keyword) => ({
        keyword,
        status: containsKeyword(revisedText, keyword) ? "kept" : "missing",
      })),
    missingNumbers: [...numbersIn(originalText)].filter((number) => !revisedNumbers.has(number)),
    repairs: input.acceptedSteps
      .filter((step) => step.repair !== null)
      .map((step) => repairCheck(step, originalText, revisedText, input.timeConstraints)),
  };
}

/** Markdown section for the teacher report. Every line says what kind of check it is. */
export function revisionCheckMarkdown(check: RevisionCheck): string[] {
  const lines: string[] = ["## 수정본 문장 점검 (로컬 비교, 모델 호출 없음)", ""];
  lines.push(
    "*원본과 수정본 문장을 코드로 비교한 결과입니다. 단계 분석을 다시 측정한 것이 아니며 의미나 학습 목표가 보존됐는지도 판단하지 않습니다.*",
    ""
  );
  if (check.identical) lines.push("- 수정본이 원본과 같습니다 (공백·대소문자 차이 제외).");
  lines.push(
    `- 길이: ${check.original.words} → ${check.revised.words}단어, ${check.original.characters} → ${check.revised.characters}자 (정확한 수치)`,
    `- 본문 읽기 시간 추정: 약 ${check.original.readingMinutesMean} → ${check.revised.readingMinutesMean}분, 느린 독자 기준 ${check.original.readingMinutesConservative} → ${check.revised.readingMinutesConservative}분 (영어 기반 속도 추정, 링크된 자료 제외)`
  );
  if (check.keywords.length > 0) {
    const kept = check.keywords.filter((item) => item.status === "kept").map((item) => item.keyword);
    const missing = check.keywords.filter((item) => item.status === "missing").map((item) => item.keyword);
    lines.push(
      `- 학습 목표 어휘 (단어 일치 점검: 빠진 단어는 알려 주지만 남아 있다고 목표 보존이 확인되지는 않음): 유지 ${kept.length}개${kept.length ? ` (${kept.join(", ")})` : ""}${missing.length ? `, 수정본에 없음 ${missing.length}개 (${missing.join(", ")})` : ""}`
    );
  } else {
    lines.push("- 학습 목표 어휘: 원본에서 목표의 단어를 찾지 못해 점검하지 않았습니다.");
  }
  if (check.missingNumbers.length > 0) {
    lines.push(`- 원본에 있던 숫자 중 수정본에 없는 것: ${check.missingNumbers.join(", ")} (의도한 변경인지 확인)`);
  }
  for (const repair of check.repairs) {
    lines.push(`- 개선안 "${repair.action}": ${REPAIR_STATUS_LABEL[repair.status]} — ${repair.detail}`);
  }
  lines.push("");
  return lines;
}

export const REPAIR_STATUS_LABEL: Record<RepairCheckStatus, string> = {
  detected: "문장에서 흔적 확인",
  not_detected: "문장에서 확인되지 않음",
  teacher_check: "교사 확인 필요",
};
