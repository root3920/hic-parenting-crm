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

  const tokenUrl = `https://api-sec-vlc.hotmart.com/security/oauth/token?grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`
  console.log('[Hotmart Auth] Requesting token from:', tokenUrl.split('?')[0])

  let res: Response
  try {
    res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { Authorization: basic },
    })
  } catch (err: any) {
    console.error('[Hotmart Auth] Fetch failed:', err.message)
    throw new Error(`Hotmart auth fetch failed: ${err.message}`)
  }

  console.log('[Hotmart Auth] Response status:', res.status)
  const text = await res.text()
  console.log('[Hotmart Auth] Response body:', text.substring(0, 300))

  if (!res.ok) {
    throw new Error(`Hotmart auth failed (${res.status}): ${text.substring(0, 200)}`)
  }

  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`Hotmart auth: invalid JSON response: ${text.substring(0, 200)}`)
  }

  console.log('[Hotmart Auth] Token data keys:', Object.keys(data))

  if (!data.access_token) {
    throw new Error(`Hotmart auth: no access_token in response. Keys: ${Object.keys(data).join(', ')}`)
  }

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

  const url = `https://developers.hotmart.com/payments/api/v1/subscriptions?product_id=${productId}&max_results=50${pageToken ? `&page_token=${pageToken}` : ''}`
  console.log('[Hotmart Subscribers] Fetching:', url.split('?')[0])

  let res: Response
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })
  } catch (err: any) {
    console.error('[Hotmart Subscribers] Fetch failed:', err.message)
    throw new Error(`Hotmart subscribers fetch failed: ${err.message}`)
  }

  console.log('[Hotmart Subscribers] Response status:', res.status)
  const text = await res.text()
  console.log('[Hotmart Subscribers] Response body preview:', text.substring(0, 200))

  if (!res.ok) {
    throw new Error(`Hotmart subscribers API failed (${res.status}): ${text.substring(0, 200)}`)
  }

  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`Hotmart subscribers: invalid JSON: ${text.substring(0, 200)}`)
  }
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

  const url = `https://developers.hotmart.com/club/api/v1/users?subdomain=secureparentcollective&max_results=50${pageToken ? `&page_token=${pageToken}` : ''}`
  console.log('[Hotmart Club] Fetching:', url.split('?')[0])

  let res: Response
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })
  } catch (err: any) {
    console.error('[Hotmart Club] Fetch failed:', err.message)
    throw new Error(`Hotmart Club fetch failed: ${err.message}`)
  }

  console.log('[Hotmart Club] Response status:', res.status)
  const text = await res.text()
  console.log('[Hotmart Club] Response body preview:', text.substring(0, 200))

  if (!res.ok) {
    throw new Error(`Hotmart Club API failed (${res.status}): ${text.substring(0, 200)}`)
  }

  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`Hotmart Club: invalid JSON: ${text.substring(0, 200)}`)
  }

  if (!data.items) {
    console.log('[Hotmart Club] No items array in response. Keys:', Object.keys(data))
    return { items: [], page_info: { total_results: 0, items_per_page: 0 } }
  }

  return data
}

export async function getAllClubMembers(): Promise<HotmartClubMember[]> {
  const all: HotmartClubMember[] = []
  let pageToken: string | undefined

  do {
    const page = await getClubMembers(pageToken)
    if (!page.items || page.items.length === 0) break
    all.push(...page.items)
    pageToken = page.page_info?.next_page_token
  } while (pageToken)

  return all
}

export async function getMemberLessons(userId: string): Promise<HotmartClubLesson[]> {
  const token = await getHotmartToken()

  const url = `https://developers.hotmart.com/club/api/v1/users/${userId}/lessons?subdomain=secureparentcollective`
  console.log('[Hotmart Lessons] Fetching for user:', userId)

  let res: Response
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })
  } catch (err: any) {
    console.error('[Hotmart Lessons] Fetch failed:', err.message)
    throw new Error(`Hotmart lessons fetch failed: ${err.message}`)
  }

  console.log('[Hotmart Lessons] Response status:', res.status)

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Hotmart Club lessons API failed (${res.status}): ${text.substring(0, 200)}`)
  }

  const data = await res.json()
  return data.items ?? data ?? []
}
