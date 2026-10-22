import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { createLeadSchema, type CreateLeadFormValues } from '../schema'

interface AddManualLeadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: CreateLeadFormValues) => Promise<void>
}

export function AddManualLeadDialog({ open, onOpenChange, onSubmit }: AddManualLeadDialogProps) {
  const [submitError, setSubmitError] = useState<string | null>(null)

  const form = useForm<CreateLeadFormValues>({
    resolver: zodResolver(createLeadSchema),
    defaultValues: { fullName: '', phone: '', email: '', city: '', source: 'website' },
  })

  async function handleSubmit(values: CreateLeadFormValues) {
    setSubmitError(null)
    try {
      await onSubmit(values)
      onOpenChange(false)
    } catch {
      setSubmitError('Could not create this lead right now. Please try again.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Manual Lead</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} noValidate className="space-y-4">
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full name</FormLabel>
                  <FormControl>
                    <Input placeholder="Ananya Rao" autoComplete="name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input placeholder="+91 90000 10001" autoComplete="tel" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="ananya.rao@example.test" autoComplete="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>City</FormLabel>
                  <FormControl>
                    <Input placeholder="Bengaluru" autoComplete="address-level2" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="source"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Source</FormLabel>
                  <FormControl>
                    <div className="flex gap-2" role="radiogroup" aria-label="Lead source">
                      {(['website', 'partner'] as const).map((value) => (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={field.value === value}
                          onClick={() => field.onChange(value)}
                          className={cn(
                            'flex-1 rounded-md border px-3 py-1.5 text-sm font-medium capitalize transition-colors',
                            field.value === value
                              ? 'border-primary bg-primary/5 text-primary'
                              : 'border-input text-muted-foreground hover:bg-accent',
                          )}
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {submitError ? (
              <p role="alert" className="text-destructive text-sm">
                {submitError}
              </p>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    Creating…
                  </>
                ) : (
                  'Create lead'
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
