import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { BrandLockup } from '@/features/auth/components/BrandLockup'

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center gap-6 bg-white p-6 text-center">
      <BrandLockup />
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-[-0.12px] text-[#171717]">
          Password reset isn't available yet
        </h1>
        <p className="text-[#5c5c5c]">
          This flow isn't connected to a backend yet. Contact your administrator to
          reset your password in the meantime.
        </p>
      </div>
      <Button asChild className="rounded-[10px] bg-[#335cff] hover:bg-[#2547d0]">
        <Link to="/login">Back to login</Link>
      </Button>
    </div>
  )
}
