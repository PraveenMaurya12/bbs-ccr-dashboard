import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { ChevronDown, Loader2 } from 'lucide-react'
import { Controller, useForm, useWatch } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  EMPLOYMENT_TYPE_OPTIONS,
  GENDER_OPTIONS,
  HELP_CATEGORY_OPTIONS,
  MARITAL_STATUS_OPTIONS,
  leadDetailSchema,
  type LeadDetailFormValues,
} from '../../schema'
import type { LeadDetail, UpdateLeadDetailInput } from '../../types'
import { DetailField, FieldRow, detailInputClassName, detailSelectClassName } from './DetailField'
import { FormSection, FormSectionDivider, FormSubDivider } from './FormSection'

function toFormValues(lead: LeadDetail): LeadDetailFormValues {
  const c = lead.customer
  return {
    fullName: lead.fullName,
    phone: lead.phone,
    helpCategory: lead.helpCategory ?? '',
    situation: lead.situation ?? '',
    dateOfBirth: c?.dateOfBirth ?? '',
    gender: c?.gender ?? '',
    maritalStatus: c?.maritalStatus ?? '',
    alternateMobile: c?.alternateMobile ?? '',
    email: lead.email ?? '',
    employmentType: c?.employmentType ?? '',
    companyName: c?.companyName ?? '',
    designation: c?.designation ?? '',
    monthlySalary: c?.monthlySalary !== null && c?.monthlySalary !== undefined ? String(c.monthlySalary) : '',
    officialEmail: c?.officialEmail ?? '',
    workingExperienceYears:
      c?.workingExperienceYears !== null && c?.workingExperienceYears !== undefined
        ? String(c.workingExperienceYears)
        : '',
    city: lead.city ?? '',
    addressLine1: c?.addressLine1 ?? '',
    addressLine2: c?.addressLine2 ?? '',
    pinCode: c?.pinCode ?? '',
    state: c?.state ?? '',
    sameAsCurrentAddress: c?.sameAsCurrentAddress ?? true,
    permanentAddressLine1: c?.permanentAddressLine1 ?? '',
    permanentAddressLine2: c?.permanentAddressLine2 ?? '',
    permanentCity: c?.permanentCity ?? '',
    permanentPinCode: c?.permanentPinCode ?? '',
    permanentState: c?.permanentState ?? '',
  }
}

function blankToUndefined(value: string | undefined): string | undefined {
  return value === '' ? undefined : value
}

function blankToNumberOrUndefined(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function toUpdateInput(values: LeadDetailFormValues): UpdateLeadDetailInput {
  return {
    fullName: values.fullName,
    phone: values.phone,
    helpCategory: blankToUndefined(values.helpCategory),
    situation: blankToUndefined(values.situation),
    customer: {
      dateOfBirth: blankToUndefined(values.dateOfBirth),
      gender: blankToUndefined(values.gender),
      maritalStatus: blankToUndefined(values.maritalStatus),
      alternateMobile: blankToUndefined(values.alternateMobile),
      employmentType: blankToUndefined(values.employmentType),
      companyName: blankToUndefined(values.companyName),
      designation: blankToUndefined(values.designation),
      monthlySalary: blankToNumberOrUndefined(values.monthlySalary),
      officialEmail: blankToUndefined(values.officialEmail),
      workingExperienceYears: blankToNumberOrUndefined(values.workingExperienceYears),
      addressLine1: blankToUndefined(values.addressLine1),
      addressLine2: blankToUndefined(values.addressLine2),
      pinCode: blankToUndefined(values.pinCode),
      state: blankToUndefined(values.state),
      sameAsCurrentAddress: values.sameAsCurrentAddress,
      // Explicit `null` (not `undefined`) when addresses are the same — this
      // actively clears any previously-saved distinct permanent address in
      // the database, rather than leaving it silently orphaned. Orphaned
      // data here would resurface with stale values if the checkbox were
      // ever re-checked without re-entering anything.
      permanentAddressLine1: values.sameAsCurrentAddress ? null : blankToUndefined(values.permanentAddressLine1),
      permanentAddressLine2: values.sameAsCurrentAddress ? null : blankToUndefined(values.permanentAddressLine2),
      permanentCity: values.sameAsCurrentAddress ? null : blankToUndefined(values.permanentCity),
      permanentPinCode: values.sameAsCurrentAddress ? null : blankToUndefined(values.permanentPinCode),
      permanentState: values.sameAsCurrentAddress ? null : blankToUndefined(values.permanentState),
    },
  }
}

function Select({
  id,
  value,
  onChange,
  placeholder,
  options,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  options: readonly { value: string; label: string }[]
}) {
  return (
    <div className="relative">
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={detailSelectClassName}>
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-[#5c5c5c]"
      />
    </div>
  )
}

export interface LeadDetailsFormHandle {
  /** Read synchronously at the moment of a navigation attempt — see LeadDetailPage's unsaved-changes guard. */
  isDirty: () => boolean
}

export const LeadDetailsForm = forwardRef<LeadDetailsFormHandle, {
  lead: LeadDetail
  onSave: (input: UpdateLeadDetailInput) => Promise<void>
}>(function LeadDetailsForm({ lead, onSave }, ref) {
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<LeadDetailFormValues>({
    resolver: zodResolver(leadDetailSchema),
    values: toFormValues(lead),
  })

  // A ref (not state) so reading it imperatively from the parent never
  // triggers the "setState during render/effect" concerns that come with
  // lifting isDirty into parent state just to check it occasionally.
  const isDirtyRef = useRef(false)
  useEffect(() => {
    isDirtyRef.current = isDirty
  }, [isDirty])
  useImperativeHandle(ref, () => ({ isDirty: () => isDirtyRef.current }), [])

  const sameAsCurrentAddress = useWatch({ control, name: 'sameAsCurrentAddress' })
  const situationValue = useWatch({ control, name: 'situation' }) ?? ''

  async function handleSave(values: LeadDetailFormValues) {
    setSaveState('saving')
    try {
      await onSave(toUpdateInput(values))
      setSaveState('success')
      reset(values)
    } catch {
      setSaveState('error')
    }
  }

  return (
    <form onSubmit={handleSubmit(handleSave)} noValidate className="flex flex-col gap-8">
      <FormSection title="Lead Context" subtitle="Basic details of the lead">
        <FieldRow>
          <DetailField label="What's your name?" htmlFor="fullName" error={errors.fullName?.message}>
            <Input id="fullName" className={detailInputClassName} {...register('fullName')} />
          </DetailField>
          <DetailField label="Mobile number" htmlFor="phone" error={errors.phone?.message}>
            <Input id="phone" className={detailInputClassName} {...register('phone')} />
          </DetailField>
        </FieldRow>
        <FieldRow>
          <DetailField label="PAN number" htmlFor="pan">
            <Input id="pan" value="Protected" disabled className={detailInputClassName} />
          </DetailField>
          <DetailField label="What do you need help with?" htmlFor="helpCategory">
            <Controller
              control={control}
              name="helpCategory"
              render={({ field }) => (
                <Select
                  id="helpCategory"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  placeholder="Select a category"
                  options={HELP_CATEGORY_OPTIONS}
                />
              )}
            />
          </DetailField>
        </FieldRow>
        <DetailField label="Tell us about your situation" htmlFor="situation" error={errors.situation?.message}>
          <Textarea
            id="situation"
            maxLength={200}
            rows={3}
            className={`${detailInputClassName} resize-none`}
            {...register('situation')}
          />
          <span className="self-end text-xs text-[#a3a3a3]">{situationValue.length}/200</span>
        </DetailField>
      </FormSection>

      <FormSectionDivider />

      <FormSection title="Personal Information" subtitle="Basic details of the lead">
        <FieldRow>
          <DetailField label="Full name" htmlFor="fullName-2">
            <Input id="fullName-2" className={detailInputClassName} {...register('fullName')} />
          </DetailField>
          <DetailField label="Date of birth" htmlFor="dateOfBirth">
            <Input id="dateOfBirth" type="date" className={detailInputClassName} {...register('dateOfBirth')} />
          </DetailField>
        </FieldRow>
        <FieldRow>
          <DetailField label="Gender" htmlFor="gender">
            <Controller
              control={control}
              name="gender"
              render={({ field }) => (
                <Select
                  id="gender"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  placeholder="Select"
                  options={GENDER_OPTIONS}
                />
              )}
            />
          </DetailField>
          <DetailField label="Marital Status" htmlFor="maritalStatus">
            <Controller
              control={control}
              name="maritalStatus"
              render={({ field }) => (
                <Select
                  id="maritalStatus"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  placeholder="Select"
                  options={MARITAL_STATUS_OPTIONS}
                />
              )}
            />
          </DetailField>
        </FieldRow>
      </FormSection>

      <FormSectionDivider />

      <FormSection title="Contact information" subtitle="How to reach the lead">
        <FieldRow>
          <DetailField label="Primary mobile" htmlFor="phone-2">
            <Input id="phone-2" className={detailInputClassName} {...register('phone')} />
          </DetailField>
          <DetailField label="Alternate mobile" htmlFor="alternateMobile">
            <Input id="alternateMobile" className={detailInputClassName} {...register('alternateMobile')} />
          </DetailField>
        </FieldRow>
        <DetailField label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" className={detailInputClassName} {...register('email')} />
        </DetailField>
      </FormSection>

      <FormSectionDivider />

      <FormSection title="Employment and Income" subtitle="Professional and income details">
        <FieldRow>
          <DetailField label="Employment type" htmlFor="employmentType">
            <Controller
              control={control}
              name="employmentType"
              render={({ field }) => (
                <Select
                  id="employmentType"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  placeholder="Select"
                  options={EMPLOYMENT_TYPE_OPTIONS}
                />
              )}
            />
          </DetailField>
          <DetailField label="Company name" htmlFor="companyName">
            <Input id="companyName" className={detailInputClassName} {...register('companyName')} />
          </DetailField>
        </FieldRow>
        <FieldRow>
          <DetailField label="Designation" htmlFor="designation">
            <Input id="designation" className={detailInputClassName} {...register('designation')} />
          </DetailField>
          <DetailField label="Monthly salary" htmlFor="monthlySalary">
            <Input id="monthlySalary" type="number" className={detailInputClassName} {...register('monthlySalary')} />
          </DetailField>
        </FieldRow>
        <FieldRow>
          <DetailField label="Official email" htmlFor="officialEmail" error={errors.officialEmail?.message}>
            <Input id="officialEmail" type="email" className={detailInputClassName} {...register('officialEmail')} />
          </DetailField>
          <DetailField label="Working experience (Years)" htmlFor="workingExperienceYears">
            <Input
              id="workingExperienceYears"
              type="number"
              className={detailInputClassName}
              {...register('workingExperienceYears')}
            />
          </DetailField>
        </FieldRow>
      </FormSection>

      <FormSectionDivider />

      <FormSection title="Location and address" subtitle="Current and permanent address">
        <FormSubDivider label="Current address" />
        <DetailField label="Address line 1" htmlFor="addressLine1">
          <Input id="addressLine1" className={detailInputClassName} {...register('addressLine1')} />
        </DetailField>
        <DetailField label="Address line 2" htmlFor="addressLine2">
          <Input id="addressLine2" className={detailInputClassName} {...register('addressLine2')} />
        </DetailField>
        <FieldRow columns={3}>
          <DetailField label="City" htmlFor="city">
            <Input id="city" className={detailInputClassName} {...register('city')} />
          </DetailField>
          <DetailField label="PIN code" htmlFor="pinCode">
            <Input id="pinCode" className={detailInputClassName} {...register('pinCode')} />
          </DetailField>
          <DetailField label="State" htmlFor="state">
            <Input id="state" className={detailInputClassName} {...register('state')} />
          </DetailField>
        </FieldRow>

        <FormSubDivider label="Permanent address" />
        <label className="flex items-center gap-2 text-sm text-[#171717]">
          <Controller
            control={control}
            name="sameAsCurrentAddress"
            render={({ field }) => (
              // The checkbox's own checked state must match its label's
              // question ("...different?") — checked means "yes,
              // different", i.e. sameAsCurrentAddress === false. Binding
              // `checked` directly to sameAsCurrentAddress (its old,
              // buggy wiring) showed the box checked by default (when
              // addresses are the SAME) and unchecked once a visitor
              // marked them different — backwards from what the label says.
              <Checkbox
                checked={!field.value}
                onCheckedChange={(checked) => field.onChange(!checked)}
              />
            )}
          />
          Are your current and permanent addresses different?
        </label>

        {/*
          Always mounted (not conditionally rendered) so the grid-template-rows
          transition below has something to animate between — an unmount would
          just jump instantly instead of collapsing smoothly. `overflow-hidden`
          here is the standard, necessary clipping mask for this exact
          height-animation technique (0fr -> 1fr row track), not a case of
          concealing a scrollbar over clipped content: nothing here is ever
          scrollable, and every field is fully reachable once expanded.
          `inert` removes the collapsed fields from tab order and the
          accessibility tree entirely, so keyboard/screen-reader users can't
          land on inputs that are visually hidden.
        */}
        <div
          className={`grid transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none ${
            sameAsCurrentAddress ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'
          }`}
        >
          <div
            className={`flex min-h-0 flex-col gap-4 overflow-hidden transition-opacity duration-300 motion-reduce:transition-none ${
              sameAsCurrentAddress ? 'opacity-0' : 'opacity-100'
            }`}
            aria-hidden={sameAsCurrentAddress}
            inert={sameAsCurrentAddress}
          >
            <DetailField label="Address line 1" htmlFor="permanentAddressLine1">
              <Input id="permanentAddressLine1" className={detailInputClassName} {...register('permanentAddressLine1')} />
            </DetailField>
            <DetailField label="Address line 2" htmlFor="permanentAddressLine2">
              <Input id="permanentAddressLine2" className={detailInputClassName} {...register('permanentAddressLine2')} />
            </DetailField>
            <FieldRow columns={3}>
              <DetailField label="City" htmlFor="permanentCity">
                <Input id="permanentCity" className={detailInputClassName} {...register('permanentCity')} />
              </DetailField>
              <DetailField label="PIN code" htmlFor="permanentPinCode">
                <Input id="permanentPinCode" className={detailInputClassName} {...register('permanentPinCode')} />
              </DetailField>
              <DetailField label="State" htmlFor="permanentState">
                <Input id="permanentState" className={detailInputClassName} {...register('permanentState')} />
              </DetailField>
            </FieldRow>
          </div>
        </div>
      </FormSection>

      <div className="flex items-center justify-end gap-3 border-t border-[#ebebeb] pt-4">
        {saveState === 'success' ? <p className="text-sm text-[#1fc16b]">Saved</p> : null}
        {saveState === 'error' ? (
          <p role="alert" className="text-sm text-red-600">
            Could not save changes. Please try again.
          </p>
        ) : null}
        <Button type="submit" disabled={saveState === 'saving'}>
          {saveState === 'saving' ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Saving…
            </>
          ) : (
            'Save changes'
          )}
        </Button>
      </div>
    </form>
  )
})
