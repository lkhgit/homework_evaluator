import type { Demands } from "@/lib/schema";

interface Chip {
  label: string;
  level?: number;
  tone: "danger" | "warn" | "neutral";
}

function levelDots(level: number) {
  return "●".repeat(level) + "○".repeat(Math.max(0, 3 - level));
}

const COMMUNICATION_LABEL: Record<string, string> = {
  typed: "타이핑",
  written: "글쓰기",
  spoken: "말하기",
  handwritten: "손글씨",
  video: "영상",
  multiple: "복수 방식",
};

export function chipsForDemands(demands: Demands): Chip[] {
  const chips: Chip[] = [];

  if (demands.workingMemory >= 2)
    chips.push({ label: "작업 기억", level: demands.workingMemory, tone: "danger" });
  if (demands.fineMotor >= 2)
    chips.push({ label: "정밀한 포인터 조작", level: demands.fineMotor, tone: "danger" });
  if (demands.timePressure >= 2)
    chips.push({ label: "시간 압박", level: demands.timePressure, tone: "danger" });
  if (demands.readingLoad >= 3)
    chips.push({ label: "많은 읽기량", level: demands.readingLoad, tone: "warn" });
  if (demands.contextSwitch)
    chips.push({ label: "환경 전환", tone: "warn" });
  if (demands.sensory.colorOnly)
    chips.push({ label: "색상만이 유일한 단서", tone: "danger" });
  if (demands.sensory.audioOnly)
    chips.push({ label: "소리만이 유일한 단서", tone: "danger" });
  if (demands.communication !== "none")
    chips.push({
      label: `${COMMUNICATION_LABEL[demands.communication] ?? demands.communication} 응답만 허용`,
      tone: "warn",
    });

  return chips;
}

const TONE_CLASS: Record<Chip["tone"], string> = {
  danger: "bg-danger-soft text-danger border-danger/25",
  warn: "bg-warn-soft text-warn border-warn/25",
  neutral: "bg-surface-sunken text-muted border-line",
};

export default function DemandChips({ demands }: { demands: Demands }) {
  const chips = chipsForDemands(demands);
  if (chips.length === 0) {
    return <p className="text-xs text-muted">특별히 두드러지는 기능적 부담이 없습니다.</p>;
  }

  return (
    <ul className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <li
          key={chip.label}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${TONE_CLASS[chip.tone]}`}
        >
          <span className="first-letter:uppercase">{chip.label}</span>
          {chip.level !== undefined && (
            <span aria-label={`3단계 중 ${chip.level}단계`} className="font-mono text-[10px] tracking-tight opacity-80">
              {levelDots(chip.level)}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
