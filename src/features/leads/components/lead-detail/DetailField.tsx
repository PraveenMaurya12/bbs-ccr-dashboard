import type { ReactNode } from 'react'

/** Shared Tailwind classes matching Figma's "Text Input [1.1]" basic state exactly. */
export const detailInputClassName =
  'h-auto w-full rounded-[10px] border-[#ebebeb] px-3 py-2.5 text-sm text-[#171717] shadow-[0px_1px_2px_0px_rgba(10,13,20,0.03)] tracking-[-0.084px] placeholder:text-[#a3a3a3] focus-visible:border-[#335cff] focus-visible:ring-[#335cff]/30'

export const detailSelectClassName =
  'h-auto w-full appearance-none rounded-[10px] border border-[#ebebeb] bg-white px-3 py-2.5 pr-9 text-sm text-[#171717] shadow-[0px_1px_2px_0px_rgba(10,13,20,0.03)] tracking-[-0.084px] focus:border-[#335cff] focus:outline-none focus:ring-2 focus:ring-[#335cff]/30'

/** A grid row of 1–3 equal-width fields (Figma's "Header" rows within a form card). */
export function FieldRow({ columns = 2, children }: { columns?: 1 | 2 | 3; children: ReactNode }) {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      style={columns === 3 ? { gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' } : undefined}
    >
      {children}
    </div>
  )
}

export function DetailField({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string
  htmlFor: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-medium text-[#171717]">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  )
}
