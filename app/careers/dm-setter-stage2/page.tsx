'use client'

import { useState } from 'react'

export const dynamic = 'force-dynamic'

const inputClass = 'w-full px-4 py-2.5 rounded-xl border border-[#E8E4DC] bg-white text-[#1C2B3A] text-sm placeholder:text-[#B0ADA7] focus:outline-none focus:ring-2 focus:ring-[#F59E0B]/40 focus:border-[#F59E0B] transition-colors'

const RANKING_ITEMS_DEFAULT = [
  'Achieving clear goals.',
  'Receiving recognition.',
  'Helping people find the right support.',
  'Earning commissions or bonuses.',
  'Learning and improving professionally.',
]

const Q14_OPTIONS = [
  'Following up consistently.',
  'Working with performance goals.',
  'Managing several conversations.',
  'Handling rejection or no response.',
  'Following scripts and processes.',
  'Keeping CRM information updated.',
  'None of the above.',
  'Other.',
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-[#E8E4DC] p-5 md:p-6 space-y-5">
      <h2 className="text-base font-semibold text-[#1C2B3A] pb-2 border-b border-[#E8E4DC]">{title}</h2>
      {children}
    </div>
  )
}

function Field({ label, required, helper, children }: { label: string; required?: boolean; helper?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-[#1C2B3A] whitespace-pre-line">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {helper && <p className="text-xs text-[#B0ADA7]">{helper}</p>}
      {children}
    </div>
  )
}

function LikertScale({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  const labels = ['Strongly disagree', 'Disagree', 'Neither agree nor disagree', 'Agree', 'Strongly agree']
  return (
    <div className="flex flex-wrap gap-2">
      {[1, 2, 3, 4, 5].map(n => {
        const isSelected = value === n
        let bg = 'bg-white border-[#E8E4DC] text-[#718096] hover:border-[#F59E0B]'
        if (isSelected) {
          if (n <= 2) bg = 'bg-red-500 text-white border-red-500'
          else if (n === 3) bg = 'bg-amber-500 text-white border-amber-500'
          else bg = 'bg-emerald-500 text-white border-emerald-500'
        }
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`px-3 py-2 rounded-xl border text-xs font-medium transition-colors ${bg}`}
          >
            {n} — {labels[n - 1]}
          </button>
        )
      })}
    </div>
  )
}

export default function DMSetterStage2Page() {
  const [email, setEmail] = useState('')
  const [q1, setQ1] = useState<number | null>(null)
  const [q2, setQ2] = useState<number | null>(null)
  const [q3, setQ3] = useState<number | null>(null)
  const [q4, setQ4] = useState<number | null>(null)
  const [q5, setQ5] = useState<number | null>(null)
  const [q6, setQ6] = useState<number | null>(null)
  const [q7, setQ7] = useState<number | null>(null)
  const [q8, setQ8] = useState<number | null>(null)
  const [q9, setQ9] = useState('')
  const [q10, setQ10] = useState('')
  const [q11, setQ11] = useState('')
  const [q12, setQ12] = useState('')
  const [q13Ranking, setQ13Ranking] = useState<string[]>([...RANKING_ITEMS_DEFAULT])
  const [q14, setQ14] = useState('')
  const [q15, setQ15] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  function moveRankingItem(index: number, direction: 'up' | 'down') {
    const newRanking = [...q13Ranking]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= newRanking.length) return
    ;[newRanking[index], newRanking[targetIndex]] = [newRanking[targetIndex], newRanking[index]]
    setQ13Ranking(newRanking)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')

    // Validation
    if (!email) { setError('Please enter your email address.'); return }
    if ([q1, q2, q3, q4, q5, q6, q7, q8].some(v => v === null)) { setError('Please answer all Work Style questions (Q1–Q8).'); return }
    if (!q9 || !q10 || !q11 || !q12) { setError('Please answer all Situational Judgment questions (Q9–Q12).'); return }
    if (!q15.trim()) { setError('Please answer the final open-ended question.'); return }

    setSubmitting(true)

    const data = {
      email,
      q1, q2, q3, q4, q5, q6, q7, q8,
      q9, q10, q11, q12,
      q13_ranking: q13Ranking,
      q14,
      q15,
    }

    try {
      const res = await fetch('/api/careers/stage2', {
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
          <h1 className="text-2xl font-bold text-[#1C2B3A] mb-3">Assessment Completed</h1>
          <p className="text-[#718096] text-base leading-relaxed">
            Thank you for completing this stage of the HIC Parenting hiring process. Our team will review your answers together with your original application and practical exercise. If you advance to the next stage, we will contact you using the email address or WhatsApp number provided in your application.
          </p>
          <p className="text-[#718096] text-sm mt-4 font-medium">HIC Parenting Team</p>
        </div>
      </div>
    )
  }

  const q9Options = [
    { letter: 'A', text: 'Update the information and continue working without mentioning it.' },
    { letter: 'B', text: 'Update the information, notify the person involved, and explain what happened.' },
    { letter: 'C', text: 'Wait to see if the missing information causes a problem.' },
    { letter: 'D', text: 'Ask another team member to fix it.' },
  ]

  const q10Options = [
    { letter: 'A', text: 'Give her a detailed parenting recommendation.' },
    { letter: 'B', text: 'Tell her that you cannot help and end the conversation.' },
    { letter: 'C', text: 'Validate how she feels, avoid giving clinical advice, and ask questions to understand what support she is looking for.' },
    { letter: 'D', text: 'Immediately send the booking link.' },
  ]

  const q11Options = [
    { letter: 'A', text: 'Send the booking link because booking calls is the main goal.' },
    { letter: 'B', text: 'Ask additional questions and only guide her toward a call if the program may genuinely fit her needs.' },
    { letter: 'C', text: 'Stop responding.' },
    { letter: 'D', text: 'Tell her directly that she cannot join.' },
  ]

  const q12Options = [
    { letter: 'A', text: 'Assume the leads are not qualified enough.' },
    { letter: 'B', text: 'Increase the number of messages without reviewing anything else.' },
    { letter: 'C', text: 'Review your conversations, follow-up rate, response time, objections, and ask for feedback.' },
    { letter: 'D', text: 'Wait until the end of the month to determine whether there is a real problem.' },
  ]

  function renderRadioOptions(options: { letter: string; text: string }[], value: string, onChange: (v: string) => void) {
    return (
      <div className="space-y-2">
        {options.map(option => {
          const optionValue = option.letter
          return (
            <button
              key={optionValue}
              type="button"
              onClick={() => onChange(optionValue)}
              className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-colors ${
                value === optionValue
                  ? 'border-[#F59E0B] bg-[#F59E0B]/10 text-[#1C2B3A]'
                  : 'border-[#E8E4DC] text-[#718096] hover:border-[#F59E0B]/50'
              }`}
            >
              <span className="font-semibold">{option.letter}.</span> {option.text}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8] py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <img src="/logo.png" alt="HIC Parenting" className="h-10 mx-auto mb-8" />
          <h1 className="text-2xl font-bold text-[#1C2B3A] mb-3">Getting to Know Your Work Style</h1>
          <p className="text-[#718096] text-sm leading-relaxed max-w-xl mx-auto">
            Thank you for continuing in the HIC Parenting hiring process. This short assessment will help us better understand how you approach goals, feedback, follow-up, teamwork, and challenging situations. There are no perfect answers. Please respond honestly based on how you normally work, not on what you think we expect. Your answers will be reviewed together with your application, practical exercise, and interview.
          </p>
          <p className="text-[#718096] text-sm mt-3 font-medium">Estimated completion time: 10–12 minutes.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Email */}
          <Section title="Contact">
            <Field label="Email address" required helper="Please use the same email you used in your Stage 1 application.">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className={inputClass}
                placeholder="your@email.com"
                required
              />
            </Field>
          </Section>

          {/* Section 1: Work Style */}
          <Section title="Section 1: Work Style">
            <p className="text-sm text-[#718096]">Please indicate how much you agree with each statement.</p>

            <Field label="1. I can stay consistent with follow-ups even when I do not receive immediate responses or results." required>
              <LikertScale value={q1} onChange={setQ1} />
            </Field>

            <Field label="2. I feel comfortable working with weekly goals and having my performance reviewed using numbers." required>
              <LikertScale value={q2} onChange={setQ2} />
            </Field>

            <Field label="3. I follow agreed processes even when I believe there may be a better way to do something." required>
              <LikertScale value={q3} onChange={setQ3} />
            </Field>

            <Field label="4. I can receive direct feedback without taking it personally." required>
              <LikertScale value={q4} onChange={setQ4} />
            </Field>

            <Field label="5. When I make a mistake, I report it promptly instead of trying to solve it without telling anyone." required>
              <LikertScale value={q5} onChange={setQ5} />
            </Field>

            <Field label="6. Repetitive tasks can affect my motivation." required>
              <LikertScale value={q6} onChange={setQ6} />
            </Field>

            <Field label="7. I remain calm and professional when several prospects respond at the same time." required>
              <LikertScale value={q7} onChange={setQ7} />
            </Field>

            <Field label="8. I am comfortable asking for help when I am unsure how to handle a conversation." required>
              <LikertScale value={q8} onChange={setQ8} />
            </Field>
          </Section>

          {/* Section 2: Situational Judgment */}
          <Section title="Section 2: Situational Judgment">
            <p className="text-sm text-[#718096]">For each scenario, select the option that best represents what you would do.</p>

            <Field label="9. You notice that one of your conversations was not properly updated in the CRM, and another team member may not have the full context. What would you do?" required>
              {renderRadioOptions(q9Options, q9, setQ9)}
            </Field>

            <Field label="10. A prospect appears emotionally overwhelmed and asks you what she should do with her child. What is the best response?" required>
              {renderRadioOptions(q10Options, q10, setQ10)}
            </Field>

            <Field label="11. You believe a prospect is not a good fit for the program, but she is ready to book a call. What would you do?" required>
              {renderRadioOptions(q11Options, q11, setQ11)}
            </Field>

            <Field label="12. Your booking numbers are below target for the second week in a row. What would you do first?" required>
              {renderRadioOptions(q12Options, q12, setQ12)}
            </Field>
          </Section>

          {/* Section 3: Motivation and Commitment */}
          <Section title="Section 3: Motivation and Commitment">
            <Field label="13. Rank the following from what motivates you MOST to what motivates you LEAST." required>
              <div className="space-y-2">
                {q13Ranking.map((item, index) => (
                  <div key={item} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[#E8E4DC] bg-white">
                    <span className="flex items-center justify-center h-7 w-7 rounded-full bg-[#F59E0B] text-white text-xs font-bold">{index + 1}</span>
                    <span className="flex-1 text-sm text-[#1C2B3A]">{item}</span>
                    <div className="flex flex-col gap-0.5">
                      <button type="button" onClick={() => moveRankingItem(index, 'up')} disabled={index === 0} className="p-1 rounded hover:bg-zinc-100 disabled:opacity-30">&#9650;</button>
                      <button type="button" onClick={() => moveRankingItem(index, 'down')} disabled={index === q13Ranking.length - 1} className="p-1 rounded hover:bg-zinc-100 disabled:opacity-30">&#9660;</button>
                    </div>
                  </div>
                ))}
              </div>
            </Field>

            <Field label="14. Which part of the DM Setter role do you believe would be most challenging for you?" required>
              <div className="space-y-2">
                {Q14_OPTIONS.map(option => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setQ14(option)}
                    className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-colors ${
                      q14 === option
                        ? 'border-[#F59E0B] bg-[#F59E0B]/10 text-[#1C2B3A]'
                        : 'border-[#E8E4DC] text-[#718096] hover:border-[#F59E0B]/50'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="15. What helps you stay committed and perform well during periods when results are slower than expected?" required>
              <textarea
                value={q15}
                onChange={e => setQ15(e.target.value)}
                className={inputClass}
                rows={4}
                required
              />
            </Field>
          </Section>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-xl bg-[#F59E0B] hover:bg-[#D97706] text-white font-semibold text-sm transition-colors disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Submit Assessment'}
          </button>
        </form>
      </div>
    </div>
  )
}
