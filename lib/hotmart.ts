// ── Hotmart API v1 client ────────────────────────────────────────────────────

let cachedToken: { token: string; expiresAt: number } | null = null

export async function getHotmartToken(): Promise<string> {
  // Return cached token if still valid (with 5 min buffer)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 5 * 60 * 1000) {
    return cachedToken.token
  }

  const clientId = process.env.HOTMART_CLIENT_ID!
  const clientSecret = process.env.HOTMART_CLIENT_SECRET!
  const basic = process.env.HOTMART_BASIC!

  const url = `https://api-sec-vlc.hotmart.com/security/oauth/token?grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: basic },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Hotmart auth failed (${res.status}): ${text}`)
  }

  const data = await res.json()
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 172799) * 1000,
  }

  return cachedToken.token
}

export interface HotmartSubscriber {
  subscriber_code: string
  subscription_id: number
  status: string
  accession_date: number
  end_accession_date: number
  request_date: number
  date_next_charge: number
  trial: boolean
  transaction: string
  plan: { name: string; id: number }
  price: { value: number; currency_code: string }
  subscriber: { name: string; email: string; ucode: string }
  purchase_recurrency_number?: number
}

interface HotmartPage {
  items: HotmartSubscriber[]
  page_info: {
    total_results: number
    next_page_token?: string
    items_per_page: number
  }
}

export async function getHotmartSubscribers(pageToken?: string): Promise<HotmartPage> {
  const token = await getHotmartToken()
  const productId = process.env.HOTMART_PRODUCT_ID!

  let url = `https://developers.hotmart.com/payments/api/v1/subscriptions?product_id=${productId}&max_results=50`
  if (pageToken) url += `&page_token=${pageToken}`

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Hotmart subscribers API failed (${res.status}): ${text}`)
  }

  return res.json()
}

export async function getAllHotmartSubscribers(): Promise<HotmartSubscriber[]> {
  const all: HotmartSubscriber[] = []
  let pageToken: string | undefined

  do {
    const page = await getHotmartSubscribers(pageToken)
    all.push(...(page.items ?? []))
    pageToken = page.page_info?.next_page_token
  } while (pageToken)

  return all
}

// ── Club API ────────────────────────────────────────────────────────────────

export interface HotmartClubMember {
  user_id: number
  name: string
  email: string
  status: string
  engagement: string
  role: string
  type: string
  access_count: number
  last_access_date: number | null
  first_access_date: number | null
  purchase_date: number | null
  progress: {
    completed: number
    completed_percentage: number
    total: number
  }
}

interface ClubPage {
  items: HotmartClubMember[]
  page_info: {
    total_results: number
    next_page_token?: string
    items_per_page: number
  }
}

export interface HotmartClubLesson {
  is_completed: boolean
  completed_date: number | null
  module_name: string
  page_name: string
}

export async function getClubMembers(pageToken?: string): Promise<ClubPage> {
  const token = await getHotmartToken()

  let url = 'https://developers.hotmart.com/club/api/v1/users?subdomain=secureparentcollective&max_results=50'
  if (pageToken) url += `&page_token=${pageToken}`

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Hotmart Club API failed (${res.status}): ${text}`)
  }

  return res.json()
}

export async function getAllClubMembers(): Promise<HotmartClubMember[]> {
  const all: HotmartClubMember[] = []
  let pageToken: string | undefined

  do {
    const page = await getClubMembers(pageToken)
    all.push(...(page.items ?? []))
    pageToken = page.page_info?.next_page_token
  } while (pageToken)

  return all
}

export async function getMemberLessons(userId: string): Promise<HotmartClubLesson[]> {
  const token = await getHotmartToken()

  const res = await fetch(
    `https://developers.hotmart.com/club/api/v1/users/${userId}/lessons?subdomain=secureparentcollective`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Hotmart Club lessons API failed (${res.status}): ${text}`)
  }

  const data = await res.json()
  return data.items ?? data ?? []
}
