const KAJABI_BASE = 'https://api.kajabi.com/v1'

async function getKajabiToken(): Promise<string> {
  const res = await fetch(`${KAJABI_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.KAJABI_CLIENT_ID!,
      client_secret: process.env.KAJABI_CLIENT_SECRET!,
      grant_type: 'client_credentials',
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error('Kajabi auth failed: ' + JSON.stringify(data))
  return data.access_token
}

async function kajabiGet(path: string, token: string, params?: Record<string, string>) {
  const url = new URL(`${KAJABI_BASE}${path}`)
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.api+json',
    },
  })
  if (!res.ok) throw new Error(`Kajabi API error ${res.status}: ${await res.text()}`)
  return res.json()
}

async function kajabiGetAll(path: string, token: string, params?: Record<string, string>) {
  const allData: any[] = []
  let page = 1

  while (true) {
    const data = await kajabiGet(path, token, {
      ...params,
      'page[number]': String(page),
      'page[size]': '100',
    })

    if (data.data?.length) allData.push(...data.data)

    const totalPages = data.meta?.total_pages ?? 1
    if (page >= totalPages) break
    page++
  }

  return allData
}

export { getKajabiToken, kajabiGet, kajabiGetAll }
