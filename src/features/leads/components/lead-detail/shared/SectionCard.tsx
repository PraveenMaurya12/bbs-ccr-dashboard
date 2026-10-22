import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * The one card wrapper shared by every Debt Analysis section — matches the
 * Figma "Widgets [Finance & Banking]" component (node 1448:10974 and its
 * children, verified via Figma MCP get_design_context): white card,
 * 1px `#ebebeb` border, 16px radius, the design's own subtle drop shadow,
 * 16px padding, an icon+title header row followed by a full-width divider.
 * No fixed height: every card sizes to its own content so a long list
 * (e.g. risk flags) never gets clipped.
 */
export function SectionCard({
  icon: Icon,
  title,
  action,
  children,
  className = '',
}: {
  icon?: LucideIcon
  title?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`flex flex-col gap-4 rounded-2xl border border-[#ebebeb] bg-white p-4 shadow-[0px_1px_2px_0px_rgba(10,13,20,0.03)] ${className}`}
    >
      {(title || action) && (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {Icon && <Icon className="size-6 shrink-0 text-[#171717]" aria-hidden="true" />}
              {title && <h3 className="text-base font-medium tracking-[-0.176px] text-[#171717]">{title}</h3>}
            </div>
            {action}
          </div>
          <div className="h-px w-full shrink-0 bg-[#ebebeb]" />
        </>
      )}
      {children}
    </div>
  )
}

/** A single label/value stat pair, sized to match the Figma stat rows used throughout these cards. */
export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
      <p className="text-xs tracking-[0.48px] text-[#a3a3a3] uppercase">{label}</p>
      <p className="truncate text-lg font-medium tracking-[-0.27px] text-[#171717]">{value}</p>
    </div>
  )
}

/** A full-width divider between sub-sections within a card body — the same line used between the header and body. */
export function CardDivider() {
  return <div className="h-px w-full shrink-0 bg-[#ebebeb]" />
}

/**
 * A single-line label/value row — the "Pending" component Figma reuses
 * across Credit Utilization, Debt Burden & Concentration, Settlement /
 * Write-off / Restructuring, and (with a pill instead of a plain value)
 * Risk Indicators (verified via Figma MCP get_design_context, nodes
 * 1459:7995 and 1459:10937): both label and value are 14px/20px regular
 * weight in the same dark color — never the bold-value/gray-label "Stat"
 * treatment used by the gauge cards above. Rows are meant to be used as
 * direct siblings of `CardDivider` inside a `gap-4` flex-col (SectionCard's
 * own children), which reproduces Figma's exact 16px-before/16px-after
 * spacing around every divider without any extra wrapper.
 */
export function MetricRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex w-full items-start gap-1">
      <p className="min-w-0 flex-1 text-sm leading-5 tracking-[-0.084px] text-[#171717]">{label}</p>
      <p className="shrink-0 text-sm leading-5 tracking-[-0.084px] whitespace-nowrap text-[#171717]">{value}</p>
    </div>
  )
}

/** A small "Not available" placeholder for a sub-metric the bureau data can't support — never a fabricated 0 or dash. */
export function NotAvailable({ reason }: { reason?: string | null }) {
  return (
    <p className="rounded-lg bg-[#f7f7f7] px-3 py-2 text-xs text-[#a3a3a3]">
      {reason ?? 'Not available from the current bureau report.'}
    </p>
  )
}
