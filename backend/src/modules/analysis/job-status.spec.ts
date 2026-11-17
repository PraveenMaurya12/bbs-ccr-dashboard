import { ANALYSIS_JOB_TIMEOUT_MS, effectiveJobStatus } from './job-status'

const now = new Date('2026-10-22T12:00:00Z')
const ago = (ms: number) => new Date(now.getTime() - ms)

describe('effectiveJobStatus', () => {
  it('reports a recently started RUNNING/QUEUED job as still in flight', () => {
    expect(effectiveJobStatus({ status: 'RUNNING', createdAt: ago(20_000), startedAt: ago(19_000) }, now)).toBe('RUNNING')
    expect(effectiveJobStatus({ status: 'QUEUED', createdAt: ago(1_000), startedAt: null }, now)).toBe('QUEUED')
  })

  it('reports a RUNNING or QUEUED job past the AI timeout as TIMED_OUT, never "running"', () => {
    expect(effectiveJobStatus({ status: 'RUNNING', createdAt: ago(ANALYSIS_JOB_TIMEOUT_MS + 10_000), startedAt: ago(ANALYSIS_JOB_TIMEOUT_MS + 5_000) }, now)).toBe('TIMED_OUT')
    expect(effectiveJobStatus({ status: 'QUEUED', createdAt: ago(ANALYSIS_JOB_TIMEOUT_MS + 1), startedAt: null }, now)).toBe('TIMED_OUT')
  })

  it('measures from the start time when there is one, so a long-queued job that just started is not timed out', () => {
    expect(effectiveJobStatus({ status: 'RUNNING', createdAt: ago(ANALYSIS_JOB_TIMEOUT_MS * 3), startedAt: ago(1_000) }, now)).toBe('RUNNING')
  })

  it('never changes a terminal status, however old', () => {
    for (const status of ['COMPLETED', 'FAILED'] as const) {
      expect(effectiveJobStatus({ status, createdAt: ago(ANALYSIS_JOB_TIMEOUT_MS * 10), startedAt: ago(ANALYSIS_JOB_TIMEOUT_MS * 10) }, now)).toBe(status)
    }
  })
})
