import type { ReactNode } from 'react'

/**
 * The Lead Details tab's repeated two-column layout (Figma "Content"
 * frames, node 1435:6021 and siblings): a left label column (title +
 * subtitle) and a right, bordered form card. Stacks to one column below
 * lg so it still reads correctly at 1024px.
 */
export function FormSection({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr] lg:gap-5">
      <div className="lg:pt-4">
        <h3 className="text-sm font-medium text-[#171717]">{title}</h3>
        <p className="mt-1 text-sm text-[#5c5c5c]">{subtitle}</p>
      </div>
      <div className="rounded-xl border border-[#ebebeb] bg-white p-4">
        <div className="flex flex-col gap-4">{children}</div>
      </div>
    </div>
  )
}

/** A single "CURRENT ADDRESS" / "PERMANENT ADDRESS" sub-divider inside a FormSection card. */
export function FormSubDivider({ label }: { label: string }) {
  return (
    <div className="-mx-4 border-y border-[#ebebeb] bg-[#f7f7f7] px-4 py-1.5">
      <p className="text-xs font-medium tracking-[0.48px] text-[#a3a3a3] uppercase">{label}</p>
    </div>
  )
}

/** Full-bleed divider between two FormSections (Figma "Content Divider [1.1]"). */
export function FormSectionDivider() {
  return <div className="h-px w-full bg-[#ebebeb]" />
}
