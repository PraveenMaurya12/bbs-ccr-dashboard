/**
 * v3.0 §19.3/§19.6 — a best-effort, field-level diff between the
 * immediately-prior plan version and the newly-composed one, with a
 * LOW/MEDIUM/HIGH materiality flag. Deliberately NOT a full recursive
 * object diff of every nested field (situationAssessment, actions[],
 * conditions[], etc.) — that is a disproportionate effort for what this
 * pass needs; the 3 fields compared here (cohort/pathway/templateId) are
 * the ones whose change actually matters for a CCR deciding whether to
 * re-review a plan from scratch.
 */
export interface ChangeSummaryFields {
  cohort: string | null
  pathway: string | null
  templateId: string
}

export interface ChangeSummary {
  changes: Array<{ field: string; from: string | null; to: string | null }>
  materiality: 'LOW' | 'MEDIUM' | 'HIGH'
}

export function buildChangeSummary(previous: ChangeSummaryFields, next: ChangeSummaryFields): ChangeSummary | null {
  const changes: ChangeSummary['changes'] = []
  if (previous.pathway !== next.pathway) changes.push({ field: 'pathway', from: previous.pathway, to: next.pathway })
  if (previous.cohort !== next.cohort) changes.push({ field: 'cohort', from: previous.cohort, to: next.cohort })
  if (previous.templateId !== next.templateId) changes.push({ field: 'templateId', from: previous.templateId, to: next.templateId })

  if (changes.length === 0) return null

  const pathwayOrTemplateChanged = changes.some((c) => c.field === 'pathway' || c.field === 'templateId')
  const materiality: ChangeSummary['materiality'] = pathwayOrTemplateChanged ? 'HIGH' : 'MEDIUM'
  return { changes, materiality }
}
