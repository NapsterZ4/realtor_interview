import { InterviewSessionStatus, ReportStatus, WorkflowStatus } from './enums';

type TransitionMap<T extends string> = Partial<Record<T, T[]>>;

const interviewTransitions: TransitionMap<InterviewSessionStatus> = {
  [InterviewSessionStatus.PENDING]: [
    InterviewSessionStatus.IN_PROGRESS,
    InterviewSessionStatus.EXPIRED,
  ],
  [InterviewSessionStatus.IN_PROGRESS]: [
    InterviewSessionStatus.AWAITING_VALIDATION,
    InterviewSessionStatus.ABANDONED,
    InterviewSessionStatus.EXPIRED,
  ],
  [InterviewSessionStatus.AWAITING_VALIDATION]: [
    InterviewSessionStatus.COMPLETED,
    InterviewSessionStatus.IN_PROGRESS,
  ],
  [InterviewSessionStatus.COMPLETED]: [],
  [InterviewSessionStatus.EXPIRED]: [],
  [InterviewSessionStatus.ABANDONED]: [InterviewSessionStatus.IN_PROGRESS],
};

const reportTransitions: TransitionMap<ReportStatus> = {
  [ReportStatus.PENDING]: [ReportStatus.GENERATING],
  [ReportStatus.GENERATING]: [ReportStatus.READY, ReportStatus.ERROR],
  [ReportStatus.READY]: [ReportStatus.EXPORTED],
  [ReportStatus.ERROR]: [ReportStatus.GENERATING],
  [ReportStatus.EXPORTED]: [],
};

const workflowTransitions: TransitionMap<WorkflowStatus> = {
  [WorkflowStatus.NEW]: [WorkflowStatus.INTERVIEW_SENT],
  [WorkflowStatus.INTERVIEW_SENT]: [
    WorkflowStatus.INTERVIEW_COMPLETE,
    WorkflowStatus.FOLLOW_UP,
  ],
  [WorkflowStatus.INTERVIEW_COMPLETE]: [WorkflowStatus.REPORT_READY],
  [WorkflowStatus.REPORT_READY]: [
    WorkflowStatus.ACTION_TAKEN,
    WorkflowStatus.FOLLOW_UP,
  ],
  [WorkflowStatus.ACTION_TAKEN]: [
    WorkflowStatus.FOLLOW_UP,
    WorkflowStatus.CLOSED,
  ],
  [WorkflowStatus.FOLLOW_UP]: [
    WorkflowStatus.INTERVIEW_SENT,
    WorkflowStatus.ACTION_TAKEN,
    WorkflowStatus.CLOSED,
  ],
  [WorkflowStatus.CLOSED]: [],
};

export type StateMachine = 'interview' | 'report' | 'workflow';

const machines: Record<StateMachine, TransitionMap<string>> = {
  interview: interviewTransitions,
  report: reportTransitions,
  workflow: workflowTransitions,
};

export function validateTransition(
  machine: StateMachine,
  current: string,
  next: string
): boolean {
  const transitions = machines[machine];
  const allowed = transitions[current];
  if (!allowed) return false;
  return allowed.includes(next);
}
