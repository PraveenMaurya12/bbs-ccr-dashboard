/**
 * An AI call is bounded by its provider's own request timeout (120 s by
 * default), so a job still QUEUED/RUNNING well past that is not in flight —
 * its process died or its final write was lost. Until the next process
 * restart's startup sweep reconciles the row, readers must not keep
 * reporting it as "running".
 */
export const ANALYSIS_JOB_TIMEOUT_MS = 5 * 60 * 1000

export type EffectiveJobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'TIMED_OUT'

export function effectiveJobStatus(job: { status: string; createdAt: Date; startedAt: Date | null }, now: Date = new Date()): EffectiveJobStatus {
  if (job.status === 'QUEUED' || job.status === 'RUNNING') {
    const since = (job.startedAt ?? job.createdAt).getTime()
    return now.getTime() - since > ANALYSIS_JOB_TIMEOUT_MS ? 'TIMED_OUT' : job.status
  }
  return job.status as EffectiveJobStatus
}
