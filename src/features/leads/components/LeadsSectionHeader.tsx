import { Plus, Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface LeadsSectionHeaderProps {
  onExport: () => void
  onAddManualLead: () => void
  exportDisabled?: boolean
}

export function LeadsSectionHeader({ onExport, onAddManualLead, exportDisabled }: LeadsSectionHeaderProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <h1 className="text-lg font-medium tracking-[-0.27px] text-[#171717]">Leads</h1>
        <p className="text-sm tracking-[-0.084px] text-[#5c5c5c]">
          Manage and track all incoming leads from website, partners and other channels.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          className="gap-1.5 border-[#ebebeb] text-[#5c5c5c]"
          onClick={onExport}
          disabled={exportDisabled}
        >
          <Upload className="size-5" aria-hidden="true" />
          Export
        </Button>
        <Button className="gap-1.5 bg-[#335cff] hover:bg-[#2547d0]" onClick={onAddManualLead}>
          <Plus className="size-5" aria-hidden="true" />
          Add Manual Lead
        </Button>
      </div>
    </div>
  )
}
