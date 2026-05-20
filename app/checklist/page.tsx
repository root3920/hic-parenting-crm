'use client'

import { useEffect, useCallback, useState } from 'react'

export const dynamic = 'force-dynamic'

const GROUP_TOTALS: Record<string, number> = {
  firecracker: 7, cooker: 7, stonewall: 7,
  'child-mirroring': 6, 'child-desensitization': 6, 'child-poking': 6,
  'child-scanning': 7, 'child-shutdown': 8, 'child-impact': 8,
  'co-micro': 5, 'co-undermined': 6, 'co-both': 8,
  'co-shutdown': 3, 'co-impact': 7,
}

const GRAND_TOTAL = Object.values(GROUP_TOTALS).reduce((a, b) => a + b, 0)

interface CheckSection {
  group: string
  tag?: string
  emoji?: string
  title: string
  subtitle: string
  description: string[]
  subsectionLabel: string
  items: string[]
}

const SECTIONS: CheckSection[] = [
  {
    group: 'firecracker',
    tag: 'Reactive Type 1',
    emoji: '\u{1F525}',
    title: 'The Firecracker / Fire Alarm Pattern',
    subtitle: 'Impulse reactivity',
    description: [
      'You react quickly when triggered \u2014 maybe you yell, snap, or say something you don\u2019t mean, and then feel guilty afterward.',
      'Even though you know what to do, in the heat of the moment, it feels impossible to stay calm.',
      'This is an impulsive reactive pattern that occurs when the nervous system escalates quickly, and the parent lacks the skills to prevent the escalation or body awareness to notice early signs of nervous system dysregulation.',
    ],
    subsectionLabel: 'Check the statements you relate to',
    items: [
      '\u201CIt just happens so fast \u2014 I can\u2019t control it.\u201D',
      '\u201CI avoid getting angry because if I do, I know I can\u2019t control myself.\u201D',
      '\u201CI feel like my co-parent judges me or doesn\u2019t trust me.\u201D',
      '\u201CI know what to do, but I can\u2019t seem to do it when I\u2019m upset.\u201D',
      '\u201CI feel like my kids don\u2019t believe my apologies anymore.\u201D',
      '\u201CI see my children are scared of me.\u201D',
      '\u201CMy coparent repeatedly tells me that I am being too harsh even when I feel I am not.\u201D',
    ],
  },
  {
    group: 'cooker',
    tag: 'Reactive Type 2',
    emoji: '\u{1F4A8}',
    title: 'The Pressure Cooker Pattern',
    subtitle: 'Suppression reactivity',
    description: [
      'When everything builds up inside, you try hard to stay calm \u2014 you hold, and hold, and hold\u2026 until suddenly, you can\u2019t do it anymore, and you react with snapping, yelling, saying hurtful things, or spanking.',
      'You start the day patient and positive, but stress builds, and at some point, it overflows.',
      'This is a suppression reactive pattern that occurs when the parent dismisses or suppresses their own dysregulation or anger. The escalation builds up until it overflows like a pressure cooker with no valve.',
    ],
    subsectionLabel: 'Check the statements you relate to',
    items: [
      '\u201CI don\u2019t want to lose it, but I can\u2019t keep holding it in.\u201D',
      '\u201CI tell myself to stay calm, but my frustration increases.\u201D',
      '\u201CI fake cool with my kids, but I am boiling inside.\u201D',
      '\u201CBy the end of the day, I\u2019m emotionally exhausted and reactive.\u201D',
      '\u201CI should be doing better \u2014 I\u2019ve learned so much already.\u201D',
      '\u201CMy partner says they don\u2019t like that I correct their parenting all the time, but end up having the same reaction they are having anyway.\u201D',
      '\u201CI see my children look confused and don\u2019t trust me because one moment I am connected and calm, and the next moment I am reactive.\u201D',
    ],
  },
  {
    group: 'stonewall',
    tag: 'Reactive Type 3',
    emoji: '\u{1F9CA}',
    title: 'The Stonewall Parent',
    subtitle: 'Silent / quiet reactivity',
    description: [
      'When you shut down or check out. This is silent reactivity.',
      'You don\u2019t yell \u2014 instead, you disconnect or shut down. You might stay quiet, walk away, or emotionally \u201Ctune out.\u201D Sometimes you give in just to keep the peace or hand things over to your partner when it\u2019s too much.',
      'This is a hidden type of reactivity because the parent is not visibly reactive or upset. According to science, this is the highest form of nervous system dysregulation, and it happens when the parent feels helpless and unable to respond.',
    ],
    subsectionLabel: 'Check the statements you relate to',
    items: [
      '\u201CI just need a break \u2014 I can\u2019t deal with this right now.\u201D',
      '\u201CAs long as the kids are happy, I\u2019m happy, so I give in even though I know I should set a limit.\u201D',
      '\u201CI emotionally check out. I am physically present but not emotionally present.\u201D',
      '\u201CI feel permissive and I don\u2019t like it.\u201D',
      '\u201CMy partner feels like they are alone in handling the children\u2019s behaviors.\u201D',
      '\u201CI want to be firm and kind, but I don\u2019t know how.\u201D',
      '\u201CIt seems my children can do whatever they want, and they don\u2019t see me in authority.\u201D',
    ],
  },
  {
    group: 'child-mirroring',
    title: '1. Mirroring Behaviors',
    subtitle: 'Children learn emotional regulation by watching us',
    description: [
      'When children grow up around frequent reactivity, yelling, emotional overwhelm, or dysregulation, they often mirror the same behaviors because that becomes their model for handling stress and emotions.',
    ],
    subsectionLabel: 'This may look like',
    items: [
      'My child becomes reactive, explosive, or emotionally intense with siblings.',
      'My child talks to others with the same tone, attitude, or reactivity they experience at home.',
      'My child becomes more reactive with me when I become reactive with them.',
      'My child has received behavioral complaints at school, daycare, activities, or with peers.',
      'My child mirrors emotional dysregulation with pets, siblings, or other children.',
      'My child escalates emotionally instead of calming down during conflict.',
    ],
  },
  {
    group: 'child-desensitization',
    title: '2. Desensitization to Reactivity',
    subtitle: 'Children in reactive homes can become emotionally desensitized to calm communication',
    description: [
      'It\u2019s kind of like living next to a train track: at first, every train feels loud, but over time, the nervous system adapts and only reacts to the REALLY loud trains. Children can become so used to emotional intensity that calm requests no longer feel urgent to their nervous system.',
    ],
    subsectionLabel: 'This may look like',
    items: [
      'My child does not respond until I raise my voice or become emotionally intense.',
      'I often feel like my child \u201Conly listens when I yell.\u201D',
      'Calm communication often gets ignored in our home.',
      'I notice myself escalating more and more just to get cooperation.',
      'My child seems emotionally \u201Cused to\u201D yelling, threats, or reactive energy.',
      'It feels like the emotional intensity in our home keeps increasing over time.',
    ],
  },
  {
    group: 'child-poking',
    title: '3. \u201CPoking the Bear\u201D Behaviors',
    subtitle: 'Testing, provoking, or pushing limits constantly',
    description: [
      'Some children begin testing, provoking, or pushing limits constantly. Not always because they want conflict\u2026 but waiting for the explosion can feel emotionally nerve-wracking and unpredictable. So their nervous system would rather \u201Cget the reaction over with now\u201D than stay anxiously waiting for it later.',
    ],
    subsectionLabel: 'This may look like',
    items: [
      'My child constantly pushes limits or tests boundaries.',
      'My child seems to provoke reactions intentionally.',
      'My child keeps escalating even when they know I\u2019m already overwhelmed.',
      'It feels like my child keeps \u201Cpushing buttons.\u201D',
      'My child struggles to settle until conflict or reactivity finally happens.',
      'I feel like my child is always testing me emotionally.',
    ],
  },
  {
    group: 'child-scanning',
    title: '4. Emotional Scanning Behaviors',
    subtitle: 'Hyper-aware of parents\u2019 moods and emotional safety',
    description: [
      'Children naturally scan their parents for emotional safety. But in reactive homes, some children become hyper-aware of the parents\u2019 moods, tone, energy, or facial expressions because their nervous system is trying to predict emotional danger and stay safe. Some children become people pleasers; others become \u201Cfunny,\u201D overly playful, or highly accommodating to try to keep the peace.',
    ],
    subsectionLabel: 'This may look like',
    items: [
      'My child frequently asks: \u201CAre you mad?\u201D, \u201CAre you angry?\u201D, \u201CAre you okay?\u201D, \u201CAre you upset with me?\u201D',
      'My child changes their behavior depending on my emotional state.',
      'My child becomes hyper-aware of my moods, tone, facial expressions, or energy.',
      'My child tries to keep everyone happy or peaceful.',
      'My child acts overly funny, silly, playful, or \u201Con\u201D when tension is present.',
      'My child seems emotionally responsible for managing other people\u2019s feelings.',
      'My child appears anxious when they sense emotional tension in the home.',
    ],
  },
  {
    group: 'child-shutdown',
    title: '5. Shutdown & Emotional Disconnection',
    subtitle: 'Children protecting themselves by emotionally withdrawing',
    description: [
      'Some children do not become louder. Children may begin disconnecting emotionally to protect themselves. Over time, this can create emotional distance between parents and children.',
    ],
    subsectionLabel: 'This may look like',
    items: [
      'My child struggles to open up emotionally.',
      'My child hides feelings, mistakes, or struggles.',
      'My child emotionally shuts down during conflict.',
      'My child avoids talking about emotions.',
      'My child becomes quiet, withdrawn, or disconnected after reactive moments.',
      'My child seems emotionally distant from me.',
      'My child suppresses emotions instead of expressing them safely.',
      'I feel like there is growing emotional distance between me and my child.',
    ],
  },
  {
    group: 'child-impact',
    title: '6. Emotional Impact on the Child',
    subtitle: 'Even when children cannot explain it with words',
    description: [
      'Even when children cannot explain it with words, reactive environments deeply affect their nervous system and emotional world. Children may feel emotionally unsafe, confused, anxious, or constantly on edge without fully understanding why.',
    ],
    subsectionLabel: 'This may look like',
    items: [
      'My child seems confused by the emotional environment at home.',
      'My child appears emotionally overwhelmed frequently.',
      'My child seems scared or intimidated during reactive moments.',
      'My child appears sad, anxious, or emotionally heavy.',
      'My child struggles to feel emotionally safe expressing feelings.',
      'My child seems unsure of what version of me they are going to get.',
      'My child becomes hypervigilant to emotional tension.',
      'My child struggles to relax fully around me.',
    ],
  },
  {
    group: 'co-micro',
    title: '1. Micromanaging & Policing Dynamic',
    subtitle: 'Common when one parent is reactive and the other feels emotionally responsible',
    description: [
      'In this dynamic, one parent feels they constantly need to \u201Cstep in\u201D to prevent emotional damage or escalation. The other parent often feels criticized, controlled, or undermined. Over time, both parents become emotionally exhausted.',
    ],
    subsectionLabel: 'This may look like',
    items: [
      'I frequently step in during my co-parent\u2019s interactions with the kids.',
      'I feel responsible for keeping the emotional peace in the home.',
      'I feel emotionally \u201Con\u201D all the time because I don\u2019t feel safe relaxing my guard.',
      'I worry my co-parent\u2019s reactions may emotionally hurt or scare the kids.',
      'I feel resentment building because I feel alone emotionally.',
    ],
  },
  {
    group: 'co-undermined',
    title: '2. Feeling Undermined, Controlled, or \u201CNever Good Enough\u201D',
    subtitle: 'Common for the reactive parent with a less reactive coparent',
    description: [
      'When one parent is frequently corrected, interrupted, or managed by the other parent, they may begin feeling criticized, disrespected, incapable, or emotionally unsafe themselves. Even if the other parent\u2019s intentions are protective, the reactive parent may experience deep shame, defensiveness, or anger.',
    ],
    subsectionLabel: 'This may look like',
    items: [
      'I feel like my co-parent doesn\u2019t trust me with the kids.',
      'I feel corrected or micromanaged in front of the children.',
      'I feel like I can never do parenting \u201Cright.\u201D',
      'I feel defensive during parenting conversations.',
      'I feel like my authority gets undermined in front of the kids.',
      'I feel emotionally disconnected from my co-parent after parenting conflicts.',
    ],
  },
  {
    group: 'co-both',
    title: '3. Reactive vs. Reactive Dynamic',
    subtitle: 'When both parents become emotionally reactive',
    description: [
      'When both parents are dysregulated, the home can quickly become emotionally chaotic. One parent\u2019s reactivity activates the other parent\u2019s nervous system, and escalation spreads through the whole family system. Children often mirror and absorb this tension.',
    ],
    subsectionLabel: 'This may look like',
    items: [
      'When one parent escalates, the other parent escalates too.',
      'Parenting conflicts quickly turn into arguments between co-parents.',
      'We become reactive toward each other in front of the kids.',
      'The emotional energy in the house feels tense or chaotic.',
      'One parent tries to correct the other parent while also struggling with reactivity themselves.',
      'We feel emotionally triggered by each other\u2019s parenting styles.',
      'It feels like everyone in the house becomes emotionally reactive together.',
      'Parenting creates conflict in our relationship.',
    ],
  },
  {
    group: 'co-shutdown',
    title: '4. Shutdown / Stonewalling Dynamic',
    subtitle: 'When one or both parents emotionally withdraw',
    description: [
      'Not all reactive homes are loud. Some reactive homes become emotionally disconnected, passive, or shut down. In these homes, parents may avoid conflict, structure, or emotional connection because they fear escalation or don\u2019t know how to guide behavior calmly. This may create a permissive, disconnected, or emotionally distant family dynamic.',
    ],
    subsectionLabel: 'This may look like',
    items: [
      'When parenting gets too much for me, I tend to pass my child to my coparent and leave the room.',
      'I avoid intervening during my child\u2019s chaos to avoid conflict with my coparent.',
      'I feel like my co-parent emotionally checks out, or I emotionally check out.',
    ],
  },
  {
    group: 'co-impact',
    title: '5. Emotional Impact on the Relationship',
    subtitle: 'Over time, reactive parenting patterns can slowly erode trust and teamwork',
    description: [
      'Many couples stop feeling like partners and begin feeling like they are surviving parenting separately.',
    ],
    subsectionLabel: 'This may look like',
    items: [
      'Parenting has created emotional distance between us.',
      'We argue more about parenting than anything else.',
      'We feel disconnected after parenting conflicts.',
      'We rarely feel like a calm, connected team.',
      'There is tension between us around parenting decisions.',
      'We feel emotionally exhausted by parenting.',
      'We feel like we speak different languages when it comes to parenting.',
    ],
  },
]


export default function ChecklistPage() {
  const [checked, setChecked] = useState<Record<string, boolean[]>>(() => {
    const init: Record<string, boolean[]> = {}
    SECTIONS.forEach((s) => {
      init[s.group] = new Array(s.items.length).fill(false)
    })
    return init
  })

  const toggle = useCallback((group: string, idx: number) => {
    setChecked((prev) => {
      const next = { ...prev }
      next[group] = [...prev[group]]
      next[group][idx] = !next[group][idx]
      return next
    })
  }, [])

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const getGroupCount = useCallback(
    (group: string) => checked[group]?.filter(Boolean).length ?? 0,
    [checked]
  )

  const buildCheckedItems = useCallback(() => {
    const result: Record<string, string[]> = {}
    SECTIONS.forEach((s) => {
      result[s.group] = s.items.filter((_, i) => checked[s.group]?.[i])
    })
    return result
  }, [checked])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (submitting || submitted) return
      setSubmitting(true)
      try {
        const res = await fetch('/api/checklist/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            full_name: fullName,
            email,
            checked_items: buildCheckedItems(),
          }),
        })
        if (!res.ok) throw new Error('Submission failed')
        setSubmitted(true)
        window.print()
      } catch {
        alert('Something went wrong. Please try again.')
      } finally {
        setSubmitting(false)
      }
    },
    [fullName, email, submitting, submitted, buildCheckedItems]
  )

  // Scroll progress bar
  useEffect(() => {
    const handler = () => {
      const scrollTop = window.scrollY
      const docHeight = document.body.scrollHeight - window.innerHeight
      const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0
      const bar = document.getElementById('progressBar')
      if (bar) bar.style.width = pct + '%'
    }
    window.addEventListener('scroll', handler)
    return () => window.removeEventListener('scroll', handler)
  }, [])

  const part1Groups = ['firecracker', 'cooker', 'stonewall']
  const part2Groups = [
    'child-mirroring',
    'child-desensitization',
    'child-poking',
    'child-scanning',
    'child-shutdown',
    'child-impact',
  ]
  const part3Groups = [
    'co-micro',
    'co-undermined',
    'co-both',
    'co-shutdown',
    'co-impact',
  ]

  const renderSection = (section: CheckSection) => (
    <div className="card" key={section.group}>
      <div className="card-header">
        <div className="card-header-top">
          <div>
            {section.tag && <div className="section-tag">{section.tag}</div>}
            <h2>
              {section.emoji && (
                <span className="emoji">{section.emoji}</span>
              )}
              {section.title}
            </h2>
            <div className="subtitle">{section.subtitle}</div>
          </div>
          {section.tag && (
            <div className="counter-chip">
              {getGroupCount(section.group)} checked
            </div>
          )}
        </div>
      </div>
      <div className="card-body">
        <div className="description-block">
          {section.description.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        <div className="subsection-label">{section.subsectionLabel}</div>
        <ul className="check-list">
          {section.items.map((item, i) => {
            const isChecked = checked[section.group]?.[i] ?? false
            return (
              <li
                key={i}
                className={`check-item${isChecked ? ' checked' : ''}`}
                onClick={() => toggle(section.group, i)}
              >
                <div className="custom-check">
                  <span className="check-icon">{'\u2713'}</span>
                </div>
                <span className="check-label">{item}</span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <style>{pageStyles}</style>

      <div className="progress-bar-wrap">
        <div className="progress-bar" id="progressBar" />
      </div>

      <header className="site-header no-print">
        <div className="logo-area">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="HIC Parenting Education"
            className="h-9 w-auto object-contain"
          />
        </div>
      </header>

      <div className="container">
        {/* HERO */}
        <div className="hero">
          <h1>Discover Your Reactivity Type</h1>
          <p>
            Hi there, parent! {'\uD83D\uDC4B'} Please complete the following
            checklist to discover your particular reactive type before your
            call.
          </p>
          <p>
            This is an important step to make the best out of our time
            together.
          </p>
          <div className="stat-badge">
            {'\u2728'} Helping 14,151 parents become secure parents
          </div>
        </div>

        {/* 3 SKILLS */}
        <div className="skills-box">
          <h3>The 3 Skills of a Secure Parent</h3>
          <div className="skill-item">
            <div className="skill-num">1</div>
            <p>
              <strong>Emotional Regulation:</strong> It is not about not
              getting angry or taking deep breaths. It{'\u2019'}s knowing what
              to do with anger, frustration, overwhelm, and other emotions
              and processing them safely while parenting your children.
            </p>
          </div>
          <div className="skill-item">
            <div className="skill-num">2</div>
            <p>
              <strong>Mindsight:</strong> It is not trying to speak kindly to
              your children, but to have a full understanding of their needs
              and speak to them in a way they understand and follow.
            </p>
          </div>
          <div className="skill-item">
            <div className="skill-num">3</div>
            <p>
              <strong>Positive Discipline:</strong> It{'\u2019'}s not about
              raising your voice, repeating the same instruction, or
              threatening them with losing electronics. It{'\u2019'}s about
              developing their skills so they have the ability to follow
              through and make better decisions.
            </p>
          </div>
        </div>

        {/* INSTRUCTIONS */}
        <div className="instructions no-print">
          <p>{'\u2705'} Check all the boxes that resonate with you.</p>
          <p>{'\u2705'} Ask your partner to do the same.</p>
          <p>
            {'\u2705'} Bring your results to your Free 1:1 Session {'\u2014'}{' '}
            we{'\u2019'}ll explore what this means for your family together.
          </p>
          <p>
            {'\u2728'}{' '}
            <em>
              There are no right or wrong answers {'\u2014'} just awareness
              and growth.
            </em>
          </p>
        </div>

        {/* PART 1 */}
        <div className="big-divider">Part 1 {'\u00B7'} Your Reactivity Type</div>
        {SECTIONS.filter((s) => part1Groups.includes(s.group)).map(
          renderSection
        )}

        {/* PART 2 */}
        <div className="big-divider">
          Part 2 {'\u00B7'} Emotional Impact on Children
        </div>
        <p
          style={{
            textAlign: 'center',
            color: 'var(--muted)',
            fontSize: '0.9rem',
            marginBottom: 28,
            marginTop: -12,
          }}
        >
          Reactive parenting not only affects behavior in the moment. This
          checklist is not about guilt or shame {'\u2014'} it is about
          awareness.
        </p>
        {SECTIONS.filter((s) => part2Groups.includes(s.group)).map(
          renderSection
        )}

        {/* PART 3 */}
        <div className="big-divider">
          Part 3 {'\u00B7'} Impact on Co-Parenting Dynamic
        </div>
        <p
          style={{
            textAlign: 'center',
            color: 'var(--muted)',
            fontSize: '0.9rem',
            marginBottom: 28,
            marginTop: -12,
          }}
        >
          Reactive patterns also deeply affect the relationship between
          co-parents. This is not about blame {'\u2014'} it is about
          awareness.
        </p>
        {SECTIONS.filter((s) => part3Groups.includes(s.group)).map(
          renderSection
        )}

        {/* SUBMIT FORM */}
        <div className="card no-print" style={{ marginTop: 36 }}>
          <div className="card-header">
            <h2>Save Your Results</h2>
            <div className="subtitle">
              Enter your details so we can review your checklist before your
              session
            </div>
          </div>
          <div className="card-body">
            <form onSubmit={handleSubmit}>
              <div className="form-field">
                <label htmlFor="fullName">Full Name</label>
                <input
                  id="fullName"
                  type="text"
                  required
                  placeholder="Your full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={submitted}
                />
              </div>
              <div className="form-field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={submitted}
                />
              </div>
              <button
                type="submit"
                className="print-btn"
                disabled={submitting || submitted}
                style={{ opacity: submitting ? 0.6 : 1 }}
              >
                {submitted
                  ? '\u2705 Saved!'
                  : submitting
                    ? 'Saving...'
                    : '\uD83D\uDDA8\uFE0F Save & Print My Results'}
              </button>
            </form>
          </div>
        </div>

        {/* REFLECTION */}
        <div className="reflection-box">
          <h2>Reflection</h2>
          <p>
            If you checked several of these boxes, it does{' '}
            <strong>NOT</strong> mean your family is broken. It means your
            family system may be stuck in reactivity patterns.
          </p>
          <div className="highlight">
            <strong>What to expect from your session with us:</strong>
            <br />
            You will get a nuanced awareness of your particular dynamic, you
            will get clear on what you want moving forward in your parenting,
            and you will hear our recommendation based on your needs. At the
            end of the session, if you believe private coaching is what you
            need moving forward, let us know, and with your permission, we
            will share with you how we help parents in coaching, and you
            {'\u2019'}ll make an enrollment decision.
            <br />
            <br />
            <em>
              Coaching processes usually take months, and the level of support
              varies based on your needs. Most of our coaching options are in
              the low-thousands range USD.
            </em>
          </div>
        </div>
      </div>
    </>
  )
}

const pageStyles = `
  :root {
    --orange: #F5A623;
    --blue: #3A6B9E;
    --dark: #1C2B3A;
    --soft-bg: #FAFAF8;
    --card-bg: #FFFFFF;
    --border: #E8E4DC;
    --text: #2D3748;
    --muted: #718096;
    --check-color: #3A6B9E;
    --shadow: 0 2px 16px rgba(28,43,58,0.08);
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'DM Sans', sans-serif;
    background: var(--soft-bg);
    color: var(--text);
    line-height: 1.7;
  }

  @media print {
    .no-print { display: none !important; }
    body { background: white; }
    .card { box-shadow: none; border: 1px solid #ddd; }
  }

  .site-header {
    background: white;
    border-bottom: 3px solid var(--orange);
    padding: 20px 0;
    text-align: center;
    position: sticky;
    top: 0;
    z-index: 100;
    box-shadow: 0 2px 12px rgba(0,0,0,0.06);
  }

  .logo-area {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
  }

  .progress-bar-wrap {
    background: #eee;
    height: 6px;
    position: fixed;
    top: 0; left: 0; right: 0;
    z-index: 200;
  }

  .progress-bar {
    height: 100%;
    background: linear-gradient(90deg, var(--orange), var(--blue));
    transition: width 0.3s ease;
    width: 0%;
  }

  .container {
    max-width: 780px;
    margin: 0 auto;
    padding: 40px 20px 80px;
  }

  .hero {
    text-align: center;
    padding: 50px 30px 40px;
    background: white;
    border-radius: 18px;
    box-shadow: var(--shadow);
    margin-bottom: 36px;
    border-top: 4px solid var(--orange);
  }

  .hero h1 {
    font-family: 'Lora', serif;
    font-size: 2rem;
    font-weight: 700;
    color: var(--dark);
    margin-bottom: 16px;
  }

  .hero p {
    color: var(--muted);
    font-size: 1rem;
    max-width: 560px;
    margin: 0 auto 12px;
  }

  .stat-badge {
    display: inline-block;
    background: linear-gradient(135deg, var(--orange), #e8902a);
    color: white;
    font-weight: 700;
    font-size: 0.9rem;
    padding: 8px 20px;
    border-radius: 50px;
    margin-top: 14px;
  }

  .skills-box {
    background: linear-gradient(135deg, #EBF2FA, #FDF6E8);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 24px 28px;
    margin-bottom: 36px;
  }

  .skills-box h3 {
    font-family: 'Lora', serif;
    font-weight: 700;
    color: var(--blue);
    margin-bottom: 16px;
    font-size: 1.05rem;
  }

  .skill-item {
    display: flex;
    gap: 14px;
    margin-bottom: 14px;
    align-items: flex-start;
  }

  .skill-num {
    background: var(--orange);
    color: white;
    font-weight: 700;
    font-size: 0.85rem;
    width: 26px; height: 26px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .skill-item p {
    font-size: 0.9rem;
    color: var(--text);
  }

  .skill-item strong { color: var(--blue); }

  .instructions {
    background: #F0F7FF;
    border-left: 4px solid var(--blue);
    border-radius: 0 10px 10px 0;
    padding: 18px 22px;
    margin-bottom: 36px;
    font-size: 0.93rem;
  }

  .instructions p { margin-bottom: 6px; }
  .instructions p:last-child { margin-bottom: 0; }

  .card {
    background: var(--card-bg);
    border-radius: 16px;
    box-shadow: var(--shadow);
    margin-bottom: 28px;
    overflow: hidden;
    border: 1px solid var(--border);
  }

  .card-header {
    padding: 22px 28px 18px;
    border-bottom: 1px solid var(--border);
  }

  .section-tag {
    display: inline-block;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 6px;
  }

  .card-header h2 {
    font-family: 'Lora', serif;
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--dark);
    margin-bottom: 4px;
  }

  .card-header .emoji {
    font-size: 1.6rem;
    margin-right: 8px;
    vertical-align: middle;
  }

  .card-header .subtitle {
    font-size: 0.88rem;
    color: var(--muted);
    font-style: italic;
  }

  .card-body { padding: 20px 28px; }

  .description-block {
    background: #F9F9F7;
    border-radius: 10px;
    padding: 16px 20px;
    margin-bottom: 20px;
    font-size: 0.93rem;
    color: var(--text);
    border-left: 3px solid var(--orange);
  }

  .description-block p { margin-bottom: 8px; }
  .description-block p:last-child { margin-bottom: 0; }

  .subsection-label {
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--blue);
    text-transform: uppercase;
    letter-spacing: 1.5px;
    margin: 20px 0 12px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .subsection-label::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border);
  }

  .check-list { list-style: none; }

  .check-item {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding: 11px 14px;
    border-radius: 10px;
    cursor: pointer;
    transition: background 0.15s;
    margin-bottom: 4px;
    user-select: none;
  }

  .check-item:hover { background: #F5F9FF; }

  .check-item.checked { background: #EBF5EB; }

  .custom-check {
    width: 22px; height: 22px;
    border: 2px solid #CBD5E0;
    border-radius: 6px;
    flex-shrink: 0;
    margin-top: 2px;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.2s;
    background: white;
  }

  .check-item.checked .custom-check {
    background: #48BB78;
    border-color: #48BB78;
  }

  .check-icon {
    display: none;
    color: white;
    font-size: 13px;
    font-weight: 700;
  }

  .check-item.checked .check-icon { display: block; }

  .check-label {
    font-size: 0.93rem;
    color: var(--text);
    line-height: 1.55;
  }

  .check-item.checked .check-label {
    color: #2F7D4E;
    font-weight: 500;
  }

  .counter-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--blue);
    background: #EBF2FA;
    padding: 4px 12px;
    border-radius: 20px;
    margin-left: auto;
  }

  .card-header-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
  }

  .big-divider {
    text-align: center;
    font-family: 'Lora', serif;
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--blue);
    padding: 32px 0 16px;
    position: relative;
  }

  .big-divider::before {
    content: '';
    display: block;
    width: 60px;
    height: 3px;
    background: var(--orange);
    margin: 0 auto 16px;
    border-radius: 2px;
  }

  .reflection-box {
    background: linear-gradient(135deg, var(--blue), #2A5480);
    color: white;
    border-radius: 16px;
    padding: 32px;
    margin-top: 36px;
    text-align: center;
  }

  .reflection-box h2 {
    font-family: 'Lora', serif;
    font-size: 1.4rem;
    margin-bottom: 16px;
  }

  .reflection-box p {
    font-size: 0.95rem;
    opacity: 0.9;
    max-width: 560px;
    margin: 0 auto 20px;
  }

  .reflection-box .highlight {
    background: rgba(255,255,255,0.15);
    border-radius: 10px;
    padding: 16px 20px;
    font-size: 0.88rem;
    text-align: left;
    margin-top: 16px;
  }

  .print-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: var(--orange);
    color: white;
    border: none;
    border-radius: 50px;
    padding: 12px 28px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.15s, box-shadow 0.15s;
    margin-top: 20px;
  }

  .print-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(245,166,35,0.35);
  }

  .form-field {
    margin-bottom: 16px;
  }

  .form-field label {
    display: block;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--dark);
    margin-bottom: 6px;
  }

  .form-field input {
    width: 100%;
    padding: 10px 14px;
    font-size: 0.93rem;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--soft-bg);
    color: var(--text);
    font-family: 'DM Sans', sans-serif;
    transition: border-color 0.2s;
  }

  .form-field input:focus {
    outline: none;
    border-color: var(--blue);
  }

  .form-field input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  @media (max-width: 600px) {
    .hero h1 { font-size: 1.5rem; }
    .card-body { padding: 16px 18px; }
    .card-header { padding: 18px 18px 14px; }
  }
`
