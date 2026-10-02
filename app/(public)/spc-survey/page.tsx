'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'

// ─── Question types ────────────────────────────────────────────────────────

type QuestionType = 'scale5' | 'mc' | 'multi' | 'textarea' | 'nps' | 'email'

interface ScaleLabel {
  value: number
  label: string
}

interface MCOption {
  label: string
  hasOther?: boolean
}

interface SurveyQuestion {
  id: string
  title: string
  type: QuestionType
  required?: boolean
  scaleLabels?: ScaleLabel[]
  options?: MCOption[]
  placeholder?: string
  conditional?: (answers: Record<string, unknown>) => boolean
}

// ─── Questions ─────────────────────────────────────────────────────────────

const QUESTIONS: SurveyQuestion[] = [
  {
    id: 'email',
    title: 'What is your email address?',
    type: 'email',
    required: true,
    conditional: (answers) => !answers._prefilled_email,
  },
  {
    id: 'csat',
    title: 'How would you rate your overall satisfaction with SPC?',
    type: 'scale5',
    required: true,
    scaleLabels: [
      { value: 1, label: 'Very disappointed' },
      { value: 2, label: 'Somewhat disappointed' },
      { value: 3, label: "It's okay" },
      { value: 4, label: 'Satisfied' },
      { value: 5, label: 'I love being part of SPC' },
    ],
  },
  {
    id: 'value_score',
    title: 'How valuable has SPC been for your parenting journey?',
    type: 'scale5',
    required: true,
    scaleLabels: [
      { value: 1, label: 'Not valuable at all' },
      { value: 2, label: 'Slightly valuable' },
      { value: 3, label: 'Moderately valuable' },
      { value: 4, label: 'Very valuable' },
      { value: 5, label: 'Extremely valuable' },
    ],
  },
  {
    id: 'engagement',
    title: 'How often do you engage with SPC resources (classes, content, community)?',
    type: 'mc',
    required: true,
    options: [
      { label: 'Several times a week' },
      { label: 'About once a week' },
      { label: 'A few times a month' },
      { label: 'Rarely' },
      { label: "I haven't really started yet" },
    ],
  },
  {
    id: 'top_value',
    title: 'What has been the most valuable part of SPC for you?',
    type: 'mc',
    required: true,
    options: [
      { label: 'Weekly live classes with Marcela' },
      { label: 'Recorded content library' },
      { label: 'Community support from other parents' },
      { label: 'Tools and frameworks for daily parenting' },
      { label: 'Feeling less alone in my parenting journey' },
      { label: 'Understanding my child better' },
      { label: 'Improvement in my relationship with my child(ren)' },
      { label: 'Other', hasOther: true },
    ],
  },
  {
    id: 'outcome',
    title: 'Which of these outcomes have you experienced since joining SPC? (Select all that apply)',
    type: 'multi',
    required: true,
    options: [
      { label: 'Less yelling/reacting in tough moments' },
      { label: 'Better connection with my child(ren)' },
      { label: 'More confidence in my parenting decisions' },
      { label: 'My child\'s behavior has improved' },
      { label: 'I feel calmer and more regulated as a parent' },
      { label: 'Better co-parenting communication' },
      { label: 'I haven\'t noticed changes yet' },
    ],
  },
  {
    id: 'barrier',
    title: 'What is the biggest barrier to getting more value from SPC?',
    type: 'mc',
    required: true,
    options: [
      { label: 'Time — I\'m too busy to engage regularly' },
      { label: 'I forget to use the platform/resources' },
      { label: 'I\'m not sure where to start' },
      { label: 'The content doesn\'t apply to my specific situation' },
      { label: 'I need help applying the tools to my specific situation' },
      { label: 'I feel overwhelmed by the amount of information' },
      { label: 'Schedule conflicts with live classes' },
      { label: 'No barriers — I\'m getting great value!' },
      { label: 'Other', hasOther: true },
    ],
  },
  {
    id: 'support_score',
    title: 'How supported do you feel by the SPC team?',
    type: 'scale5',
    required: true,
    scaleLabels: [
      { value: 1, label: 'Not supported at all' },
      { value: 2, label: 'Slightly supported' },
      { value: 3, label: 'Moderately supported' },
      { value: 4, label: 'Very supported' },
      { value: 5, label: 'Extremely supported' },
    ],
  },
  {
    id: 'feedback',
    title: 'Is there anything else you\'d like to share with us?',
    type: 'textarea',
    required: false,
    placeholder: 'Any feedback, suggestions, or thoughts are welcome...',
  },
  {
    id: 'nps',
    title: 'How likely are you to recommend SPC to a friend or family member?',
    type: 'nps',
    required: true,
  },
  {
    id: 'testimonial_opportunity',
    title: 'Thank you for your incredible support! Would you be open to sharing your experience?',
    type: 'mc',
    required: true,
    conditional: (answers) => typeof answers.nps === 'number' && (answers.nps as number) >= 9,
    options: [
      { label: 'Yes, I\'d love to write a testimonial' },
      { label: 'Yes, I\'d be open to a short video or interview' },
      { label: 'Not right now, but maybe later' },
    ],
  },
  {
    id: 'recovery_permission',
    title: 'We\'d love to understand how we can better support you. Would it be okay if someone from our team reached out?',
    type: 'mc',
    required: true,
    conditional: (answers) => typeof answers.nps === 'number' && (answers.nps as number) <= 6,
    options: [
      { label: 'Yes, I\'d appreciate that' },
      { label: 'No, thank you' },
    ],
  },
  {
    id: 'next_support',
    title: 'What would help you get the most out of SPC going forward?',
    type: 'mc',
    required: true,
    options: [
      { label: 'I\'m happy with things as they are' },
      { label: 'More live class times to choose from' },
      { label: 'More content on specific topics' },
      { label: 'I\'d like more personalized guidance' },
      { label: 'I\'m interested in learning about more intensive coaching support' },
    ],
  },
]

// ─── Page ──────────────────────────────────────────────────────────────────

export default function SpcSurveyPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-[#ffbd59]" />
      </div>
    }>
      <SurveyForm />
    </Suspense>
  )
}

function SurveyForm() {
  const searchParams = useSearchParams()
  const prefilledEmail = searchParams.get('email') ?? ''

  const [answers, setAnswers] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {}
    if (prefilledEmail) {
      init.email = prefilledEmail
      init._prefilled_email = true
    }
    return init
  })
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState<'forward' | 'back'>('forward')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [otherText, setOtherText] = useState<Record<string, string>>({})

  // Build visible questions list (filtering conditionals)
  const visibleQuestions = QUESTIONS.filter(q =>
    !q.conditional || q.conditional(answers)
  )
  const TOTAL = visibleQuestions.length
  const q = visibleQuestions[step]
  const answer = q ? answers[q.id] : undefined
  const isLast = step === TOTAL - 1

  const isValid = (() => {
    if (!q) return false
    if (!q.required && (answer === undefined || answer === '' || answer === null)) return true
    if (q.type === 'email') return typeof answer === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(answer)
    if (q.type === 'scale5') return typeof answer === 'number'
    if (q.type === 'nps') return typeof answer === 'number'
    if (q.type === 'mc') {
      if (typeof answer !== 'string' || !answer) return false
      const opt = q.options?.find(o => o.label === answer)
      if (opt?.hasOther && !(otherText[q.id] ?? '').trim()) return false
      return true
    }
    if (q.type === 'multi') {
      return Array.isArray(answer) && answer.length > 0
    }
    if (q.type === 'textarea') {
      if (!q.required) return true
      return typeof answer === 'string' && answer.trim().length > 0
    }
    return true
  })()

  const setAnswer = useCallback((val: unknown) => {
    setAnswers(prev => ({ ...prev, [visibleQuestions[step].id]: val }))
    setError('')
  }, [step, visibleQuestions])

  function goNext() {
    if (!q) return
    if (q.required && !isValid) {
      setError('This field is required')
      return
    }
    // For optional fields, allow skip
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

  // Keyboard: Enter advances (not on textarea)
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Enter' && q?.type !== 'textarea') {
        e.preventDefault()
        goNext()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  })

  async function handleSubmit() {
    setSubmitting(true)

    const email = (answers.email as string) || prefilledEmail
    const barrierVal = answers.barrier === 'Other' ? (otherText.barrier ?? 'Other') : (answers.barrier as string)
    const topValueVal = answers.top_value === 'Other' ? (otherText.top_value ?? 'Other') : (answers.top_value as string)

    try {
      const res = await fetch('/api/spc/satisfaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          csat: answers.csat,
          value_score: answers.value_score,
          engagement: answers.engagement,
          top_value: topValueVal,
          outcome: answers.outcome ?? [],
          barrier: barrierVal,
          support_score: answers.support_score,
          feedback: answers.feedback || null,
          nps: answers.nps,
          testimonial_opportunity: answers.testimonial_opportunity || null,
          recovery_permission: answers.recovery_permission || null,
          next_support: answers.next_support || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Something went wrong. Please try again.')
        setSubmitting(false)
        return
      }

      setDone(true)
    } catch {
      setError('Network error. Please try again.')
      setSubmitting(false)
    }
  }

  // ── Thank you screen ──
  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-4">
        <div className="text-center max-w-md">
          <div className="mx-auto mb-6">
            <Image src="/logo.png" alt="HIC Parenting" width={140} height={40} className="mx-auto" />
          </div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-3">
            Thank you for your feedback!
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
            Your responses help us make SPC even better for families like yours.
            We truly appreciate you taking the time to share your experience with us.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#ffbd59]/10 text-[#b8860b] dark:text-[#ffbd59] text-sm font-medium">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            From the HIC Parenting Team
          </div>
        </div>
      </div>
    )
  }

  // ── Submitting screen ──
  if (submitting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-4">
        <div className="text-center">
          <div className="mx-auto mb-5">
            <Image src="/logo.png" alt="HIC Parenting" width={140} height={40} className="mx-auto" />
          </div>
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="h-2 w-2 rounded-full bg-[#ffbd59] animate-bounce [animation-delay:0ms]" />
            <div className="h-2 w-2 rounded-full bg-[#ffbd59] animate-bounce [animation-delay:150ms]" />
            <div className="h-2 w-2 rounded-full bg-[#ffbd59] animate-bounce [animation-delay:300ms]" />
          </div>
          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Submitting your responses...</p>
        </div>
      </div>
    )
  }

  if (!q) return null

  // ── Form ──
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 bg-zinc-50 dark:bg-zinc-950">
      {/* Logo */}
      <div className="mb-6">
        <Image src="/logo.png" alt="HIC Parenting" width={140} height={40} />
      </div>

      {/* Subtitle — only on first visible question */}
      {step === 0 && (
        <p className="mb-5 max-w-[500px] text-center text-[14px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          Help us improve your SPC experience. This short survey takes about 3 minutes.
        </p>
      )}

      {/* Card */}
      <div className="w-full max-w-[600px] bg-white dark:bg-zinc-900 rounded-2xl shadow-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        {/* Progress bar */}
        <div className="h-1 bg-zinc-100 dark:bg-zinc-800">
          <div
            className="h-full bg-[#ffbd59] transition-all duration-500 ease-out"
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
          key={q.id + step}
          className={`px-6 pb-6 pt-2 ${
            direction === 'forward'
              ? 'animate-in fade-in slide-in-from-right-4 duration-300'
              : 'animate-in fade-in slide-in-from-left-4 duration-300'
          }`}
        >
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-4 leading-snug">
            {q.title}
          </h2>

          {/* Email input */}
          {q.type === 'email' && (
            <input
              type="email"
              value={(answer as string) ?? ''}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="your@email.com"
              autoFocus
              className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#ffbd59]/30 focus:border-[#ffbd59] placeholder:text-zinc-400"
            />
          )}

          {/* Scale 1-5 */}
          {q.type === 'scale5' && q.scaleLabels && (
            <div className="grid grid-cols-5 gap-2">
              {q.scaleLabels.map(({ value: v, label }) => {
                const selected = answer === v
                return (
                  <button
                    key={v}
                    onClick={() => setAnswer(v)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border-2 px-2 py-4 transition-all ${
                      selected
                        ? 'border-[#ffbd59] bg-[#ffbd59]/10 dark:bg-[#ffbd59]/20'
                        : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'
                    }`}
                  >
                    <span className={`text-2xl font-bold ${
                      selected ? 'text-[#ffbd59]' : 'text-zinc-400 dark:text-zinc-500'
                    }`}>{v}</span>
                    <span className={`text-[10px] leading-tight text-center ${
                      selected ? 'text-zinc-800 dark:text-zinc-200 font-medium' : 'text-zinc-500 dark:text-zinc-400'
                    }`}>{label}</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Multiple choice (single select) */}
          {q.type === 'mc' && q.options && (
            <div className="space-y-2.5">
              {q.options.map((opt, i) => {
                const selected = answer === opt.label
                return (
                  <div key={i}>
                    <button
                      onClick={() => setAnswer(opt.label)}
                      className={`w-full text-left rounded-xl border-2 px-4 py-3.5 transition-all text-sm leading-snug ${
                        selected
                          ? 'border-[#ffbd59] bg-[#ffbd59]/5 dark:bg-[#ffbd59]/10 text-zinc-900 dark:text-zinc-100'
                          : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                          selected
                            ? 'border-[#ffbd59] bg-[#ffbd59]'
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
                    {opt.hasOther && selected && (
                      <input
                        type="text"
                        value={otherText[q.id] ?? ''}
                        onChange={(e) => setOtherText(prev => ({ ...prev, [q.id]: e.target.value }))}
                        placeholder="Please specify..."
                        autoFocus
                        className="mt-2 w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#ffbd59]/30 focus:border-[#ffbd59] placeholder:text-zinc-400"
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Multi-select (checkboxes) */}
          {q.type === 'multi' && q.options && (
            <div className="space-y-2.5">
              {q.options.map((opt, i) => {
                const selected = Array.isArray(answer) && (answer as string[]).includes(opt.label)
                return (
                  <button
                    key={i}
                    onClick={() => {
                      const current = (Array.isArray(answer) ? answer : []) as string[]
                      if (selected) {
                        setAnswer(current.filter(v => v !== opt.label))
                      } else {
                        setAnswer([...current, opt.label])
                      }
                    }}
                    className={`w-full text-left rounded-xl border-2 px-4 py-3.5 transition-all text-sm leading-snug ${
                      selected
                        ? 'border-[#ffbd59] bg-[#ffbd59]/5 dark:bg-[#ffbd59]/10 text-zinc-900 dark:text-zinc-100'
                        : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                        selected
                          ? 'border-[#ffbd59] bg-[#ffbd59]'
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

          {/* Textarea */}
          {q.type === 'textarea' && (
            <textarea
              value={(answer as string) ?? ''}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder={q.placeholder}
              rows={4}
              autoFocus
              className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#ffbd59]/30 focus:border-[#ffbd59] resize-y placeholder:text-zinc-400"
            />
          )}

          {/* NPS 0-10 */}
          {q.type === 'nps' && (
            <div>
              <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2">
                {Array.from({ length: 11 }, (_, i) => {
                  const selected = answer === i
                  const color = i <= 6
                    ? (selected ? 'border-red-400 bg-red-50 dark:bg-red-900/30' : 'border-zinc-200 dark:border-zinc-700')
                    : i <= 8
                    ? (selected ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/30' : 'border-zinc-200 dark:border-zinc-700')
                    : (selected ? 'border-green-400 bg-green-50 dark:bg-green-900/30' : 'border-zinc-200 dark:border-zinc-700')
                  return (
                    <button
                      key={i}
                      onClick={() => setAnswer(i)}
                      className={`w-10 h-10 sm:w-11 sm:h-11 rounded-lg border-2 text-sm font-bold transition-all ${color} ${
                        selected
                          ? 'text-zinc-900 dark:text-zinc-100 scale-110 shadow-md'
                          : 'text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600'
                      }`}
                    >
                      {i}
                    </button>
                  )
                })}
              </div>
              <div className="flex justify-between mt-2 px-1">
                <span className="text-[10px] text-zinc-400">Not at all likely</span>
                <span className="text-[10px] text-zinc-400">Extremely likely</span>
              </div>
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
            disabled={q.required ? !isValid : false}
            className={`px-8 py-2.5 rounded-xl text-sm font-semibold text-white transition-all ${
              (!q.required || isValid)
                ? 'bg-[#ffbd59] hover:bg-[#144d8a] cursor-pointer'
                : 'bg-blue-300 dark:bg-blue-900/40 opacity-50 cursor-not-allowed'
            }`}
          >
            {isLast ? 'Submit' : 'Next \u2192'}
          </button>
        </div>
      </div>
    </div>
  )
}
