/** Generic lifecycle status shared by every stage of the CCR pipeline. */
export type StageStatus =
  | 'not_started'
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'requires_review'

/** Tracks status independently for each stage a lead moves through. */
export interface LeadPipelineStatus {
  leadSubmission: StageStatus
  bureauReportProcessing: StageStatus
  level1Profile: StageStatus
  level2Profile: StageStatus
  level3Assessment: StageStatus
  recoveryPlan: StageStatus
}
