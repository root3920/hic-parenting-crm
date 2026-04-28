'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import PhoneInput, { type Country } from 'react-phone-number-input'
import 'react-phone-number-input/style.css'

// ─── Types ──────────��───────────────────────────────────────────────────────

interface MCOption {
  label: string
  qualified: boolean
}

interface Question {
  id: string
  title: string
  type: 'text' | 'email' | 'phone' | 'textarea' | 'mc'
  description?: string
  options?: MCOption[]
  required?: boolean
  placeholder?: string
}

// ─── Questions ─────────���─────────────────────────────��──────────────────────

const QUESTIONS: Question[] = [
  {
    id: 'name',
    title: 'What is your name?',
    type: 'text',
    required: true,
    placeholder: 'Your full name',
  },
  {
    id: 'email',
    title: 'What is your email?',
    type: 'email',
    required: true,
    placeholder: 'your@email.com',
  },
  {
    id: 'phone',
    title: 'What is your phone number?',
    type: 'phone',
    required: true,
  },
  {
    id: 'q4_source',
    title: 'Where did you see the invitation to book a call?',
    type: 'text',
    required: true,
    placeholder: 'Instagram, Facebook, a friend, etc.',
  },
  {
    id: 'q5_children_struggle',
    title: "Please provide your child(ren)'s age(s) and the parenting struggle that pulled you to book a Parenting Assessment Call:",
    type: 'textarea',
    required: true,
    placeholder: "My child is 7 years old and we're struggling with...",
  },
  {
    id: 'q6_why_now',
    title: 'Why is now the time to overcome this struggle?',
    type: 'textarea',
    required: true,
    placeholder: 'What made you decide that now is the right time?',
  },
  {
    id: 'q7_investment',
    title: 'What to expect from our time together:',
    type: 'mc',
    description: `You'll meet with one of our HIC Parenting Advisors (Marcela is one of them) on Google Meet for about 45 minutes. This is not a free coaching session; this is an assessment where we learn about your family's unique dynamics, understand where you are now, help you envision where you want to be, and then determine together if our HIC Parenting Program is the perfect fit for your family.\n\nPlease select the option that best describes your situation:`,
    options: [
      { label: 'I can invest in coaching with Marcela and her team if I am 100% sure that\'s what I need to bring peace to my parenting and have a great relationship with my children.', qualified: true },
      { label: 'My partner is the financial decision-maker and would never support me investing in direct parenting coaching.', qualified: false },
      { label: "I can't pay to work directly with a Parenting coach.", qualified: false },
    ],
  },
  {
    id: 'q8_spouse',
    title: 'Is your spouse or relative available to join the call?',
    type: 'mc',
    description: 'If you parent with someone else, it is important you choose a time and a date both can join so our HIC Parenting advisor can perform an accurate assessment of your whole parenting dynamic. Then, together, you can decide if you want to continue with us.',
    options: [
      { label: 'I am a single parent and the sole decision-maker.', qualified: true },
      { label: 'We can both join the Google Meet.', qualified: true },
      { label: 'No, there is no way possible my spouse or relative can attend the call.', qualified: false },
    ],
  },
  {
    id: 'q9_situation',
    title: 'Which of the following best describes your current situation in terms of work and caregiving responsibilities?',
    type: 'mc',
    options: [
      { label: 'I am a single stay-at-home parent and the primary caregiver.', qualified: false },
      { label: 'I am a married stay-at-home parent and the primary caregiver.', qualified: true },
      { label: 'I work from home and am also the primary caregiver.', qualified: true },
      { label: 'I am a single working parent and share caregiving with family or daycare.', qualified: true },
      { label: 'I am a married working parent and share caregiving with my spouse or partner.', qualified: true },
      { label: 'My spouse and I are stay-at-home parents with no jobs outside of caring for our children at the moment.', qualified: false },
    ],
  },
]

const TOTAL = QUESTIONS.length

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ApplyPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-[#185FA5]" />
      </div>
    }>
      <ApplyForm />
    </Suspense>
  )
}

function ApplyForm() {
  const searchParams = useSearchParams()
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [phoneCountry, setPhoneCountry] = useState<Country>('US')
  const [evaluating, setEvaluating] = useState(false)
  const [direction, setDirection] = useState<'forward' | 'back'>('forward')
  const [error, setError] = useState('')

  // UTM params
  const setter = searchParams.get('setter') ?? ''
  const utmSource = searchParams.get('utm_source') ?? ''
  const utmMedium = searchParams.get('utm_medium') ?? ''
  const utmCampaign = searchParams.get('utm_campaign') ?? ''

  const q = QUESTIONS[step]
  const answer = answers[q.id] ?? ''
  const isValid = q.required ? answer.trim().length > 0 : true
  const isLast = step === TOTAL - 1

  const setAnswer = useCallback((val: string) => {
    setAnswers(prev => ({ ...prev, [QUESTIONS[step].id]: val }))
    setError('')
  }, [step])

  function goNext() {
    if (!isValid) {
      setError('This field is required')
      return
    }
    if (isLast) {
      handleSubmit()
    } else {
      setDirection('forward')
      setStep(s => s + 1)
      setError('')
    }
  }

  function goBack() {
    if (step > 0) {
      setDirection('back')
      setStep(s => s - 1)
      setError('')
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Enter' && q.type !== 'textarea') {
        e.preventDefault()
        goNext()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  })

  async function handleSubmit() {
    setEvaluating(true)

    // Evaluate qualification
    const q7Option = QUESTIONS[6].options?.find(o => o.label === answers.q7_investment)
    const q8Option = QUESTIONS[7].options?.find(o => o.label === answers.q8_spouse)
    const q9Option = QUESTIONS[8].options?.find(o => o.label === answers.q9_situation)

    const q7Qualified = q7Option?.qualified ?? true
    const q8Qualified = q8Option?.qualified ?? true
    const q9Qualified = q9Option?.qualified ?? true

    const dqCount = [q7Qualified, q8Qualified, q9Qualified].filter(v => !v).length
    const isQualified = dqCount === 0

    // Derive country name from phone country code
    let countryName = ''
    try {
      const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })
      countryName = regionNames.of(phoneCountry) ?? phoneCountry
    } catch {
      countryName = phoneCountry
    }

    // Save to DB
    try {
      await fetch('/api/surveys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: answers.name,
          email: answers.email,
          phone: answers.phone ?? '',
          country: countryName,
          q4_source: answers.q4_source,
          q5_children_struggle: answers.q5_children_struggle,
          q6_why_now: answers.q6_why_now,
          q7_investment: answers.q7_investment,
          q7_qualified: q7Qualified,
          q8_spouse: answers.q8_spouse,
          q8_qualified: q8Qualified,
          q9_situation: answers.q9_situation,
          q9_qualified: q9Qualified,
          is_qualified: isQualified,
          disqualifying_count: dqCount,
          setter: setter,
          utm_source: utmSource,
          utm_medium: utmMedium,
          utm_campaign: utmCampaign,
        }),
      })
    } catch (err) {
      console.error('Failed to save survey:', err)
    }

    // Delay for "evaluating" screen, then redirect
    await new Promise(r => setTimeout(r, 1500))

    if (isQualified) {
      window.location.href = 'https://api.hicparenting.com/widget/bookings/calendar-qa'
    } else {
      window.location.href = 'https://enroll.hicparenting.com/confirmation-setter-dq'
    }
  }

  // ── Evaluating screen ──
  if (evaluating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-4">
        <div className="text-center">
          <div className="mx-auto mb-5">
            <Image src="/logo.png" alt="HIC Parenting" width={140} height={40} className="mx-auto" />
          </div>
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="h-2 w-2 rounded-full bg-blue-500 animate-bounce [animation-delay:0ms]" />
            <div className="h-2 w-2 rounded-full bg-blue-500 animate-bounce [animation-delay:150ms]" />
            <div className="h-2 w-2 rounded-full bg-blue-500 animate-bounce [animation-delay:300ms]" />
          </div>
          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Evaluating your application...</p>
        </div>
      </div>
    )
  }

  // ── Form ──
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 bg-zinc-50 dark:bg-zinc-950">
      {/* Logo */}
      <div className="mb-6">
        <Image src="/logo.png" alt="HIC Parenting" width={140} height={40} />
      </div>

      {/* Card */}
      <div className="w-full max-w-[600px] bg-white dark:bg-zinc-900 rounded-2xl shadow-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        {/* Progress bar */}
        <div className="h-1 bg-zinc-100 dark:bg-zinc-800">
          <div
            className="h-full bg-[#185FA5] transition-all duration-500 ease-out"
            style={{ width: `${((step + 1) / TOTAL) * 100}%` }}
          />
        </div>

        {/* Question counter */}
        <div className="px-6 pt-5 pb-1">
          <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500">
            Question {step + 1} of {TOTAL}
          </p>
        </div>

        {/* Question body */}
        <div
          key={step}
          className={`px-6 pb-6 pt-2 ${
            direction === 'forward'
              ? 'animate-in fade-in slide-in-from-right-4 duration-300'
              : 'animate-in fade-in slide-in-from-left-4 duration-300'
          }`}
        >
          {/* Description box for MC questions */}
          {q.description && (
            <div className="mb-4 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 p-4">
              <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400 whitespace-pre-line">
                {q.description}
              </p>
            </div>
          )}

          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-4 leading-snug">
            {q.title}
          </h2>

          {/* Input by type */}
          {q.type === 'text' && (
            <input
              type="text"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder={q.placeholder}
              autoFocus
              className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 placeholder:text-zinc-400"
            />
          )}

          {q.type === 'email' && (
            <input
              type="email"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder={q.placeholder}
              autoFocus
              className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 placeholder:text-zinc-400"
            />
          )}

          {q.type === 'phone' && (
            <div className="phone-input-wrapper">
              <PhoneInput
                international
                defaultCountry="US"
                value={answer}
                onChange={(val) => setAnswer(val ?? '')}
                onCountryChange={(country) => { if (country) setPhoneCountry(country) }}
                className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus-within:ring-2 focus-within:ring-blue-500/30 focus-within:border-blue-400"
              />
            </div>
          )}

          {q.type === 'textarea' && (
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder={q.placeholder}
              rows={4}
              autoFocus
              className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 resize-y placeholder:text-zinc-400"
            />
          )}

          {q.type === 'mc' && q.options && (
            <div className="space-y-2.5">
              {q.options.map((opt, i) => {
                const selected = answer === opt.label
                return (
                  <button
                    key={i}
                    onClick={() => setAnswer(opt.label)}
                    className={`w-full text-left rounded-xl border-2 px-4 py-3.5 transition-all text-sm leading-snug ${
                      selected
                        ? 'border-[#185FA5] bg-blue-50 dark:bg-blue-900/20 text-zinc-900 dark:text-zinc-100'
                        : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                        selected
                          ? 'border-[#185FA5] bg-[#185FA5]'
                          : 'border-zinc-300 dark:border-zinc-600'
                      }`}>
                        {selected && (
                          <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                      <span>{opt.label}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="mt-2 text-xs text-red-500">{error}</p>
          )}
        </div>

        {/* Navigation */}
        <div className="px-6 pb-6 flex items-center justify-between gap-3">
          {step > 0 ? (
            <button
              onClick={goBack}
              className="px-4 py-2.5 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
            >
              &larr; Back
            </button>
          ) : (
            <div />
          )}
          <button
            onClick={goNext}
            disabled={!isValid}
            className="px-8 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: '#185FA5' }}
          >
            {isLast ? 'Submit' : 'Next \u2192'}
          </button>
        </div>
      </div>

      {/* Setter info if present */}
      {setter && (
        <p className="mt-4 text-xs text-zinc-400 dark:text-zinc-500">
          Referred by: {setter}
        </p>
      )}

      <style jsx global>{`
        .phone-input-wrapper .PhoneInputInput {
          background: transparent;
          border: none;
          outline: none;
          font-size: 0.875rem;
          color: inherit;
          width: 100%;
        }
        .phone-input-wrapper .PhoneInputCountry {
          margin-right: 0.5rem;
        }
      `}</style>
    </div>
  )
}
