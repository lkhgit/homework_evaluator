import { documentLanguageFor } from "@/lib/language";

/**
 * The textbook's "학습 목표" box, kept under every stage heading once the goal
 * is locked. It doubles as the summary bar: which assignment, which goal, and
 * where the score and repair decisions stand right now.
 */
export default function GoalBox({
  title,
  objective,
  scoreBefore,
  scoreAfter,
  accepted,
  proposals,
}: {
  title: string;
  objective: string;
  scoreBefore: number;
  scoreAfter: number;
  accepted: number;
  proposals: number;
}) {
  const changed = scoreAfter !== scoreBefore;
  return (
    <section className="goal-box" aria-label="학습 목표와 진행 요약">
      <p className="goal-tag">학습 목표</p>
      <div className="goal-box__goal">
        <p className="goal-box__objective" lang={documentLanguageFor(objective)}>{objective}</p>
        <p className="goal-box__title" lang={documentLanguageFor(title)}>{title}</p>
      </div>
      <dl className="goal-box__stats">
        <div>
          <dt>접근성 점수</dt>
          <dd>
            {changed && <><s aria-hidden="true">{scoreBefore}</s> </>}
            <b>{scoreAfter}</b>
            <span className="sr-only">
              {changed ? `점, 개선안 적용 전 ${scoreBefore}점` : "점"}
            </span>
          </dd>
        </div>
        <div>
          <dt>채택한 개선안</dt>
          <dd><b>{accepted}</b> / {proposals}</dd>
        </div>
      </dl>
    </section>
  );
}
