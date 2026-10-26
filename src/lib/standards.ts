import type { BarrierType } from "./schema";

/**
 * Citations are looked up from this table using the model's `barrierType` key.
 * The model never writes citation text, so it cannot invent a success criterion
 * that does not exist. Adding a barrier type means adding a row here.
 */

export interface WcagCriterion {
  id: string;
  name: string;
  level: "A" | "AA" | "AAA";
  url: string;
}

export interface StandardsEntry {
  label: string;
  summary: string;
  wcag: WcagCriterion[];
  coga: string[];
  udl: string[];
  research: string[];
}

const COGA_URL = "https://www.w3.org/TR/coga-usable/";
const UDL_URL = "https://udlguidelines.cast.org/";

function wcag(
  id: string,
  name: string,
  level: WcagCriterion["level"],
  slug: string
): WcagCriterion {
  return {
    id,
    name,
    level,
    url: `https://www.w3.org/WAI/WCAG22/Understanding/${slug}.html`,
  };
}

export const STANDARDS: Record<BarrierType, StandardsEntry> = {
  working_memory: {
    label: "작업 기억 의존",
    summary:
      "인터페이스가 그냥 화면에 계속 띄워둘 수 있는 정보를 학생이 머릿속에 담아두도록 요구합니다.",
    wcag: [wcag("3.3.2", "Labels or Instructions", "A", "labels-or-instructions")],
    coga: ["과정이 기억력에 의존하지 않도록 할 것"],
    udl: ["실행 기능을 위한 선택지 제공: 기억과 정보 관리를 지원"],
    research: ["Cowan (2001): 작업 기억은 반복 암기나 외부 보조 없이 약 4개의 청크만 유지 가능"],
  },
  context_switching: {
    label: "환경 전환",
    summary:
      "과제를 마치려면 여러 애플리케이션, 탭, 매체를 반복해서 오가며 매번 다시 상황을 파악해야 합니다.",
    wcag: [wcag("3.2.3", "Consistent Navigation", "AA", "consistent-navigation")],
    coga: ["사용자가 집중을 유지할 수 있도록 도울 것", "가장 중요한 기능을 쉽게 찾을 수 있게 할 것"],
    udl: ["위협 요소와 주의 분산을 최소화"],
    research: [
      "Monsell (2003): 작업을 전환하면 측정 가능한 수행 저하가 발생함",
      "Altmann & Trafton (2002): 목표 활성화는 중간에 다른 작업이 끼어들면 감쇠함",
    ],
  },
  fine_motor: {
    label: "정밀한 소근육 조작",
    summary:
      "드래그하거나 작은 목표물을 클릭하는 등 정밀한 포인터 제어를 요구하며, 대체 경로가 없습니다.",
    wcag: [
      wcag("2.5.7", "Dragging Movements", "AA", "dragging-movements"),
      wcag("2.5.8", "Target Size (Minimum)", "AA", "target-size-minimum"),
    ],
    coga: ["단순하고 명확한 상호작용 설계를 사용할 것"],
    udl: ["도구 및 보조 기술 접근을 최적화", "응답과 이동 방식을 다양화"],
    research: ["Fitts (1954): 대상이 작아지거나 멀어질수록 포인팅 시간이 증가함"],
  },
  time_pressure: {
    label: "시간 압박",
    summary:
      "정해진 제한 시간이 과제를 제약하여, 이해도뿐 아니라 처리 속도까지 평가에 영향을 줍니다.",
    wcag: [wcag("2.2.1", "Timing Adjustable", "A", "timing-adjustable")],
    coga: ["과제를 완료할 충분한 시간을 허용할 것"],
    udl: ["응답, 탐색, 이동 방식을 다양화"],
    research: [
      "Brysbaert (2019): 성인의 비문학 묵독 평균 속도는 분당 약 238단어이며 개인차가 큼",
    ],
  },
  reading_load: {
    label: "읽기 및 지시문 부담",
    summary:
      "밀도가 높거나 구조화되지 않은 지시문은 평가 대상 주제와는 별개로 읽고 해석하는 부담을 더합니다.",
    wcag: [
      wcag("3.3.2", "Labels or Instructions", "A", "labels-or-instructions"),
      wcag("3.1.5", "Reading Level", "AAA", "reading-level"),
    ],
    coga: ["명확하고 이해하기 쉬운 콘텐츠를 사용할 것", "긴 글을 다루기 쉬운 단위로 나눌 것"],
    udl: ["어휘와 기호를 명확히 함", "텍스트 해독을 지원"],
    research: [
      "Sweller (1988): 개념과 무관한 부담을 더하는 제시 방식은 학습을 저해함",
    ],
  },
  single_modality_communication: {
    label: "단일 응답 방식 강요",
    summary:
      "학습 내용을 보여줄 방법이 단 하나만 허용되어, 그 방식을 쓸 수 없는 학생은 아는 것을 보여줄 수 없습니다.",
    wcag: [],
    coga: ["사람마다 다른 방식으로 활동을 완료할 수 있도록 지원할 것"],
    udl: [
      "행동과 표현을 위한 다양한 수단을 제공",
      "의사소통에 여러 매체를 활용",
    ],
    research: [
      "평가 타당도: 측정 대상 구인과 무관한 요구는 구인과 무관한 변량(construct-irrelevant variance)을 유발함",
    ],
  },
  sensory_color_only: {
    label: "색상만이 유일한 단서",
    summary: "정보가 색상만으로 전달되며, 라벨·패턴·텍스트 대체 수단이 없습니다.",
    wcag: [
      wcag("1.4.1", "Use of Color", "A", "use-of-color"),
      wcag("1.3.3", "Sensory Characteristics", "A", "sensory-characteristics"),
    ],
    coga: ["명확하고 이해하기 쉬운 시각적 디자인을 사용할 것"],
    udl: ["시각 정보에 대한 대체 수단을 제공"],
    research: [],
  },
  sensory_audio_only: {
    label: "소리만이 유일한 단서",
    summary: "정보가 소리만으로 전달되며, 자막이나 스크립트가 없습니다.",
    wcag: [
      wcag("1.2.2", "Captions (Prerecorded)", "A", "captions-prerecorded"),
      wcag("1.2.1", "Audio-only and Video-only (Prerecorded)", "A", "audio-only-and-video-only-prerecorded"),
    ],
    coga: ["소리에 대한 대체 수단을 제공할 것"],
    udl: ["청각 정보에 대한 대체 수단을 제공"],
    research: [],
  },
  navigation_ambiguity: {
    label: "불명확한 순서 또는 목적지",
    summary:
      "다음에 무엇을 해야 하는지, 필요한 자료가 어디 있는지 학생이 알 수 없어 경로를 찾는 것 자체가 과제의 일부가 됩니다.",
    wcag: [
      wcag("2.4.6", "Headings and Labels", "AA", "headings-and-labels"),
      wcag("3.2.3", "Consistent Navigation", "AA", "consistent-navigation"),
    ],
    coga: ["사용자가 필요한 것을 찾을 수 있도록 도울 것", "각 단계를 명확하게 만들 것"],
    udl: ["계획 수립과 전략 개발을 지원"],
    research: [],
  },
};

export function citationsFor(barrierType: BarrierType): StandardsEntry {
  return STANDARDS[barrierType];
}

/** One-line citation used in compact places such as the barrier trace header. */
export function shortCitation(barrierType: BarrierType): string {
  const entry = STANDARDS[barrierType];
  if (entry.wcag.length > 0) {
    const first = entry.wcag[0];
    return `WCAG ${first.id} ${first.name} (Level ${first.level})`;
  }
  if (entry.coga.length > 0) return `W3C COGA: ${entry.coga[0]}`;
  if (entry.udl.length > 0) return `CAST UDL: ${entry.udl[0]}`;
  return entry.label;
}

export const STANDARDS_SOURCES = {
  wcag: { name: "WCAG 2.2", url: "https://www.w3.org/TR/WCAG22/" },
  coga: { name: "W3C COGA — Making Content Usable", url: COGA_URL },
  udl: { name: "CAST UDL Guidelines 3.0", url: UDL_URL },
};
