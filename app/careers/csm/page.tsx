'use client'

import { useState } from 'react'

export const dynamic = 'force-dynamic'

const TOOLS_OPTIONS = [
  'Kajabi',
  'Go High Level',
  'Airtable',
  'Slack',
  'Zoom',
  'CRM Systems',
  'Google Workspace',
  'Other',
]

const CLIENTS_MANAGED_OPTIONS = ['1–20', '21–50', '51–100', '100+']

export default function CSMApplicationPage() {
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    const fd = new FormData(e.currentTarget)

    // Collect multi-select checkboxes
    const tools_used = TOOLS_OPTIONS.filter(tool => fd.get(`tool_${tool}`) === 'on')

    const data = {
      position: 'csm',
      full_name: fd.get('full_name'),
      email: fd.get('email'),
      phone: fd.get('phone'),
      country_timezone: fd.get('country_timezone'),
      linkedin_url: fd.get('linkedin_url') || null,
      resume_url: fd.get('resume_url') || null,
      past_experience: fd.get('past_experience'),
      tools_used,
      clients_managed_range: fd.get('clients_managed_range'),
      prioritization_answer: fd.get('prioritization_answer'),
      difficult_situation: fd.get('difficult_situation'),
      welcome_message: fd.get('welcome_message'),
      missed_session_message: fd.get('missed_session_message'),
      client_not_working_response: fd.get('client_not_working_response'),
      csm_responsibility: fd.get('csm_responsibility'),
      re_engagement_steps: fd.get('re_engagement_steps'),
      culture_fit_why: fd.get('culture_fit_why'),
      excites_most: fd.get('excites_most'),
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
            Client Success Manager Application
          </h1>
          <p className="text-[#718096] text-sm">
            Join the HIC Parenting team. Fill out the form below to apply.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <Section title="Basic Information">
            <Field label="Full Name" required>
              <input name="full_name" type="text" required className={inputClass} placeholder="Your full name" />
            </Field>
            <Field label="Email Address" required>
              <input name="email" type="email" required className={inputClass} placeholder="you@email.com" />
            </Field>
            <Field label="Phone Number" required>
              <input name="phone" type="text" required className={inputClass} placeholder="+1 234 567 8900" />
            </Field>
            <Field label="Country & Time Zone" required>
              <input name="country_timezone" type="text" required className={inputClass} placeholder="e.g. Colombia, GMT-5" />
            </Field>
            <Field label="LinkedIn Profile">
              <input name="linkedin_url" type="url" className={inputClass} placeholder="https://linkedin.com/in/yourprofile" />
            </Field>
            <Field label="Paste a link to your resume (Google Drive, Dropbox, etc.)">
              <input name="resume_url" type="url" className={inputClass} placeholder="https://..." />
            </Field>
          </Section>

          {/* Experience */}
          <Section title="Experience">
            <Field label="Tell us about your experience in Customer Success, Account Management, Client Support, Community Management, or similar roles." required>
              <textarea name="past_experience" rows={5} required className={inputClass} placeholder="Describe your relevant experience..." />
            </Field>

            <Field label="What tools have you worked with? (Check all that apply)" required>
              <div className="grid grid-cols-2 gap-2">
                {TOOLS_OPTIONS.map(tool => (
                  <label key={tool} className="flex items-center gap-2 cursor-pointer">
                    <input
                      name={`tool_${tool}`}
                      type="checkbox"
                      className="h-4 w-4 rounded border-[#E8E4DC] text-[#F59E0B] focus:ring-[#F59E0B]"
                    />
                    <span className="text-sm text-[#1C2B3A]">{tool}</span>
                  </label>
                ))}
              </div>
            </Field>

            <Field label="Approximately how many clients have you managed at one time?" required>
              <div className="space-y-2">
                {CLIENTS_MANAGED_OPTIONS.map(option => (
                  <label key={option} className="flex items-center gap-2 cursor-pointer">
                    <input
                      name="clients_managed_range"
                      type="radio"
                      value={option}
                      required
                      className="h-4 w-4 border-[#E8E4DC] text-[#F59E0B] focus:ring-[#F59E0B]"
                    />
                    <span className="text-sm text-[#1C2B3A]">{option}</span>
                  </label>
                ))}
              </div>
            </Field>
          </Section>

          {/* Organization & Problem Solving */}
          <Section title="Organization & Problem Solving">
            <Field label="You have: a new client to onboard, a client who missed a session, and a coach waiting for scheduling confirmation. How would you prioritize these tasks and why?" required>
              <textarea name="prioritization_answer" rows={5} required className={inputClass} placeholder="Describe how you would prioritize..." />
            </Field>
            <Field label="Tell us about a time you solved a difficult client situation. What happened and what was the outcome?" required>
              <textarea name="difficult_situation" rows={5} required className={inputClass} placeholder="Describe the situation..." />
            </Field>
          </Section>

          {/* Communication Assessment */}
          <Section title="Communication Assessment">
            <Field label="Write a welcome message for a new parent joining HIC Parenting." required>
              <textarea name="welcome_message" rows={5} required className={inputClass} placeholder="Write your welcome message..." />
            </Field>
            <Field label="Write a message to a client who missed a coaching session. The tone should be supportive and caring." required>
              <textarea name="missed_session_message" rows={5} required className={inputClass} placeholder="Write your message..." />
            </Field>
          </Section>

          {/* Client Success Mindset */}
          <Section title="Client Success Mindset">
            <Field label="A client says: 'I don't think this program is working for me.' How would you respond?" required>
              <textarea name="client_not_working_response" rows={5} required className={inputClass} placeholder="Write your response..." />
            </Field>
            <Field label="What do you believe is the most important responsibility of a Client Success Manager?" required>
              <textarea name="csm_responsibility" rows={4} required className={inputClass} placeholder="Share your perspective..." />
            </Field>
            <Field label="If a client stops attending sessions and engaging with the program, what steps would you take before they cancel?" required>
              <textarea name="re_engagement_steps" rows={5} required className={inputClass} placeholder="Describe your approach..." />
            </Field>
          </Section>

          {/* Culture Fit */}
          <Section title="Culture Fit">
            <Field label="Why do you want to work at HIC Parenting?" required>
              <textarea name="culture_fit_why" rows={4} required className={inputClass} placeholder="Tell us why..." />
            </Field>
            <Field label="What excites you most about helping parents succeed?" required>
              <textarea name="excites_most" rows={4} required className={inputClass} placeholder="Share what excites you..." />
            </Field>
          </Section>

          {/* Final Step */}
          <Section title="Final Step">
            <Field label="Please record a 2-minute video answering: Why are you interested in this position? What makes you a great Client Success Manager? Why would you be a great fit for HIC Parenting? Paste your video link below." required>
              <input name="video_url" type="url" required className={inputClass} placeholder="https://..." />
            </Field>

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
