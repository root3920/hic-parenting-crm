'use client'

import { useState } from 'react'

export const dynamic = 'force-dynamic'

const ENGLISH_OPTIONS = ['Basic', 'Intermediate', 'Upper-intermediate', 'Advanced', 'Native or bilingual']
const EXPERIENCE_OPTIONS = ['No direct experience', 'Less than 6 months', '6–12 months', '1–2 years', 'More than 2 years']
const CHANNEL_OPTIONS = ['Instagram DMs', 'Facebook Messenger', 'WhatsApp', 'SMS', 'Email', 'Phone calls', 'CRM conversations', 'Other']
const CRM_OPTIONS = ['GoHighLevel', 'HubSpot', 'Salesforce', 'Kajabi', 'ManyChat', 'Slack', 'ClickUp', 'Google Sheets', 'Other', 'I have not used a CRM']
const WORKING_OPTIONS = ['No', 'Yes, part-time', 'Yes, full-time', 'Occasionally or freelance']
const EQUIPMENT_OPTIONS = ['Yes, I have all three', 'I am missing one of these requirements', 'No']

export default function DMSetterApplicationPage() {
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [channels, setChannels] = useState<string[]>([])
  const [crmTools, setCrmTools] = useState<string[]>([])

  function toggleItem(arr: string[], setArr: (v: string[]) => void, item: string) {
    setArr(arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item])
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    const fd = new FormData(e.currentTarget)
    const data = {
      position: 'dm_setter',
      full_name: fd.get('full_name'),
      email: fd.get('email'),
      whatsapp_number: fd.get('whatsapp_number'),
      city_country_timezone: fd.get('city_country_timezone'),
      english_level_v2: fd.get('english_level_v2'),
      experience_years: fd.get('experience_years'),
      past_experience: fd.get('past_experience'),
      communication_channels: channels,
      crm_tools: crmTools,
      measurable_results: fd.get('measurable_results'),
      hours_schedule: fd.get('hours_schedule'),
      working_elsewhere: fd.get('working_elsewhere'),
      has_equipment: fd.get('has_equipment'),
      start_compensation: fd.get('start_compensation'),
      dm_exercise_1: fd.get('dm_exercise_1'),
      dm_exercise_2: fd.get('dm_exercise_2'),
      dm_exercise_3: fd.get('dm_exercise_3'),
      prioritization: fd.get('prioritization'),
      feedback_story: fd.get('feedback_story'),
      video_url: fd.get('video_url'),
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
        <div className="text-center max-w-lg">
          <img src="/logo.png" alt="HIC Parenting" className="h-10 mx-auto mb-8" />
          <div className="text-5xl mb-4">&#10003;</div>
          <h1 className="text-2xl font-bold text-[#1C2B3A] mb-3">Application submitted</h1>
          <p className="text-[#718096] text-base leading-relaxed">
            Thank you for applying to HIC Parenting. Our team will review your experience, availability, written responses, and video. Candidates selected for the next stage will receive an invitation to complete an additional assessment. Please monitor your email and WhatsApp.
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
            DM Setter Application &ndash; HIC Parenting
          </h1>
          <p className="text-[#718096] text-sm leading-relaxed max-w-xl mx-auto">
            Thank you for your interest in joining HIC Parenting. We are looking for a proactive, organized, warm, and results-driven DM Setter who can create genuine conversations, follow up consistently, qualify prospects, and guide the right people toward booking a call. Estimated completion time: 10&ndash;15 minutes.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section: Personal Information */}
          <Section title="Personal Information">
            <Field label="Full name" required>
              <input name="full_name" type="text" required className={inputClass} placeholder="Your full name" />
            </Field>
            <Field label="Email address" required>
              <input name="email" type="email" required className={inputClass} placeholder="you@email.com" />
            </Field>
            <Field label="WhatsApp number including country code" required>
              <input name="whatsapp_number" type="text" required className={inputClass} placeholder="+1 234 567 8900" />
            </Field>
            <Field label="City, country, and time zone" required>
              <input name="city_country_timezone" type="text" required className={inputClass} placeholder="e.g. Bogota, Colombia, GMT-5" />
            </Field>
            <Field label="How would you describe your English level?" required>
              <select name="english_level_v2" required className={inputClass} defaultValue="">
                <option value="" disabled>Select your level</option>
                {ENGLISH_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
          </Section>

          {/* Section: Experience */}
          <Section title="Experience">
            <Field label="How much experience do you have in appointment setting, sales, lead generation, or customer service?" required>
              <select name="experience_years" required className={inputClass} defaultValue="">
                <option value="" disabled>Select an option</option>
                {EXPERIENCE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Please briefly describe your most relevant professional experience." required>
              <textarea name="past_experience" rows={3} required className={inputClass} placeholder="Your relevant experience..." />
            </Field>
            <Field label="Which communication channels have you used professionally?">
              <div className="flex flex-wrap gap-2 mt-1">
                {CHANNEL_OPTIONS.map(ch => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => toggleItem(channels, setChannels, ch)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      channels.includes(ch)
                        ? 'bg-[#185FA5] text-white border-[#185FA5]'
                        : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'
                    }`}
                  >
                    {ch}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Which tools or CRMs have you used?">
              <div className="flex flex-wrap gap-2 mt-1">
                {CRM_OPTIONS.map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleItem(crmTools, setCrmTools, t)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      crmTools.includes(t)
                        ? 'bg-[#185FA5] text-white border-[#185FA5]'
                        : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Please share your most recent measurable results. Include numbers whenever possible.">
              <p className="text-xs text-[#718096] mb-1">Examples: conversations managed, appointments booked, booking rate, show rate, response rate, or sales influenced.</p>
              <textarea name="measurable_results" rows={3} className={inputClass} placeholder="Your measurable results..." />
            </Field>
          </Section>

          {/* Section: Availability and Requirements */}
          <Section title="Availability and Requirements">
            <Field label="How many hours per day are you available to work, and what is your available schedule?" required>
              <p className="text-xs text-[#718096] mb-1">Please include your local time zone.</p>
              <textarea name="hours_schedule" rows={3} required className={inputClass} placeholder="e.g. 6 hours/day, 9am-3pm EST" />
            </Field>
            <Field label="Are you currently working with another company or client?" required>
              <select name="working_elsewhere" required className={inputClass} defaultValue="">
                <option value="" disabled>Select an option</option>
                {WORKING_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Do you have your own computer, stable internet, and a quiet workspace?" required>
              <select name="has_equipment" required className={inputClass} defaultValue="">
                <option value="" disabled>Select an option</option>
                {EQUIPMENT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="When would you be available to start, and what is your expected monthly compensation in USD?" required>
              <textarea name="start_compensation" rows={2} required className={inputClass} placeholder="Start date and expected compensation..." />
            </Field>
          </Section>

          {/* Section: Practical DM Exercise */}
          <Section title="Practical DM Exercise">
            <p className="text-sm text-[#718096]">Please write the exact message you would send.</p>
            <Field label={'A mother replies to an Instagram story and says: \u201CI\'m interested, but I\'m not sure this would work for my family.\u201D How would you continue the conversation?'} required>
              <textarea name="dm_exercise_1" rows={4} required className={inputClass} placeholder="Your message..." />
            </Field>
            <Field label="A prospect had a positive conversation with you and received the booking link 48 hours ago, but she has not scheduled a call. Write the follow-up message you would send." required>
              <textarea name="dm_exercise_2" rows={4} required className={inputClass} placeholder="Your follow-up message..." />
            </Field>
            <Field label={'\u201CI really need help, but I don\u2019t have time for a call right now.\u201D How would you respond?'} required>
              <textarea name="dm_exercise_3" rows={4} required className={inputClass} placeholder="Your response..." />
            </Field>
          </Section>

          {/* Section: Organization and Performance */}
          <Section title="Organization and Performance">
            <Field label={'You begin your shift and see these conversations:\nA. A prospect requested the booking link 10 minutes ago.\nB. A prospect has a call tomorrow but has not confirmed.\nC. A prospect has not responded in five days.\nD. A new prospect just replied, \u201CI\'m ready to learn more.\u201D\nE. A prospect clearly said she is no longer interested.\nIn what order would you handle them, and why?'} required>
              <textarea name="prioritization" rows={5} required className={inputClass} placeholder="Your prioritization and reasoning..." />
            </Field>
            <Field label="Tell us about a time you received feedback about your communication or performance. What did you change afterward?" required>
              <textarea name="feedback_story" rows={4} required className={inputClass} placeholder="Your experience..." />
            </Field>
          </Section>

          {/* Section: Video */}
          <Section title="Video">
            <Field label={'Share a link to a video of no more than 90 seconds answering:\n1. Who are you?\n2. What relevant experience do you have?\n3. What measurable result are you most proud of?\n4. Why would you be a good fit for HIC Parenting?\nYou may use Loom, Google Drive, or YouTube Unlisted. Please confirm that the link is accessible.'} required>
              <input name="video_url" type="url" required className={inputClass} placeholder="https://..." />
            </Field>
          </Section>

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
      <label className="block text-sm font-medium text-[#1C2B3A] whitespace-pre-line">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  )
}
