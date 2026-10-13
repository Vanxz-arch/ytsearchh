export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const videoId = searchParams.get('v')
  if (!videoId) return Response.json({ error: 'Missing video ID' }, { status: 400 })

  try {
    // Fetch YouTube watch page
    const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
      },
    })
    if (!pageRes.ok) return Response.json({ tracks: [] })
    const html = await pageRes.text()

    // Extract caption tracks
    const match = html.match(/"captionTracks"\s*:\s*(\[[\s\S]+?\])/)
    if (!match) return Response.json({ tracks: [] })

    let tracks
    try { tracks = JSON.parse(match[1]) } catch { return Response.json({ tracks: [] }) }

    // Return available tracks metadata
    const available = tracks.map(t => ({
      lang: t.languageCode,
      name: t.name?.simpleText || t.languageCode,
      url: t.baseUrl,
    }))

    // Fetch preferred transcript (id > en > first)
    const preferred = tracks.find(t => t.languageCode === 'id')
      || tracks.find(t => t.languageCode === 'en')
      || tracks[0]

    if (!preferred?.baseUrl) return Response.json({ tracks: available, segments: [] })

    const xmlRes = await fetch(preferred.baseUrl)
    if (!xmlRes.ok) return Response.json({ tracks: available, segments: [] })
    const xml = await xmlRes.text()

    return Response.json({ tracks: available, xml, lang: preferred.languageCode })
  } catch (err) {
    return Response.json({ error: err.message, tracks: [], segments: [] })
  }
}
