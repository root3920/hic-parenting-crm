export function getCanonicalProduct(offerTitle: string): string {
  const t = (offerTitle || '').toLowerCase()

  if (t.includes('individual') && (t.includes('parenting with understanding') || t.includes('pwu')))
    return 'Parenting With Understanding — Individual'

  if (t.includes('group') && (t.includes('parenting with understanding') || t.includes('pwu')))
    return 'Parenting With Understanding — Group'

  if (t.includes('graduate') || t.includes('grad') || t.includes('10 sessions'))
    return 'Parenting With Understanding — Individual'

  if (t.includes('parenting with understanding') || t.includes('pwu coaching'))
    return 'Parenting With Understanding — Individual'

  if (t.includes('secure parent collective') || t.includes('spc'))
    return 'Secure Parent Collective'

  if (t.includes('break the yelling') || t.includes('yelling cycle'))
    return 'Break The Yelling Cycle'

  if (t.includes('navigating feelings') || t.includes('navigating feeling'))
    return 'Navigating Feelings Toolkit'

  if (t.includes('discipline without harm'))
    return 'Discipline Without Harm'

  if (t.includes('coping strategies'))
    return 'The Coping Strategies Guide'

  if (t.includes('tantrums'))
    return 'The Tantrums Workshop'

  if (t.includes('calmer morning') || t.includes('morning routines'))
    return 'The Calmer Morning Routines Workshop'

  if (
    t.includes('use framework') ||
    t.includes('u.s.e framework') ||
    t.includes('use method') ||
    t.includes('u.s.e. method') ||
    t.includes('correct any behavior')
  )
    return 'The U.S.E. Framework Workshop'

  if (t.includes('raising secure'))
    return 'Raising Secure Children'

  if (t.includes('open house'))
    return 'Open House — Secure Parent Collective'

  if (t.includes('advance mentorship'))
    return 'Advance Mentorship Program'

  if (t.includes('podcast') || t.includes('private podcast') || t.includes('cycle breaker'))
    return 'The Cycle Breaker Podcast'

  if (t.includes('child discipline guide'))
    return 'The Child Discipline Guide'

  if (t.includes('play dependency') || t.includes('screen') || t.includes('3 step method'))
    return 'Digital Products'

  if (t.includes('bundle'))
    return 'Bundle'

  return 'Otros'
}
