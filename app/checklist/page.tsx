'use client'

import { useCallback, useEffect, useState } from 'react'

export const dynamic = 'force-dynamic'

/* ------------------------------------------------------------------ */
/*  Checkbox item definitions                                         */
/* ------------------------------------------------------------------ */

interface CheckItem {
  key: string
  text: string
}

const FIRECRACKER_ITEMS: CheckItem[] = [
  { key: 'firecracker_1', text: '\u201CIt just happens so fast \u2014 I can\u2019t control it.\u201D' },
  { key: 'firecracker_2', text: '\u201CI avoid getting angry because if I do, I know I can\u2019t control myself.\u201D' },
  { key: 'firecracker_3', text: '\u201CI feel like my co-parent judges me or doesn\u2019t trust me.\u201D' },
  { key: 'firecracker_4', text: '\u201CI feel like my kids don\u2019t believe my apologies anymore.\u201D' },
  { key: 'firecracker_5', text: '\u201CI see my children are scared of me.\u201D' },
  { key: 'firecracker_6', text: '\u201CMy coparent repeatedly tells me that I am being too harsh even when I feel I am not.\u201D' },
]

const PRESSURE_COOKER_ITEMS: CheckItem[] = [
  { key: 'pressure_cooker_1', text: '\u201CI don\u2019t want to lose it, but I can\u2019t keep holding it in.\u201D' },
  { key: 'pressure_cooker_2', text: '\u201CI tell myself to stay calm, but my frustration increases.\u201D' },
  { key: 'pressure_cooker_3', text: '\u201CI fake cool with my kids, but I am boiling inside.\u201D' },
  { key: 'pressure_cooker_4', text: '\u201CBy the end of the day, I\u2019m emotionally exhausted and reactive.\u201D' },
  { key: 'pressure_cooker_5', text: '\u201CI see my children look confused and don\u2019t trust me because one moment I am connected and calm, and the next moment I am reactive.\u201D' },
]

const STONEWALL_ITEMS: CheckItem[] = [
  { key: 'stonewall_1', text: '\u201CMy partner is better with the kids than me, I\u2019ll have them take the wheel.\u201D' },
  { key: 'stonewall_2', text: '\u201CAs long as the kids are happy, I\u2019m happy, so you give in even though you know you should set a limit.\u201D' },
  { key: 'stonewall_3', text: '\u201CYou emotionally check out. You are physically present but not emotionally present.\u201D' },
  { key: 'stonewall_4', text: '\u201CYou feel permissive and don\u2019t like it.\u201D' },
  { key: 'stonewall_5', text: '\u201CMy partner feels like they are alone in handling the children\u2019s behaviors.\u201D' },
  { key: 'stonewall_6', text: '\u201CIt seems my children can do whatever they want, and they don\u2019t see me in authority.\u201D' },
]

const MIRRORING_ITEMS: CheckItem[] = [
  { key: 'mirroring_1', text: 'My child becomes reactive, explosive, or emotionally intense with siblings.' },
  { key: 'mirroring_2', text: 'My child talks to others with the same tone, attitude, or reactivity they experience at home.' },
  { key: 'mirroring_3', text: 'My child becomes more reactive with me when I become reactive with them.' },
  { key: 'mirroring_4', text: 'My child has received behavioral complaints at school, daycare, activities, or with peers.' },
  { key: 'mirroring_5', text: 'My child mirrors emotional dysregulation with pets, siblings, or other children.' },
  { key: 'mirroring_6', text: 'My child escalates emotionally instead of calming down during conflict.' },
]

const DESENSITIZATION_ITEMS: CheckItem[] = [
  { key: 'desensitization_1', text: 'My child does not respond until I raise my voice or become emotionally intense.' },
  { key: 'desensitization_2', text: 'I often feel like my child \u201Conly listens when I yell.\u201D' },
  { key: 'desensitization_3', text: 'Calm communication often gets ignored in our home.' },
  { key: 'desensitization_4', text: 'I notice myself escalating more and more just to get cooperation.' },
  { key: 'desensitization_5', text: 'My child seems emotionally \u201Cused to\u201D yelling, threats, or reactive energy.' },
  { key: 'desensitization_6', text: 'It feels like the emotional intensity in our home keeps increasing over time.' },
]

const POKING_ITEMS: CheckItem[] = [
  { key: 'poking_1', text: 'My child seems to provoke reactions intentionally in siblings.' },
  { key: 'poking_2', text: 'It feels like my child keeps \u201Cpushing my buttons.\u201D' },
  { key: 'poking_3', text: 'My child knows the boundary, and does the opposite even after redirection.' },
  { key: 'poking_4', text: 'After redirection, my child looks at me, smiles or smirks, and keeps doing the opposite.' },
]

const SCANNING_ITEMS: CheckItem[] = [
  { key: 'scanning_1', text: 'My child frequently asks: \u201CAre you mad?\u201D \u201CAre you angry?\u201D \u201CAre you okay?\u201D \u201CAre you upset with me?\u201D \u201CDon\u2019t be angry, but I did\u2026\u201D' },
  { key: 'scanning_2', text: 'My child changes their behavior depending on my emotional state.' },
  { key: 'scanning_3', text: 'My child becomes hyper-aware of my moods, tone, facial expressions, or energy.' },
  { key: 'scanning_4', text: 'My child tries to keep everyone happy or peaceful.' },
  { key: 'scanning_5', text: 'My child acts overly funny, silly, playful, or \u201Con\u201D when tension is present.' },
  { key: 'scanning_6', text: 'My child seems emotionally responsible for managing other people\u2019s feelings.' },
]

const SHUTDOWN_ITEMS: CheckItem[] = [
  { key: 'shutdown_1', text: 'My child struggles to open up emotionally.' },
  { key: 'shutdown_2', text: 'My child hides feelings, mistakes, or struggles.' },
  { key: 'shutdown_3', text: 'My child emotionally shuts down during conflict.' },
  { key: 'shutdown_4', text: 'My child avoids talking about emotions.' },
  { key: 'shutdown_5', text: 'My child becomes quiet, withdrawn, or disconnected after reactive moments.' },
  { key: 'shutdown_6', text: 'I feel like there is growing emotional distance between me and my child.' },
]

const POLICING_ITEMS: CheckItem[] = [
  { key: 'policing_1', text: 'One of us often steps in during difficult parenting moments.' },
  { key: 'policing_2', text: 'One of us feels criticized or undermined by the other.' },
  { key: 'policing_3', text: 'We\u2019ve had conversations about \u201Cnot stepping in,\u201D but it keeps happening.' },
  { key: 'policing_4', text: 'Our children have seen us disagree in the middle of discipline.' },
  { key: 'policing_5', text: 'We both want to lead with safety, but we both have different concepts of what that is.' },
]
const POLICING_TRIED_ITEMS: CheckItem[] = [
  { key: 'policing_tried_1', text: 'Agreement to be calmer with the kids.' },
  { key: 'policing_tried_2', text: 'Agreeing not to interrupt each other.' },
  { key: 'policing_tried_3', text: 'Agreement to keep all co-parenting disagreements private.' },
]

const UNEVEN_LOAD_ITEMS: CheckItem[] = [
  { key: 'uneven_load_1', text: 'One of us carries most of the parenting and emotional load.' },
  { key: 'uneven_load_2', text: 'One of us feels like the disciplinarian while the other one is the fun parent.' },
  { key: 'uneven_load_3', text: 'The less involved parent wants to parent but feels incapable of meeting the other parent\u2019s expectations.' },
  { key: 'uneven_load_4', text: 'During meltdowns or sibling fights, one parent naturally takes over.' },
  { key: 'uneven_load_5', text: 'We\u2019ve divided responsibilities before, but we fall back into the same roles during conflict.' },
  { key: 'uneven_load_6', text: 'If one of the children becomes reactive, the less involved parent quickly gives up and hands it over to the co-parent.' },
]
const UNEVEN_LOAD_TRIED_ITEMS: CheckItem[] = [
  { key: 'uneven_load_tried_1', text: 'Dividing parenting responsibilities.' },
  { key: 'uneven_load_tried_2', text: 'Agreements on teaming up in child discipline.' },
]

const DOMINO_ITEMS: CheckItem[] = [
  { key: 'domino_1', text: 'When one of us gets overwhelmed, the other quickly does too.' },
  { key: 'domino_2', text: 'We both become emotionally intense with the kids during conflict.' },
  { key: 'domino_3', text: 'We\u2019ve reminded each other to \u201Cstay calm,\u201D but it rarely works.' },
  { key: 'domino_4', text: 'Afterward, we wonder how things got so out of control.' },
]
const DOMINO_TRIED_ITEMS: CheckItem[] = [
  { key: 'domino_tried_1', text: 'Trying harder to stay calm.' },
  { key: 'domino_tried_2', text: 'Agreements to tag each other out.' },
]

/* Flat map of all checkbox items for submit */
const ALL_ITEMS: CheckItem[] = [
  ...FIRECRACKER_ITEMS, ...PRESSURE_COOKER_ITEMS, ...STONEWALL_ITEMS,
  ...MIRRORING_ITEMS, ...DESENSITIZATION_ITEMS, ...POKING_ITEMS,
  ...SCANNING_ITEMS, ...SHUTDOWN_ITEMS,
  ...POLICING_ITEMS, ...POLICING_TRIED_ITEMS,
  ...UNEVEN_LOAD_ITEMS, ...UNEVEN_LOAD_TRIED_ITEMS,
  ...DOMINO_ITEMS, ...DOMINO_TRIED_ITEMS,
]
const ITEMS_MAP: Record<string, string> = Object.fromEntries(
  ALL_ITEMS.map((i) => [i.key, i.text])
)

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function ChecklistPage() {
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const toggle = useCallback((key: string) => {
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const buildCheckedItems = useCallback(() => {
    const result: Record<string, string> = {}
    for (const [key, val] of Object.entries(checked)) {
      if (val) result[key] = ITEMS_MAP[key]
    }
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
        window.location.href = 'https://enroll.hicparenting.com/confirmation-page'
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

  /* Render helpers */
  const renderCheckItems = (items: CheckItem[]) => (
    <ul className="check-list">
      {items.map((item) => {
        const isChecked = checked[item.key] ?? false
        return (
          <li
            key={item.key}
            className={`check-item${isChecked ? ' checked' : ''}`}
            onClick={() => toggle(item.key)}
          >
            <div className="custom-check">
              <span className="check-icon">{'\u2713'}</span>
            </div>
            <span className="check-label">{item.text}</span>
          </li>
        )
      })}
    </ul>
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
            checklist and submit the answers so our team can prepare for our
            upcoming call.
          </p>
          <p>
            HIC Parenting is a parenting coaching agency with the mission of
            helping reactive parents become secure parents by developing 3 core
            secure parenting skills.
          </p>
        </div>

        {/* 3 SKILLS */}
        <div className="skills-box">
          <h3>The 3 Skills</h3>
          <div className="skill-item">
            <div className="skill-num">1</div>
            <p>
              <strong>Emotional Regulation:</strong> It is not about not getting
              angry or taking deep breaths. It{'\u2019'}s knowing what to do with
              anger, frustration, overwhelm, and other emotions and processing
              them safely while parenting your children.
            </p>
          </div>
          <div className="skill-item">
            <div className="skill-num">2</div>
            <p>
              <strong>Mindsight:</strong> It is not trying to speak kindly to your
              children, but to have a full understanding of their needs and speak
              to them in a way they understand and follow.
            </p>
          </div>
          <div className="skill-item">
            <div className="skill-num">3</div>
            <p>
              <strong>Positive Discipline:</strong> It{'\u2019'}s not about raising
              your voice, repeating the same instruction, or threatening them with
              losing electronics. It{'\u2019'}s about developing their skills so
              they have the ability to follow through and make better decisions.
            </p>
          </div>
        </div>

        {/* INTRO TEXT */}
        <div className="info-text-block">
          <p>
            Over the years, we{'\u2019'}ve discovered that most parents fall into
            one of three Reactive types when things get tough.
          </p>
          <p>
            This checklist will help you notice which one shows up for you (and
            for your partner, too).
          </p>
          <p>
            {'\u2728'}{' '}
            <em>
              There are no right or wrong answers {'\u2014'} just awareness and
              growth.
            </em>
          </p>
        </div>

        {/* INSTRUCTIONS */}
        <div className="instructions no-print">
          <p>
            <strong>Ready to reflect?</strong>
          </p>
          <p>{'\u2705'} Check all the boxes that resonate with you.</p>
          <p>{'\u2705'} Ask your partner to do the same.</p>
          <p>
            {'\u2705'} Bring your results to your Free 1:1 Session {'\u2014'}{' '}
            we{'\u2019'}ll explore what this means for your family together.
          </p>
        </div>

        {/* ============================================================ */}
        {/* SECTION 1 — THE FIRECRACKER PATTERN                          */}
        {/* ============================================================ */}
        <div className="card">
          <div className="card-header">
            <h2>
              <span className="emoji">{'\uD83D\uDD25'}</span> 1. The Firecracker
              or Fire Alarm Pattern
            </h2>
            <div className="subtitle">Impulse reactivity</div>
          </div>
          <div className="card-body">
            <div className="description-block">
              <p>
                You react quickly when triggered {'\u2014'} maybe you yell, snap,
                or say something you don{'\u2019'}t mean, and then feel guilty
                afterward.
              </p>
              <p>
                Even though you know what to do, in the heat of the moment, it
                feels impossible to stay calm.
              </p>
              <p>
                This is an impulsive reactive pattern that occurs when the nervous
                system escalates quickly, and the parent lacks the skills to
                prevent the escalation or the body awareness to notice early signs
                of nervous system dysregulation.
              </p>
            </div>
            <div className="subsection-label">
              Please check the statements you relate to. You might notice yourself
              thinking or feeling:
            </div>
            {renderCheckItems(FIRECRACKER_ITEMS)}
          </div>
        </div>

        {/* ============================================================ */}
        {/* SECTION 2 — THE PRESSURE COOKER PATTERN                      */}
        {/* ============================================================ */}
        <div className="card">
          <div className="card-header">
            <h2>
              <span className="emoji">{'\uD83D\uDCA8'}</span> 2. The Pressure
              Cooker Pattern
            </h2>
            <div className="subtitle">Suppressive Reactivity</div>
          </div>
          <div className="card-body">
            <div className="description-block">
              <p>
                When everything builds up inside, you try hard to stay calm
                {'\u2014'} you hold, and hold, and hold{'\u2026'} until suddenly,
                you can{'\u2019'}t do it anymore, and you react with snapping,
                yelling, saying hurtful things, or spanking.
              </p>
              <p>
                You start the day patient and positive, but stress builds, and at
                some point, it overflows.
              </p>
              <p>
                This is a suppression-reactive pattern that occurs when the parent
                dismisses or suppresses their own dysregulation or anger. The
                escalation builds up until it overflows like a pressure cooker with
                no valve.
              </p>
            </div>
            <div className="subsection-label">
              You might notice yourself thinking or feeling:
            </div>
            {renderCheckItems(PRESSURE_COOKER_ITEMS)}
          </div>
        </div>

        {/* ============================================================ */}
        {/* SECTION 3 — THE STONEWALL PARENT                             */}
        {/* ============================================================ */}
        <div className="card">
          <div className="card-header">
            <h2>
              <span className="emoji">{'\uD83E\uDDCA'}</span> 3. The Stonewall
              Parent
            </h2>
            <div className="subtitle">Passive-Aggressive Reactivity</div>
          </div>
          <div className="card-body">
            <div className="description-block">
              <p>When you shut down or check out.</p>
              <p>
                You don{'\u2019'}t yell {'\u2014'} instead, you disconnect or shut
                down. You might stay quiet, walk away, or emotionally {'\u201C'}
                tune out.{'\u201D'} Sometimes you give in just to keep the peace
                or hand things over to your partner when it{'\u2019'}s too much.
              </p>
              <p>
                This is a quiet reactive pattern. This is a hidden type of
                reactivity because the parent is not visibly reactive or upset.
                According to science, this is the highest form of nervous system
                dysregulation, and it happens when the parent feels helpless and
                unable to respond.
              </p>
            </div>
            <div className="subsection-label">
              Please check the statements you relate to the most. You might notice
              yourself thinking or feeling:
            </div>
            {renderCheckItems(STONEWALL_ITEMS)}
          </div>
        </div>

        {/* ============================================================ */}
        {/* EMOTIONAL IMPACT ON CHILDREN — INTRO                         */}
        {/* ============================================================ */}
        <div className="big-divider">Emotional Impact of Reactivity on Children</div>
        <div className="info-text-block">
          <p>Reactive parenting not only affects behavior in the moment.</p>
          <p>
            Over time, children adapt to the emotional environment in which they
            grow up. Sometimes the effects are loud and obvious. Sometimes they
            are quiet and hidden underneath the surface.
          </p>
          <p>
            This checklist is not about guilt or shame. It is about awareness.
          </p>
          <p>
            Because when parents understand how reactivity impacts children
            emotionally, behaviorally, and relationally, they are able to break
            reactive cycles and create a more peaceful, secure family dynamic.
          </p>
          <p>
            <strong>
              Please check the ones you have noticed in your child(ren):
            </strong>
          </p>
        </div>

        {/* ============================================================ */}
        {/* SECTION 4 — MIRRORING BEHAVIORS                              */}
        {/* ============================================================ */}
        <div className="card">
          <div className="card-header">
            <h2>1. Mirroring Behaviors</h2>
            <div className="subtitle">
              Children learn emotional regulation by watching us
            </div>
          </div>
          <div className="card-body">
            <div className="description-block">
              <p>
                When children grow up around frequent reactivity, yelling,
                emotional overwhelm, or dysregulation, they often mirror the same
                behaviors because that becomes their model for handling stress and
                emotions.
              </p>
            </div>
            <div className="subsection-label">This may look like</div>
            {renderCheckItems(MIRRORING_ITEMS)}
          </div>
        </div>

        {/* ============================================================ */}
        {/* SECTION 5 — DESENSITIZATION TO REACTIVITY                    */}
        {/* ============================================================ */}
        <div className="card">
          <div className="card-header">
            <h2>2. Desensitization to Reactivity</h2>
            <div className="subtitle">
              Children in reactive homes can become emotionally desensitized to
              calm communication
            </div>
          </div>
          <div className="card-body">
            <div className="description-block">
              <p>
                It{'\u2019'}s kind of like living next to a train track: at first,
                every train feels loud, but over time, the nervous system adapts
                and only reacts to the REALLY loud trains. Children can become so
                used to emotional intensity that calm requests no longer feel
                urgent to their nervous system.
              </p>
            </div>
            <div className="subsection-label">This may look like</div>
            {renderCheckItems(DESENSITIZATION_ITEMS)}
          </div>
        </div>

        {/* ============================================================ */}
        {/* SECTION 6 — "POKING THE BEAR" BEHAVIORS                      */}
        {/* ============================================================ */}
        <div className="card">
          <div className="card-header">
            <h2>3. {'\u201C'}Poking the Bear{'\u201D'} Behaviors</h2>
            <div className="subtitle">
              Testing, provoking, or pushing limits constantly
            </div>
          </div>
          <div className="card-body">
            <div className="description-block">
              <p>
                Some children begin testing, provoking, or pushing limits
                constantly. Not always because they want conflict{'\u2026'} but
                waiting for the explosion can feel emotionally nerve-wracking and
                unpredictable. So their nervous system would rather {'\u201C'}get
                the reaction over with now{'\u201D'} than stay anxiously waiting
                for it later.
              </p>
            </div>
            <div className="subsection-label">This may look like</div>
            {renderCheckItems(POKING_ITEMS)}
          </div>
        </div>

        {/* ============================================================ */}
        {/* SECTION 7 — EMOTIONAL SCANNING BEHAVIORS                     */}
        {/* ============================================================ */}
        <div className="card">
          <div className="card-header">
            <h2>4. Emotional Scanning Behaviors</h2>
            <div className="subtitle">
              Hyper-aware of parents{'\u2019'} moods and emotional safety
            </div>
          </div>
          <div className="card-body">
            <div className="description-block">
              <p>
                Children naturally scan their parents for emotional safety. But in
                reactive homes, some children become hyper-aware of the parents
                {'\u2019'} moods, tone, energy, or facial expressions because
                their nervous system is trying to predict emotional danger and stay
                safe. Some children become people-pleasers. Others become {'\u201C'}
                funny,{'\u201D'} overly playful, or highly accommodating to try to
                keep the peace.
              </p>
            </div>
            <div className="subsection-label">This may look like</div>
            {renderCheckItems(SCANNING_ITEMS)}
          </div>
        </div>

        {/* ============================================================ */}
        {/* SECTION 8 — SHUTDOWN & EMOTIONAL DISCONNECTION               */}
        {/* ============================================================ */}
        <div className="card">
          <div className="card-header">
            <h2>5. Shutdown & Emotional Disconnection</h2>
            <div className="subtitle">
              Children protecting themselves by emotionally withdrawing
            </div>
          </div>
          <div className="card-body">
            <div className="description-block">
              <p>Some children do not become louder.</p>
              <p>
                Children may begin disconnecting emotionally to protect themselves.
                Over time, this can create emotional distance between parents and
                children.
              </p>
            </div>
            <div className="subsection-label">This may look like</div>
            {renderCheckItems(SHUTDOWN_ITEMS)}
          </div>
        </div>

        {/* ============================================================ */}
        {/* CO-PARENTING DYNAMIC — INTRO                                 */}
        {/* ============================================================ */}
        <div className="big-divider">
          Impact of Reactive Patterns on the Co-Parenting Dynamic
        </div>
        <div className="info-text-block">
          <p>Reactive parenting not only affects children.</p>
          <p>
            Over time, reactive patterns also deeply affect the relationship
            between co-parents. Many couples slowly stop feeling like a team and
            begin operating from: survival mode, tension, resentment, emotional
            exhaustion, micromanaging, shutdown, or emotional disconnection.
          </p>
          <p>
            This checklist is designed to help you recognize how reactive patterns
            may already be affecting your co-parenting relationship. This is not
            about blame. It is about awareness.
          </p>
          <p>
            <strong>Please check the ones you relate to most.</strong>
          </p>
        </div>

        <div className="info-text-block" style={{ marginBottom: 8 }}>
          <h3
            style={{
              fontFamily: "'Lora', serif",
              fontSize: '1.1rem',
              fontWeight: 700,
              color: 'var(--blue)',
              marginBottom: 10,
            }}
          >
            Which Co-Parenting Dynamic Feels Most Like Your Family?
          </h3>
          <p>
            Most couples don{'\u2019'}t have a communication problem. They have a
            repeating co-parenting dynamic rooted in poor emotional safety and
            underdeveloped skills to understand each other{'\u2019'}s needs,
            regulate emotions, and lead securely.
          </p>
          <p>
            Read through the three most common dynamics below and check the one
            that feels most like your family today.
          </p>
        </div>

        {/* ============================================================ */}
        {/* SECTION 9 — THE POLICING DYNAMIC                             */}
        {/* ============================================================ */}
        <div className="card">
          <div className="card-header">
            <h2>
              <span className="emoji">{'\uD83D\uDEA8'}</span> The Policing
              Dynamic
            </h2>
            <div className="subtitle">
              {'\u201C'}I feel like I have to step in.{'\u201D'}
            </div>
          </div>
          <div className="card-body">
            <div className="description-block">
              <p>
                One parent sees the other becoming emotionally reactive with the
                children and steps in to protect them. The other parent feels
                criticized, undermined, or disrespected. Both parents love their
                children deeply{'\u2014'}but they keep repeating the same pattern.
              </p>
            </div>
            <div className="subsection-label">
              {'\u2714'} This sounds like us...
            </div>
            {renderCheckItems(POLICING_ITEMS)}
            <div className="subsection-label">We have tried this before:</div>
            {renderCheckItems(POLICING_TRIED_ITEMS)}
            <div className="why-block">
              <strong>Why it doesn{'\u2019'}t work</strong>
              <p>
                When one parent{'\u2019'}s nervous system senses emotional danger,
                protecting the child feels more urgent than honoring the agreement.
                This isn{'\u2019'}t a communication problem; it{'\u2019'}s a
                nervous system problem solved by developing secure parenting skills
                so both parents feel emotionally safe with each other{'\u2019'}s
                parenting or communication.
              </p>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* SECTION 10 — THE UNEVEN LOAD DYNAMIC                         */}
        {/* ============================================================ */}
        <div className="card">
          <div className="card-header">
            <h2>
              <span className="emoji">{'\u2696\uFE0F'}</span> The Uneven Load
              Dynamic
            </h2>
            <div className="subtitle">
              {'\u201C'}I feel like I{'\u2019'}m carrying parenting alone.{'\u201D'}
            </div>
          </div>
          <div className="card-body">
            <div className="description-block">
              <p>
                One parent becomes the emotional leader of the family while the
                other stays in the background{'\u2014'}not because they don
                {'\u2019'}t care, but because they don{'\u2019'}t feel confident
                stepping into difficult parenting moments, or when they have tried,
                things tend to escalate from there.
              </p>
            </div>
            <div className="subsection-label">
              {'\u2714'} This sounds like us...
            </div>
            {renderCheckItems(UNEVEN_LOAD_ITEMS)}
            <div className="subsection-label">We have tried this before:</div>
            {renderCheckItems(UNEVEN_LOAD_TRIED_ITEMS)}
            <div className="why-block">
              <strong>Why it doesn{'\u2019'}t work</strong>
              <p>
                The issue isn{'\u2019'}t who packs lunches, does bedtime, or gets
                involved in discipline. The pattern appears when emotions run high
                because one parent doesn{'\u2019'}t yet feel emotionally safe or
                equipped to lead through conflict, so they disengage. This is not
                solved with another conversation but with developing secure
                parenting skills to feel capable of leading your family in a secure
                way when emotions run high.
              </p>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* SECTION 11 — THE DOMINO EFFECT DYNAMIC                       */}
        {/* ============================================================ */}
        <div className="card">
          <div className="card-header">
            <h2>
              <span className="emoji">{'\uD83C\uDFB2'}</span> The Domino Effect
              Dynamic
            </h2>
            <div className="subtitle">
              {'\u201C'}When the calmer parent falls, everyone follows.{'\u201D'}
            </div>
          </div>
          <div className="card-body">
            <div className="description-block">
              <p>
                Both parents deeply care about each other. But when one becomes
                emotionally activated, the other joins the chaos in attempts to
                help the co-parent instead of regulating the situation. Before long,
                both parents are emotionally intense with the children, and the
                whole family escalates together.
              </p>
            </div>
            <div className="subsection-label">
              {'\u2714'} This sounds like us...
            </div>
            {renderCheckItems(DOMINO_ITEMS)}
            <div className="subsection-label">We have tried this before:</div>
            {renderCheckItems(DOMINO_TRIED_ITEMS)}
            <div className="why-block">
              <strong>Why it doesn{'\u2019'}t work</strong>
              <p>
                When neither parent knows how to regulate themselves{'\u2014'}or
                each other{'\u2014'}the child{'\u2019'}s emotions quickly overwhelm
                the whole family. This isn{'\u2019'}t about trying harder or having
                another conversation; it{'\u2019'}s about developing skills to
                remain secure parents when dysregulation happens.
              </p>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* WHAT ACTUALLY CHANGES REACTIVE PATTERNS                      */}
        {/* ============================================================ */}
        <div className="what-changes-box">
          <h2>{'\uD83D\uDC99'} What Actually Changes Reactive Patterns?</h2>
          <p>Most parents believe they need:</p>
          <ul className="myth-list">
            <li>{'\u274C'} More help on division of tasks among coparents</li>
            <li>{'\u274C'} Better agreements</li>
            <li>{'\u274C'} More parenting information</li>
            <li>{'\u274C'} More patience</li>
            <li>{'\u274C'} A vacation or less busy schedules</li>
            <li>
              {'\u274C'} To wait until the kids grow up (Reactivity travels
              developmental stages AND generations)
            </li>
          </ul>
          <p>
            Those things help when everyone is calm, but not when emotions run
            high.
          </p>
          <h3>What Makes Reactive Parents Become Secure Parents:</h3>
          <p>
            Reactive parents become secure parents when they integrate 3 Secure
            Parenting Skills.
          </p>
          <p>
            <strong>The Head, Heart, and Hands of a Secure Parent:</strong>
          </p>
          <div className="skill-item">
            <div className="skill-num">{'\uD83E\uDDE0'}</div>
            <p>
              <strong>The Head. The Skill of Mindsight:</strong> It is not trying
              to speak kindly to your children, but to have a full understanding of
              their needs and speak to them in a way they understand and follow.
            </p>
          </div>
          <div className="skill-item">
            <div className="skill-num">{'\uD83D\uDC99'}</div>
            <p>
              <strong>The Heart. Emotional Regulation:</strong> It is not about not
              getting angry or taking deep breaths. It{'\u2019'}s knowing what to
              do with anger, frustration, overwhelm, and other emotions and
              processing them safely while parenting your children.
            </p>
          </div>
          <div className="skill-item">
            <div className="skill-num">{'\uD83E\uDEF6'}</div>
            <p>
              <strong>The Hands. The Skill of Positive Discipline:</strong> It
              {'\u2019'}s not about raising your voice, repeating the same
              instruction, or threatening them with losing electronics. It{'\u2019'}
              s about developing their skills so they have the ability to follow
              through and make better decisions.
            </p>
          </div>
        </div>

        {/* ============================================================ */}
        {/* SUBMIT FORM                                                  */}
        {/* ============================================================ */}
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
                  ? '\u2705 Submitted!'
                  : submitting
                    ? 'Submitting...'
                    : 'Submit My Results'}
              </button>
            </form>
          </div>
        </div>

        {/* ============================================================ */}
        {/* REFLECTION                                                   */}
        {/* ============================================================ */}
        <div className="reflection-box">
          <h2>Reflection</h2>
          <p>
            If you checked several of these boxes, it does{' '}
            <strong>NOT</strong> mean your family is broken. It means your family
            system may be stuck in reactivity patterns.
          </p>
          <div className="highlight">
            <strong>What to expect from your session with us:</strong>
            <br />
            You will get a nuanced awareness of your particular dynamic; you will
            get clear on what you want moving forward in your parenting, and you
            will hear our recommendation based on your needs.
            <br />
            <br />
            At the end of the session, if you believe private coaching is what you
            need moving forward, let us know, and with your permission, we will
            share with you how we help parents in coaching, and you{'\u2019'}ll
            make an enrollment decision.
            <br />
            <br />
            <em>
              Coaching processes usually take months, and the level of support
              varies based on your needs. Most of our coaching options are in the
              low-thousands range USD.
            </em>
          </div>
        </div>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Styles                                                            */
/* ------------------------------------------------------------------ */

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

  .info-text-block {
    background: white;
    border-radius: 14px;
    padding: 22px 28px;
    margin-bottom: 28px;
    font-size: 0.93rem;
    color: var(--text);
    border: 1px solid var(--border);
  }

  .info-text-block p { margin-bottom: 10px; }
  .info-text-block p:last-child { margin-bottom: 0; }

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

  .why-block {
    background: #FFF9F0;
    border-left: 3px solid var(--orange);
    border-radius: 0 10px 10px 0;
    padding: 16px 20px;
    margin-top: 20px;
    font-size: 0.9rem;
  }

  .why-block strong {
    display: block;
    color: var(--dark);
    margin-bottom: 6px;
    font-size: 0.85rem;
  }

  .why-block p {
    color: var(--muted);
    margin: 0;
  }

  .what-changes-box {
    background: white;
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 32px 28px;
    margin-top: 36px;
  }

  .what-changes-box h2 {
    font-family: 'Lora', serif;
    font-size: 1.3rem;
    font-weight: 700;
    color: var(--dark);
    margin-bottom: 16px;
  }

  .what-changes-box h3 {
    font-family: 'Lora', serif;
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--blue);
    margin: 20px 0 10px;
  }

  .what-changes-box p {
    font-size: 0.93rem;
    color: var(--text);
    margin-bottom: 10px;
  }

  .myth-list {
    list-style: none;
    margin: 12px 0 16px;
    padding: 0;
  }

  .myth-list li {
    font-size: 0.93rem;
    color: var(--text);
    padding: 4px 0;
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
