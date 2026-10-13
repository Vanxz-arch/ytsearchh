const YT_BASE = 'https://www.googleapis.com/youtube/v3'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const endpoint = searchParams.get('_ep')
  if (!endpoint) {
    return Response.json({ error: 'Missing endpoint' }, { status: 400 })
  }

  // Use server-side env var; fall back to client-provided key (stored safely)
  const apiKey = process.env.YOUTUBE_API_KEY || searchParams.get('_key')
  if (!apiKey) {
    return Response.json({ error: 'No API key configured' }, { status: 401 })
  }

  const params = new URLSearchParams()
  params.set('key', apiKey)

  for (const [k, v] of searchParams.entries()) {
    if (k !== '_ep' && k !== '_key' && v) params.set(k, v)
  }

  try {
    const res = await fetch(`${YT_BASE}/${endpoint}?${params}`, {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 60 },
    })
    const data = await res.json()

    if (!res.ok) {
      return Response.json(data, { status: res.status })
    }
    return Response.json(data)
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
