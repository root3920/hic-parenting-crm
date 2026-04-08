export interface GoalConfig {
  target: number
  alert: number
  unit: string
  label: string
  description: string
  targetMax?: number
}

export const GOALS = {
  setting: {
    pitchRate: {
      target: 5.5,
      alert: 4.0,
      unit: '%',
      label: 'Pitch Rate',
      description: 'Calls propuestas / Total convos',
    } as GoalConfig,
    bookingRate: {
      target: 30.0,
      alert: 20.0,
      unit: '%',
      label: 'Booking Rate',
      description: 'Calls calificadas / Calls propuestas',
    } as GoalConfig,
    conversionGeneral: {
      target: 1.65,
      alert: 1.0,
      unit: '%',
      label: 'Conversión General',
      description: 'Calls calificadas / Total convos',
    } as GoalConfig,
  },
  closing: {
    showRate: {
      target: 65.0,
      alert: 50.0,
      unit: '%',
      label: 'Show Rate',
      description: 'Showed up / Total meetings',
    } as GoalConfig,
    offerRate: {
      target: 80.0,
      alert: 70.0,
      unit: '%',
      label: 'Offer Rate',
      description: 'Offers / Showed up meetings',
    } as GoalConfig,
    closeRate: {
      target: 30.0,
      alert: 25.0,
      unit: '%',
      label: 'Close Rate',
      description: 'Won deals / Offers proposed',
      targetMax: 40.0,
    } as GoalConfig,
    callsPerWeek: {
      target: 6.0,
      alert: 5.0,
      unit: '',
      label: 'Calls / semana',
      description: 'Total meetings / weeks',
      targetMax: 10.0,
    } as GoalConfig,
  },
}

export type GoalStatus = 'on_target' | 'warning' | 'alert'

export function getGoalStatus(value: number, goal: GoalConfig): GoalStatus {
  if (isNaN(value)) return 'alert'
  if (goal.targetMax !== undefined) {
    if (value >= goal.target && value <= goal.targetMax) return 'on_target'
    if (value >= goal.alert) return 'warning'
    return 'alert'
  }
  if (value >= goal.target) return 'on_target'
  if (value >= goal.alert) return 'warning'
  return 'alert'
}

export function getStatusColors(status: GoalStatus) {
  const map = {
    on_target: {
      bg: 'bg-green-50 dark:bg-green-950',
      border: 'border-l-green-500',
      text: 'text-green-700 dark:text-green-400',
      bar: '#3B6D11',
      badge: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
      label: '✓ En meta',
    },
    warning: {
      bg: 'bg-amber-50 dark:bg-amber-950',
      border: 'border-l-amber-500',
      text: 'text-amber-700 dark:text-amber-400',
      bar: '#BA7517',
      badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
      label: '⚠ Por mejorar',
    },
    alert: {
      bg: 'bg-red-50 dark:bg-red-950',
      border: 'border-l-red-500',
      text: 'text-red-700 dark:text-red-400',
      bar: '#A32D2D',
      badge: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
      label: '✗ Alerta',
    },
  }
  return map[status]
}
