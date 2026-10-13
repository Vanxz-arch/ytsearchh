'use client'

async function ytReq(endpoint, params, userKey) {
  const sp = new URLSearchParams({ _ep: endpoint })
  if (userKey) sp.set('_key', userKey)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v))
  }
  const res = await fetch(`/api/youtube?${sp}`)
  const data = await res.json()
  if (!res.ok) {
    const err = Object.assign(
      new Error(data?.error?.message || `HTTP ${res.status}`),
      { status: res.status, reason: data?.error?.errors?.[0]?.reason }
    )
    throw err
  }
  return data
}

export async function resolveChannel(raw, key) {
  raw = raw.trim()
  const um = raw.match(/youtube\.com\/(?:channel\/|c\/|user\/|@)([^/?&#\s]+)/)
  if (um) raw = um[1]
  const handle = raw.startsWith('@') ? raw : `@${raw}`
  const plain  = raw.startsWith('@') ? raw.slice(1) : raw

  try {
    const d = await ytReq('channels', { forHandle: handle, part: 'id,snippet,statistics' }, key)
    if (d.items?.length) return parseChannel(d.items[0])
  } catch {}

  try {
    const d = await ytReq('channels', { forUsername: plain, part: 'id,snippet,statistics' }, key)
    if (d.items?.length) return parseChannel(d.items[0])
  } catch {}

  const sd = await ytReq('search', { q: plain, type: 'channel', part: 'snippet', maxResults: 3 }, key)
  if (!sd.items?.length) throw new Error('Channel tidak ditemukan. Periksa @handle atau URL.')

  const best = sd.items.find(i => {
    const t = (i.snippet.title || '').toLowerCase()
    return t === plain.toLowerCase() || t.includes(plain.toLowerCase())
  }) || sd.items[0]

  const cd = await ytReq('channels', { id: best.snippet.channelId, part: 'id,snippet,statistics' }, key)
  if (!cd.items?.length) throw new Error('Channel tidak ditemukan.')
  return parseChannel(cd.items[0])
}

function parseChannel(item) {
  const sn = item.snippet, st = item.statistics || {}
  return {
    id: item.id,
    title: sn.title,
    thumb: sn.thumbnails?.default?.url || '',
    subs: st.subscriberCount ? fmtN(st.subscriberCount) + ' subscriber' : '',
  }
}

export async function searchVideos({ channelId, kw, from, to, order, page, key }) {
  const p = { channelId, q: kw, type: 'video', part: 'snippet', maxResults: 20, order: order || 'relevance' }
  if (from) p.publishedAfter = new Date(from).toISOString()
  if (to) { const d = new Date(to); d.setHours(23,59,59); p.publishedBefore = d.toISOString() }
  if (page) p.pageToken = page
  return ytReq('search', p, key)
}

export async function getVideoDetails(ids, key) {
  if (!ids.length) return []
  const out = []
  for (const chunk of splitArr(ids, 50)) {
    const d = await ytReq('videos', { id: chunk.join(','), part: 'snippet,statistics,contentDetails' }, key)
    out.push(...(d.items || []))
  }
  return out
}

// ── Transcript ──
const TR_CACHE = new Map()

export async function fetchTranscript(videoId) {
  if (TR_CACHE.has(videoId)) return TR_CACHE.get(videoId)
  try {
    const res = await fetch(`/api/transcript?v=${videoId}`)
    if (!res.ok) return null
    const data = await res.json()
    if (!data.xml) return null
    const parsed = parseTranscriptXML(data.xml)
    TR_CACHE.set(videoId, { segments: parsed, lang: data.lang })
    return { segments: parsed, lang: data.lang }
  } catch { return null }
}

function parseTranscriptXML(xml) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'text/xml')
  return Array.from(doc.querySelectorAll('text')).map(el => ({
    start: parseFloat(el.getAttribute('start') || '0'),
    text: el.textContent
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
      .replace(/<[^>]+>/g, '').trim(),
  })).filter(e => e.text)
}

export function searchTranscript(segments, kw) {
  const k = kw.toLowerCase()
  const hits = []
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].text.toLowerCase().includes(k)) {
      const ctx = segments.slice(Math.max(0, i-1), i+3).map(s => s.text).join(' ')
      hits.push({ start: segments[i].start, text: ctx })
      i += 2
    }
  }
  return hits
}

// ── Utils ──
export function fmtN(n) {
  n = parseInt(n, 10)
  if (n >= 1e9) return (n/1e9).toFixed(1)+'M'
  if (n >= 1e6) return (n/1e6).toFixed(1)+'jt'
  if (n >= 1e3) return (n/1e3).toFixed(1)+'rb'
  return n.toLocaleString('id-ID')
}

export function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' })
}

export function parseDur(iso) {
  const m = iso?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!m) return ''
  const h=+(m[1]||0), mn=+(m[2]||0), s=+(m[3]||0)
  if (h) return `${h}:${String(mn).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  return `${mn}:${String(s).padStart(2,'0')}`
}

export function fmtTime(s) {
  const sec=Math.floor(s), m=Math.floor(sec/60), h=Math.floor(m/60)
  if (h>0) return `${h}:${String(m%60).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`
  return `${m}:${String(sec%60).padStart(2,'0')}`
}

export function snip(txt, kw, max=120) {
  if (!txt) return ''
  const i = txt.toLowerCase().indexOf(kw.toLowerCase())
  if (i < 0) return txt.slice(0, max) + (txt.length > max ? '...' : '')
  const s = Math.max(0, i-40), e = Math.min(txt.length, i+kw.length+80)
  return (s>0?'...':'')+txt.slice(s,e)+(e<txt.length?'...':'')
}

export function splitArr(arr, n) {
  const out = []
  for (let i=0; i<arr.length; i+=n) out.push(arr.slice(i,i+n))
  return out
}

export function highlight(text, kw) {
  if (!kw || !text) return text
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>')
}
