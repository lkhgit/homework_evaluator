import type { Analysis, FrictionMoment, RevisedAssignment, Step } from "./schema";
import type { WorkflowStage, ConditionId } from "@/components/WorkflowContext";
import type { StudentAnalysis } from "./studentAnalysis";

export interface TeacherSnapshot {
  projectId: string;
  stage: WorkflowStage;
  assignmentDraft: string;
  analyzedText: string;
  objective: string;
  baseAnalysis: Analysis;
  steps: Step[];
  appliedRepairIds: string[];
  revised: { key: string; value: RevisedAssignment } | null;
  visited: WorkflowStage[];
  selectedFriction: FrictionMoment | null;
  condition: ConditionId;
  analysisWarnings: string[];
  sourceConflicts: StudentAnalysis["conflicts"];
}
export function versionKey(value: TeacherSnapshot): string {
  return JSON.stringify([value.analyzedText, value.objective, value.baseAnalysis, value.steps, value.appliedRepairIds, value.revised]);
}
