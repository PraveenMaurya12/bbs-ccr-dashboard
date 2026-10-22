// eslint-disable-next-line react-refresh/only-export-components
export const LEAD_DETAIL_TABS = [
  'lead-details',
  'call-details',
  'debt-analysis',
  'financial-analysis',
  'final-profile',
  'recovery-plan',
  'documents',
  'timeline',
] as const

export type LeadDetailTabId = (typeof LEAD_DETAIL_TABS)[number]

const TAB_LABEL: Record<LeadDetailTabId, string> = {
  'lead-details': 'Lead details',
  'call-details': 'Call details',
  'debt-analysis': 'Debt analysis',
  'financial-analysis': 'Financial analysis',
  'final-profile': 'Final Profile',
  'recovery-plan': 'Recovery plan',
  documents: 'Documents',
  timeline: 'Timeline',
}

export function LeadDetailTabs({
  active,
  onChange,
}: {
  active: LeadDetailTabId
  onChange: (tab: LeadDetailTabId) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Lead detail sections"
      className="flex flex-wrap items-start gap-x-4 gap-y-3 border-b border-[#ebebeb] pt-3.5 sm:gap-x-6"
    >
      {LEAD_DETAIL_TABS.map((tab) => {
        const isActive = tab === active
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            id={`lead-detail-tab-${tab}`}
            aria-selected={isActive}
            aria-controls={`lead-detail-panel-${tab}`}
            onClick={() => onChange(tab)}
            // The active-state underline is this button's own border-bottom
            // rather than an absolutely-positioned element offset below it
            // — that offset used to escape into the row below once the tab
            // bar could wrap onto a second line at narrow widths.
            className={`border-b-2 pb-3 font-mono text-sm font-medium tracking-normal uppercase transition-colors ${
              isActive ? 'border-[#335cff] text-[#171717]' : 'border-transparent text-[#5c5c5c] hover:text-[#171717]'
            }`}
          >
            {TAB_LABEL[tab]}
          </button>
        )
      })}
    </div>
  )
}
