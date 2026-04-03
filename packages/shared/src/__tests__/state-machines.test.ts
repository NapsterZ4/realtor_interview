import { describe, it, expect } from 'vitest';
import { validateTransition } from '../state-machines';
import { InterviewSessionStatus, ReportStatus, WorkflowStatus } from '../enums';

describe('Interview State Machine', () => {
  it('allows PENDING → IN_PROGRESS', () => {
    expect(validateTransition('interview', InterviewSessionStatus.PENDING, InterviewSessionStatus.IN_PROGRESS)).toBe(true);
  });

  it('allows PENDING → EXPIRED', () => {
    expect(validateTransition('interview', InterviewSessionStatus.PENDING, InterviewSessionStatus.EXPIRED)).toBe(true);
  });

  it('rejects PENDING → COMPLETED', () => {
    expect(validateTransition('interview', InterviewSessionStatus.PENDING, InterviewSessionStatus.COMPLETED)).toBe(false);
  });

  it('allows IN_PROGRESS → AWAITING_VALIDATION', () => {
    expect(validateTransition('interview', InterviewSessionStatus.IN_PROGRESS, InterviewSessionStatus.AWAITING_VALIDATION)).toBe(true);
  });

  it('allows IN_PROGRESS → ABANDONED', () => {
    expect(validateTransition('interview', InterviewSessionStatus.IN_PROGRESS, InterviewSessionStatus.ABANDONED)).toBe(true);
  });

  it('allows IN_PROGRESS → EXPIRED', () => {
    expect(validateTransition('interview', InterviewSessionStatus.IN_PROGRESS, InterviewSessionStatus.EXPIRED)).toBe(true);
  });

  it('rejects IN_PROGRESS → COMPLETED directly', () => {
    expect(validateTransition('interview', InterviewSessionStatus.IN_PROGRESS, InterviewSessionStatus.COMPLETED)).toBe(false);
  });

  it('allows AWAITING_VALIDATION → COMPLETED', () => {
    expect(validateTransition('interview', InterviewSessionStatus.AWAITING_VALIDATION, InterviewSessionStatus.COMPLETED)).toBe(true);
  });

  it('allows AWAITING_VALIDATION → IN_PROGRESS', () => {
    expect(validateTransition('interview', InterviewSessionStatus.AWAITING_VALIDATION, InterviewSessionStatus.IN_PROGRESS)).toBe(true);
  });

  it('rejects transitions from COMPLETED', () => {
    expect(validateTransition('interview', InterviewSessionStatus.COMPLETED, InterviewSessionStatus.IN_PROGRESS)).toBe(false);
  });

  it('rejects transitions from EXPIRED', () => {
    expect(validateTransition('interview', InterviewSessionStatus.EXPIRED, InterviewSessionStatus.IN_PROGRESS)).toBe(false);
  });

  it('allows ABANDONED → IN_PROGRESS (resume)', () => {
    expect(validateTransition('interview', InterviewSessionStatus.ABANDONED, InterviewSessionStatus.IN_PROGRESS)).toBe(true);
  });

  it('rejects ABANDONED → COMPLETED', () => {
    expect(validateTransition('interview', InterviewSessionStatus.ABANDONED, InterviewSessionStatus.COMPLETED)).toBe(false);
  });
});

describe('Report State Machine', () => {
  it('allows PENDING → GENERATING', () => {
    expect(validateTransition('report', ReportStatus.PENDING, ReportStatus.GENERATING)).toBe(true);
  });

  it('allows GENERATING → READY', () => {
    expect(validateTransition('report', ReportStatus.GENERATING, ReportStatus.READY)).toBe(true);
  });

  it('allows GENERATING → ERROR', () => {
    expect(validateTransition('report', ReportStatus.GENERATING, ReportStatus.ERROR)).toBe(true);
  });

  it('allows READY → EXPORTED', () => {
    expect(validateTransition('report', ReportStatus.READY, ReportStatus.EXPORTED)).toBe(true);
  });

  it('allows ERROR → GENERATING (retry)', () => {
    expect(validateTransition('report', ReportStatus.ERROR, ReportStatus.GENERATING)).toBe(true);
  });

  it('rejects PENDING → READY (skip)', () => {
    expect(validateTransition('report', ReportStatus.PENDING, ReportStatus.READY)).toBe(false);
  });

  it('rejects transitions from EXPORTED', () => {
    expect(validateTransition('report', ReportStatus.EXPORTED, ReportStatus.READY)).toBe(false);
  });
});

describe('Workflow State Machine', () => {
  it('allows NEW → INTERVIEW_SENT', () => {
    expect(validateTransition('workflow', WorkflowStatus.NEW, WorkflowStatus.INTERVIEW_SENT)).toBe(true);
  });

  it('allows INTERVIEW_SENT → INTERVIEW_COMPLETE', () => {
    expect(validateTransition('workflow', WorkflowStatus.INTERVIEW_SENT, WorkflowStatus.INTERVIEW_COMPLETE)).toBe(true);
  });

  it('allows INTERVIEW_SENT → FOLLOW_UP', () => {
    expect(validateTransition('workflow', WorkflowStatus.INTERVIEW_SENT, WorkflowStatus.FOLLOW_UP)).toBe(true);
  });

  it('allows INTERVIEW_COMPLETE → REPORT_READY', () => {
    expect(validateTransition('workflow', WorkflowStatus.INTERVIEW_COMPLETE, WorkflowStatus.REPORT_READY)).toBe(true);
  });

  it('allows REPORT_READY → ACTION_TAKEN', () => {
    expect(validateTransition('workflow', WorkflowStatus.REPORT_READY, WorkflowStatus.ACTION_TAKEN)).toBe(true);
  });

  it('allows ACTION_TAKEN → CLOSED', () => {
    expect(validateTransition('workflow', WorkflowStatus.ACTION_TAKEN, WorkflowStatus.CLOSED)).toBe(true);
  });

  it('allows FOLLOW_UP → INTERVIEW_SENT', () => {
    expect(validateTransition('workflow', WorkflowStatus.FOLLOW_UP, WorkflowStatus.INTERVIEW_SENT)).toBe(true);
  });

  it('allows FOLLOW_UP → ACTION_TAKEN', () => {
    expect(validateTransition('workflow', WorkflowStatus.FOLLOW_UP, WorkflowStatus.ACTION_TAKEN)).toBe(true);
  });

  it('allows FOLLOW_UP → CLOSED', () => {
    expect(validateTransition('workflow', WorkflowStatus.FOLLOW_UP, WorkflowStatus.CLOSED)).toBe(true);
  });

  it('rejects NEW → COMPLETED directly', () => {
    expect(validateTransition('workflow', WorkflowStatus.NEW, WorkflowStatus.REPORT_READY)).toBe(false);
  });

  it('rejects transitions from CLOSED', () => {
    expect(validateTransition('workflow', WorkflowStatus.CLOSED, WorkflowStatus.NEW)).toBe(false);
  });
});
