'use client'

import { useState } from 'react'

export const dynamic = 'force-dynamic'

const HOW_HEARD_OPTIONS = ['Instagram', 'Facebook', 'LinkedIn', 'Referred by someone', 'Other']
const ENGLISH_OPTIONS = ['Basic', 'Intermediate', 'Advanced', 'Native/Fluent']
const EXPERIENCE_OPTIONS = ['Yes', 'No', 'Something similar']
const HOURS_OPTIONS = ['2-4 hours', '4-6 hours', '6-8 hours', 'Full time 8+']
const AVAILABLE_OPTIONS = ['Yes', 'No', 'In 1-2 weeks', 'In 1 month']

export default function CloserApplicationPage() {
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    const fd = new FormData(e.currentTarget)
    const data = {
      position: 'closer',
      full_name: fd.get('full_name'),
      email: fd.get('email'),
      country_timezone: fd.get('country_timezone'),
      phone: fd.get('phone'),
      how_heard: fd.get('how_heard'),
      english_level: fd.get('english_level'),
      has_experience: fd.get('has_experience'),
      crm_tools: fd.get('crm_tools'),
      hours_per_day: fd.get('hours_per_day'),
      past_sales_performance: fd.get('past_sales_performance'),
      best_month_cash_collected: fd.get('best_month_cash_collected') ? parseFloat(fd.get('best_month_cash_collected') as string) : null,
      sales_methodologies: fd.get('sales_methodologies'),
      objection_handling: fd.get('objection_handling'),
      closing_superpower: fd.get('closing_superpower'),
      availability: fd.get('availability'),
      crm_tools_proficient: fd.get('crm_tools_proficient'),
      available_immediately: fd.get('available_immediately'),
      why_hic: fd.get('why_hic'),
      biggest_strength: fd.get('biggest_strength'),
      five_year_vision: fd.get('five_year_vision'),
      video_url: fd.get('video_url'),
      confirmed_job_description: fd.get('confirmed_job_description') === 'on',
      confirmed_remote: fd.get('confirmed_remote') === 'on',
      additional_comments: fd.get('additional_comments'),
    }

    try {
      const res = await fetch('/api/careers/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || 'Something went wrong')
      }

      setSubmitted(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <img src="/logo.png" alt="HIC Parenting" className="h-10 mx-auto mb-8" />
          <div className="text-5xl mb-4">🎉</div>
          <h1 className="text-2xl font-bold text-[#1C2B3A] mb-3">Thank you for applying!</h1>
          <p className="text-[#718096] text-base">
            We&apos;ll review your application and get back to you soon.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <div className="max-w-2xl mx-auto px-4 py-10 md:py-16">
        {/* Header */}
        <div className="text-center mb-10">
          <img src="/logo.png" alt="HIC Parenting" className="h-10 mx-auto mb-6" />
          <h1 className="text-2xl md:text-3xl font-bold text-[#1C2B3A] mb-2">
            Closer Application
          </h1>
          <p className="text-[#718096] text-sm">
            Join the HIC Parenting team. Fill out the form below to apply.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Personal Info */}
          <Section title="Personal Information">
            <Field label="Full Name" required>
              <input name="full_name" type="text" required className={inputClass} placeholder="Your full name" />
            </Field>
            <Field label="Email Address" required>
              <input name="email" type="email" required className={inputClass} placeholder="you@email.com" />
            </Field>
            <Field label="Country & Time Zone" required>
              <input name="country_timezone" type="text" required className={inputClass} placeholder="e.g. Colombia, GMT-5" />
            </Field>
            <Field label="Phone / WhatsApp Number" required>
              <input name="phone" type="text" required className={inputClass} placeholder="+1 234 567 8900" />
            </Field>
            <Field label="How did you hear about this opportunity?">
              <select name="how_heard" className={inputClass} defaultValue="">
                <option value="" disabled>Select an option</option>
                {HOW_HEARD_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
          </Section>

          {/* Experience & Skills */}
          <Section title="Experience & Skills">
            <Field label="What's your English level?">
              <select name="english_level" className={inputClass} defaultValue="">
                <option value="" disabled>Select your level</option>
                {ENGLISH_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Have you worked as a High-Ticket Closer taking sales calls (Zoom/Phone) before?">
              <select name="has_experience" className={inputClass} defaultValue="">
                <option value="" disabled>Select an option</option>
                {EXPERIENCE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="What CRM or tools have you used before?" required>
              <input name="crm_tools" type="text" required className={inputClass} placeholder="e.g. HubSpot, Close, GoHighLevel..." />
            </Field>
          </Section>

          {/* Availability */}
          <Section title="Availability">
            <Field label="How many hours per day can you dedicate to this role?">
              <select name="hours_per_day" className={inputClass} defaultValue="">
                <option value="" disabled>Select hours</option>
                {HOURS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
          </Section>

          {/* Sales Performance */}
          <Section title="Sales Performance">
            <Field label="Please detail your past sales performance" required>
              <textarea name="past_sales_performance" rows={4} required className={inputClass} placeholder="Describe your sales track record..." />
            </Field>
            <Field label="What was your total 'Cash Collected' in your best month?" required>
              <input name="best_month_cash_collected" type="number" step="0.01" min="0" required className={inputClass} placeholder="Format: USD amount (e.g. 15000.00)" />
            </Field>
            <Field label="Which sales methodologies are you familiar with or trained in?" required>
              <textarea name="sales_methodologies" rows={3} required className={inputClass} placeholder="e.g. SPIN Selling, Sandler, Challenger Sale..." />
            </Field>
          </Section>

          {/* Objection Handling & Closing */}
          <Section title="Objection Handling & Closing">
            <Field label="You are on a call with a qualified parent. They love the program, but at the end they say: 'I need to think about it' or 'I need to speak with my spouse/partner first.' How do you respond?" required>
              <textarea name="objection_handling" rows={5} required className={inputClass} placeholder="Describe how you would handle this objection..." />
            </Field>
            <Field label="What do you consider your biggest superpower when closing a deal?" required>
              <textarea name="closing_superpower" rows={3} required className={inputClass} placeholder="Your closing superpower..." />
            </Field>
          </Section>

          {/* Availability & Tools */}
          <Section title="Availability & Tools">
            <Field label="What's your typical availability in your local time?" required>
              <input name="availability" type="text" required className={inputClass} placeholder="e.g. 9am - 5pm" />
            </Field>
            <Field label="What CRM or sales tools are you proficient in?" required>
              <input name="crm_tools_proficient" type="text" required className={inputClass} placeholder="e.g. HubSpot, Salesforce, GoHighLevel..." />
            </Field>
            <Field label="Are you available to start immediately?" required>
              <select name="available_immediately" required className={inputClass} defaultValue="">
                <option value="" disabled>Select an option</option>
                {AVAILABLE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
          </Section>

          {/* About You */}
          <Section title="About You">
            <Field label="Why do you want to work with HIC Parenting?" required>
              <textarea name="why_hic" rows={3} required className={inputClass} placeholder="Tell us why..." />
            </Field>
            <Field label="What's your biggest strength when speaking to potential clients?" required>
              <textarea name="biggest_strength" rows={3} required className={inputClass} placeholder="Your biggest strength..." />
            </Field>
            <Field label="How do you see yourself in 2 years?" required>
              <textarea name="five_year_vision" rows={3} required className={inputClass} placeholder="Your vision..." />
            </Field>
          </Section>

          {/* Video */}
          <Section title="Video Introduction">
            <Field label="Paste a link to your 1-minute video introduction (Loom, YouTube, Google Drive, etc.)" required>
              <input name="video_url" type="url" required className={inputClass} placeholder="https://..." />
            </Field>
          </Section>

          {/* Confirmations */}
          <Section title="Confirmations">
            <label className="flex items-start gap-3 cursor-pointer">
              <input name="confirmed_job_description" type="checkbox" required className="mt-1 h-4 w-4 rounded border-[#E8E4DC] text-[#F59E0B] focus:ring-[#F59E0B]" />
              <span className="text-sm text-[#1C2B3A]">
                I confirm that I&apos;ve read and understood the job description <span className="text-red-500">*</span>
              </span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input name="confirmed_remote" type="checkbox" required className="mt-1 h-4 w-4 rounded border-[#E8E4DC] text-[#F59E0B] focus:ring-[#F59E0B]" />
              <span className="text-sm text-[#1C2B3A]">
                I understand that this is a remote position with performance-based compensation <span className="text-red-500">*</span>
              </span>
            </label>
          </Section>

          {/* Additional */}
          <Field label="Any additional comments or questions?">
            <textarea name="additional_comments" rows={3} className={inputClass} placeholder="Anything else you'd like us to know..." />
          </Field>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 px-6 bg-[#F59E0B] hover:bg-[#D97706] disabled:opacity-50 text-white font-semibold rounded-xl transition-colors text-sm"
          >
            {submitting ? 'Submitting...' : 'Submit Application'}
          </button>
        </form>
      </div>
    </div>
  )
}

const inputClass =
  'w-full px-4 py-2.5 rounded-xl border border-[#E8E4DC] bg-white text-[#1C2B3A] text-sm placeholder:text-[#B0ADA7] focus:outline-none focus:ring-2 focus:ring-[#F59E0B]/40 focus:border-[#F59E0B] transition-colors'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-[#E8E4DC] p-5 md:p-6 space-y-5">
      <h2 className="text-base font-semibold text-[#1C2B3A] pb-2 border-b border-[#E8E4DC]">{title}</h2>
      {children}
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-[#1C2B3A]">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  )
}
