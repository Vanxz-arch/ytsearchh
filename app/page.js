'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import {
  resolveChannel, searchVideos, getVideoDetails,
  fetchTranscript, searchTranscript,
  fmtN, fmtDate, parseDur, fmtTime, snip, highlight,
} from '../lib/youtube'
import styles from './page.module.css'

// ── LocalStorage ──
const LS = {
  get: k => { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } },
  set: (k,v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} },
  del: k => { try { localStorage.removeItem(k) } catch {} },
}

// ── Highlight component ──
function Highlight({ text, kw }) {
  if (!kw || !text) return <>{text}</>
  const parts = text.split(new RegExp(`(${kw.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi'))
  return <>{parts.map((p,i) => p.toLowerCase()===kw.toLowerCase() ? <mark key={i}>{p}</mark> : p)}</>
}

export default function Home() {
  // API key state
  const [apiKey, setApiKey] = useState('')
  const [keyInput, setKeyInput] = useState('')
  const [showKeyModal, setShowKeyModal] = useState(false)
  const [keyVisible, setKeyVisible] = useState(false)
  const [keyError, setKeyError] = useState('')
  const [keyValidating, setKeyValidating] = useState(false)
  const [demoMode, setDemoMode] = useState(false)

  // Search state
  const [chInput, setChInput] = useState('')
  const [kwInput, setKwInput] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sortOrder, setSortOrder] = useState('relevance')
  const [optDesc, setOptDesc] = useState(true)
  const [optTr, setOptTr] = useState(false)

  // Results state
  const [channel, setChannel] = useState(null)
  const [results, setResults] = useState([])
  const [trResults, setTrResults] = useState([])
  const [nextPage, setNextPage] = useState('')
  const [activeKw, setActiveKw] = useState('')
  const [activeChHnd, setActiveChHnd] = useState('')

  // UI state
  const [loading, setLoading] = useState(false)
  const [loadMsg, setLoadMsg] = useState('Mencari...')
  const [error, setError] = useState(null)
  const [errorApiBtn, setErrorApiBtn] = useState(false)
  const [empty, setEmpty] = useState(null)
  const [viewMode, setViewMode] = useState('list')
  const [history, setHistory] = useState([])
  const [showHist, setShowHist] = useState(false)
  const [selectedVideo, setSelectedVideo] = useState(null)
  const [toast, setToast] = useState('')

  // Init
  useEffect(() => {
    const saved = LS.get('ytk')
    if (saved) { setApiKey(saved); setShowKeyModal(false) }
    else setShowKeyModal(true)
    setHistory(LS.get('yth') || [])
  }, [])

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2500)
    return () => clearTimeout(t)
  }, [toast])

  // ── API Key ──
  async function handleSaveKey() {
    const k = keyInput.trim()
    if (!k) { setKeyError('Masukkan API key yang valid.'); return }
    setKeyValidating(true); setKeyError('')
    try {
      const res = await fetch(`/api/youtube?_ep=videos&part=snippet&id=dQw4w9WgXcQ&_key=${k}`)
      const body = await res.json()
      if (res.status === 403) {
        const reason = body?.error?.errors?.[0]?.reason
        setKeyError(reason === 'accessNotConfigured'
          ? 'YouTube Data API v3 belum diaktifkan. Buka Google Cloud Console → APIs & Services → Library → aktifkan YouTube Data API v3.'
          : `API key tidak valid (${reason || 'akses ditolak'}).`)
        return
      }
      setApiKey(k); LS.set('ytk', k)
      setShowKeyModal(false); setDemoMode(false)
      setToast('API key tersimpan ✓')
    } catch { setKeyError('Tidak bisa terhubung. Periksa koneksi internet.') }
    finally { setKeyValidating(false) }
  }

  // ── Search ──
  async function doSearch(more = false) {
    const rawCh = chInput.trim()
    const kw = kwInput.trim()
    if (!rawCh) { setError('Masukkan nama atau URL channel YouTube.'); setErrorApiBtn(false); return }
    if (!kw) { setError('Masukkan keyword yang ingin dicari.'); setErrorApiBtn(false); return }
    if (loading) return
    setLoading(true)
    setError(null); setEmpty(null)
    if (!more) { setResults([]); setTrResults([]); setNextPage('') }

    if (demoMode) {
      setLoading(false)
      setResults([{ _demo: true, kw, ch: rawCh }])
      return
    }

    const key = apiKey

    try {
      let chId = channel?.id
      let chHandle = activeChHnd

      if (!more || chHandle !== rawCh) {
        setLoadMsg('Mencari channel...')
        const ch = await resolveChannel(rawCh, key)
        setChannel(ch); chId = ch.id; chHandle = rawCh
        setActiveChHnd(rawCh)
      }

      setLoadMsg('Mencari video...')
      const sd = await searchVideos({
        channelId: chId, kw,
        from: dateFrom, to: dateTo,
        order: sortOrder,
        page: more ? nextPage : '',
        key,
      })
      setNextPage(sd.nextPageToken || '')
      const ids = (sd.items || []).map(i => i.id.videoId).filter(Boolean)

      if (!ids.length && !more) {
        setEmpty({ title: 'Tidak ada video ditemukan', desc: `Tidak ada video dari channel "${channel?.title || rawCh}" yang cocok dengan "${kw}".` })
        setLoading(false); return
      }

      setLoadMsg('Mengambil detail video...')
      let vids = ids.length ? await getVideoDetails(ids, key) : []

      if (optDesc && vids.length) {
        const k2 = kw.toLowerCase()
        const f = vids.filter(v =>
          v.snippet.title.toLowerCase().includes(k2) ||
          (v.snippet.description||'').toLowerCase().includes(k2)
        )
        if (f.length) vids = f
      }

      const newResults = more ? prev => [...prev, ...vids] : vids
      setResults(newResults)
      setActiveKw(kw)

      // Transcript
      if (optTr && !more && ids.length) {
        setLoadMsg('Mencari dalam transkrip...')
        const trHits = []
        for (const vid of ids.slice(0,8)) {
          const tr = await fetchTranscript(vid)
          if (!tr) continue
          const hits = searchTranscript(tr.segments, kw)
          if (hits.length) {
            const v = vids.find(x => x.id === vid)
            if (v) trHits.push({ video: v, hits })
          }
        }
        setTrResults(trHits)
      }

      // Save history
      if (!more) {
        const h = LS.get('yth') || []
        const f = h.filter(x => !(x.channel===rawCh && x.kw===kw))
        const item = { channel: rawCh, chTitle: channel?.title || rawCh, kw, time: Date.now() }
        f.unshift(item)
        const newH = f.slice(0,20)
        LS.set('yth', newH); setHistory(newH)
      }

    } catch (e) {
      console.error(e)
      let msg = e.message || 'Terjadi kesalahan.'
      let apiBtn = false
      if (e.status===403) { msg='API key tidak valid atau kuota habis. Pastikan YouTube Data API v3 sudah aktif di Google Cloud Console.'; apiBtn=true }
      else if (e.status===400) msg=`Permintaan tidak valid: ${e.message}`
      setError(msg); setErrorApiBtn(apiBtn)
    } finally { setLoading(false) }
  }

  function clearHistory() { LS.del('yth'); setHistory([]) }
  function loadFromHistory(item) { setChInput(item.channel); setKwInput(item.kw); setShowHist(false) }

  function timeAgo(ts) {
    const d=Date.now()-ts, m=Math.floor(d/6e4)
    if(m<60) return `${m}m lalu`
    const h=Math.floor(m/60); if(h<24) return `${h}j lalu`
    return `${Math.floor(h/24)}h lalu`
  }

  // ── Render ──
  const hasResults = results.length > 0 && !results[0]?._demo

  return (
    <div className={styles.root}>
      {/* API KEY MODAL */}
      {showKeyModal && (
        <div className={styles.overlay} onClick={e => e.target===e.currentTarget && apiKey && setShowKeyModal(false)}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>
              <KeyIcon /> API Key YouTube
            </h2>
            <p className={styles.modalDesc}>
              Masukkan YouTube Data API v3 key. Key disimpan <strong>hanya di browser kamu</strong> — tidak dikirim ke server mana pun.
            </p>
            <div className={styles.keyRow}>
              <input
                type={keyVisible ? 'text' : 'password'}
                placeholder="AIzaSy..."
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                onKeyDown={e => e.key==='Enter' && handleSaveKey()}
                className={styles.input}
                autoComplete="off"
                spellCheck={false}
              />
              <button className={styles.iconBtn} onClick={() => setKeyVisible(v=>!v)} title="Toggle visibility">
                {keyVisible ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            <div className={styles.hint}>
              <InfoIcon />
              <span>
                Gratis: buka{' '}
                <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noopener">
                  Google Cloud Console
                </a>{' '}
                → buat project → aktifkan <strong>YouTube Data API v3</strong> → Credentials → Create API Key.
                Kuota gratis ~100 pencarian/hari.
              </span>
            </div>
            {keyError && <div className={styles.keyError}>{keyError}</div>}
            <div className={styles.modalActions}>
              <button className={styles.btnSec} onClick={() => { setDemoMode(true); setShowKeyModal(false) }}>
                Mode Demo
              </button>
              <button className={styles.btnPri} onClick={handleSaveKey} disabled={keyValidating}>
                {keyValidating ? 'Memvalidasi...' : 'Simpan & Mulai'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIDEO DETAIL MODAL */}
      {selectedVideo && (
        <div className={styles.overlay} onClick={e => e.target===e.currentTarget && setSelectedVideo(null)}>
          <div className={styles.videoModal}>
            <button className={styles.closeBtn} onClick={() => setSelectedVideo(null)}><CloseIcon /></button>
            <VideoDetail video={selectedVideo} kw={activeKw} trResults={trResults} />
          </div>
        </div>
      )}

      {/* HISTORY SIDEBAR */}
      {showHist && (
        <aside className={styles.histBar} onClick={e => e.stopPropagation()}>
          <div className={styles.histHeader}>
            <h3>Riwayat</h3>
            <button className={styles.iconBtn} onClick={clearHistory} title="Hapus semua"><TrashIcon /></button>
          </div>
          {history.length === 0
            ? <p className={styles.histEmpty}>Belum ada riwayat.</p>
            : history.map((h,i) => (
              <div key={i} className={styles.histItem} onClick={() => { loadFromHistory(h); setTimeout(()=>doSearch(),100) }}>
                <div className={styles.histCh}>{h.chTitle || h.channel}</div>
                <div className={styles.histKw}>{h.kw}</div>
                <div className={styles.histTs}>{timeAgo(h.time)}</div>
              </div>
            ))
          }
        </aside>
      )}

      {/* HEADER */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.logo} onClick={() => window.scrollTo({top:0,behavior:'smooth'})}>
            <SearchIcon color="var(--acc)" /> YTChannelSearch
          </div>
          <div className={styles.headerRight}>
            {apiKey && !demoMode && <span className={styles.apiOk}>● API Aktif</span>}
            {demoMode && <span className={styles.apiNo}>● Demo</span>}
            <button className={styles.iconBtn} onClick={e => { e.stopPropagation(); setShowHist(v=>!v) }} title="Riwayat"><HistIcon /></button>
            <button className={styles.iconBtn} onClick={() => { setKeyInput(apiKey); setKeyError(''); setShowKeyModal(true) }} title="API Key"><KeyIcon /></button>
          </div>
        </div>
      </header>

      <main className={styles.main} onClick={() => setShowHist(false)}>
        {/* HERO */}
        <div className={styles.hero}>
          <h1>Cari video dalam channel YouTube</h1>
          <p>Temukan video lama sekalipun — dari judul, deskripsi, hingga transkrip</p>
        </div>

        {/* SEARCH CARD */}
        <div className={styles.searchCard}>
          {/* Channel */}
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}><YTIcon /> Channel YouTube</label>
            <div className={styles.inputWrap}>
              <input
                type="text"
                className={styles.input}
                placeholder="@handle, nama channel, atau URL YouTube"
                value={chInput}
                onChange={e => setChInput(e.target.value)}
                onKeyDown={e => e.key==='Enter' && doSearch()}
              />
              {chInput && <button className={styles.clearBtn} onClick={() => { setChInput(''); setChannel(null) }}>✕</button>}
            </div>
            {channel && (
              <div className={styles.chPreview}>
                {channel.thumb && <img src={channel.thumb} alt={channel.title} width={24} height={24} />}
                <strong>{channel.title}</strong>
                {channel.subs && <span className={styles.chSubs}>{channel.subs}</span>}
              </div>
            )}
          </div>

          {/* Keyword */}
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}><SearchIcon /> Keyword</label>
            <div className={styles.inputWrap}>
              <input
                type="text"
                className={styles.input}
                placeholder="Kata atau frasa yang ingin dicari"
                value={kwInput}
                onChange={e => setKwInput(e.target.value)}
                onKeyDown={e => e.key==='Enter' && doSearch()}
              />
              {kwInput && <button className={styles.clearBtn} onClick={() => setKwInput('')}>✕</button>}
            </div>
          </div>

          {/* Filters */}
          <div className={styles.filterGrid}>
            <div className={styles.filterItem}>
              <label className={styles.filterLabel}>Dari tanggal</label>
              <input type="date" className={styles.input} value={dateFrom} onChange={e=>setDateFrom(e.target.value)} />
            </div>
            <div className={styles.filterItem}>
              <label className={styles.filterLabel}>Sampai</label>
              <input type="date" className={styles.input} value={dateTo} onChange={e=>setDateTo(e.target.value)} />
            </div>
            <div className={styles.filterItem}>
              <label className={styles.filterLabel}>Urutkan</label>
              <select className={styles.select} value={sortOrder} onChange={e=>setSortOrder(e.target.value)}>
                <option value="relevance">Paling relevan</option>
                <option value="date">Terbaru</option>
                <option value="viewCount">Terbanyak ditonton</option>
                <option value="rating">Rating tertinggi</option>
                <option value="title">A – Z</option>
              </select>
            </div>
          </div>

          {/* Options */}
          <div className={styles.options}>
            <label className={styles.checkLabel}>
              <input type="checkbox" checked={optDesc} onChange={e=>setOptDesc(e.target.checked)} /> Saring by deskripsi
            </label>
            <label className={styles.checkLabel}>
              <input type="checkbox" checked={optTr} onChange={e=>setOptTr(e.target.checked)} /> Cari dalam transkrip
            </label>
          </div>

          <button className={styles.btnSearch} onClick={() => doSearch()} disabled={loading}>
            {loading ? <><Spinner /> {loadMsg}</> : <><SearchIcon /> Cari Video</>}
          </button>
        </div>

        {/* DEMO NOTICE */}
        {demoMode && (
          <div className={styles.demoBar}>
            <InfoIcon />
            Mode Demo aktif.{' '}
            <button className={styles.linkBtn} onClick={() => { setKeyInput(''); setKeyError(''); setShowKeyModal(true) }}>
              Tambah API key
            </button>{' '}
            untuk pencarian penuh.
          </div>
        )}

        {/* ERROR */}
        {error && !loading && (
          <div className={styles.errorState}>
            <AlertIcon />
            <div>
              <p>{error}</p>
              <div className={styles.errorActions}>
                <button className={styles.btnSec} onClick={() => doSearch()}>Coba Lagi</button>
                {errorApiBtn && (
                  <button className={styles.btnSec} onClick={() => { setKeyInput(apiKey); setKeyError(''); setShowKeyModal(true) }}>
                    Perbarui API Key
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* EMPTY */}
        {empty && !loading && (
          <div className={styles.emptyState}>
            <SearchIcon size={44} color="var(--t3)" />
            <h3>{empty.title}</h3>
            <p>{empty.desc}</p>
          </div>
        )}

        {/* DEMO RESULT */}
        {results[0]?._demo && !loading && (
          <div className={styles.demoResult}>
            <p>Mode Demo aktif. Untuk pencarian dalam channel <strong>{results[0].ch}</strong>, tambahkan API key.</p>
            <a
              href={`https://www.youtube.com/results?search_query=${encodeURIComponent(results[0].kw)}`}
              target="_blank" rel="noopener" className={styles.btnYT}
            >
              ▶ Cari di YouTube ↗
            </a>
          </div>
        )}

        {/* RESULTS */}
        {hasResults && !loading && (
          <div className={styles.results}>
            <div className={styles.resultsHeader}>
              <div className={styles.resultsMeta}>
                <span className={styles.resultsCount}>{results.length} video ditemukan</span>
                <span className={styles.resultsSrc}>YouTube Data API v3</span>
              </div>
              <div className={styles.viewToggle}>
                <button className={`${styles.iconBtn} ${viewMode==='grid'?styles.on:''}`} onClick={() => setViewMode('grid')} title="Grid">
                  <GridIcon />
                </button>
                <button className={`${styles.iconBtn} ${viewMode==='list'?styles.on:''}`} onClick={() => setViewMode('list')} title="List">
                  <ListIcon />
                </button>
              </div>
            </div>

            <div className={viewMode==='grid' ? styles.gridView : styles.listView}>
              {results.map(v => (
                <VideoCard key={v.id} video={v} kw={activeKw} onClick={() => setSelectedVideo(v)} />
              ))}
            </div>

            {nextPage && (
              <div className={styles.loadMore}>
                <button className={styles.btnLoadMore} onClick={() => doSearch(true)}>
                  Muat lebih banyak
                </button>
              </div>
            )}

            {/* TRANSCRIPT RESULTS */}
            {trResults.length > 0 && (
              <div className={styles.trSection}>
                <div className={styles.trHeader}>
                  <DocIcon />
                  <span>Hasil Transkrip</span>
                  <span className={styles.badge}>{trResults.reduce((a,r)=>a+r.hits.length,0)} hit</span>
                </div>
                {trResults.map(({ video: v, hits }) =>
                  hits.map((h,i) => (
                    <div key={`${v.id}-${i}`} className={styles.trItem}
                      onClick={() => window.open(`https://youtube.com/watch?v=${v.id}&t=${Math.floor(h.start)}s`, '_blank', 'noopener')}>
                      <div className={styles.trThumb}>
                        <img src={v.snippet.thumbnails?.default?.url || ''} alt={v.snippet.title} />
                      </div>
                      <div className={styles.trBody}>
                        <div className={styles.trTitle}>{v.snippet.title}</div>
                        <div className={styles.trText}><Highlight text={h.text} kw={activeKw} /></div>
                        <div className={styles.trTs}>
                          <a href={`https://youtube.com/watch?v=${v.id}&t=${Math.floor(h.start)}s`} target="_blank" rel="noopener" onClick={e=>e.stopPropagation()}>
                            ▶ {fmtTime(h.start)}
                          </a>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  )
}

// ── VideoCard ──
function VideoCard({ video, kw, onClick }) {
  const sn = video.snippet
  const id = video.id
  const thumb = sn.thumbnails?.medium?.url || sn.thumbnails?.default?.url || ''
  const date  = fmtDate(sn.publishedAt)
  const views = video.statistics?.viewCount ? fmtN(video.statistics.viewCount)+' tayangan' : ''
  const dur   = video.contentDetails?.duration ? parseDur(video.contentDetails.duration) : ''
  const k     = kw.toLowerCase()
  const inT   = sn.title.toLowerCase().includes(k)
  const inD   = (sn.description||'').toLowerCase().includes(k)
  const desc  = sn.description || ''

  return (
    <article className={styles.videoCard} onClick={onClick}>
      <div className={styles.cardThumb}>
        <img src={thumb} alt={sn.title} loading="lazy" />
        {dur && <span className={styles.duration}>{dur}</span>}
      </div>
      <div className={styles.cardBody}>
        {inT && <span className={styles.badge}>✓ Judul</span>}
        {!inT && inD && <span className={`${styles.badge} ${styles.badgeDesc}`}>✓ Deskripsi</span>}
        <div className={styles.cardTitle}><Highlight text={sn.title} kw={kw} /></div>
        <div className={styles.cardMeta}>
          <span>{sn.channelTitle}</span>
          {date && <><span className={styles.dot}>·</span><span>{date}</span></>}
          {views && <><span className={styles.dot}>·</span><span>{views}</span></>}
        </div>
        {inD && <p className={styles.cardSnip}><Highlight text={snip(desc, kw)} kw={kw} /></p>}
        <div className={styles.cardActions} onClick={e=>e.stopPropagation()}>
          <a className={styles.btnYT} href={`https://youtube.com/watch?v=${id}`} target="_blank" rel="noopener">
            ▶ Tonton
          </a>
        </div>
      </div>
    </article>
  )
}

// ── VideoDetail ──
function VideoDetail({ video, kw, trResults }) {
  const sn   = video.snippet
  const id   = video.id
  const thumb = sn.thumbnails?.maxres?.url || sn.thumbnails?.high?.url || sn.thumbnails?.medium?.url || ''
  const date  = fmtDate(sn.publishedAt)
  const views = video.statistics?.viewCount ? fmtN(video.statistics.viewCount)+' tayangan' : ''
  const likes = video.statistics?.likeCount ? fmtN(video.statistics.likeCount)+' suka' : ''
  const dur   = video.contentDetails?.duration ? parseDur(video.contentDetails.duration) : ''
  const desc  = sn.description || ''
  const trHit = trResults.find(r => r.video.id === id)

  function copyLink() {
    navigator.clipboard?.writeText(`https://youtube.com/watch?v=${id}`).catch(()=>{})
  }

  return (
    <div>
      <div className={styles.detailThumb}><img src={thumb} alt={sn.title} /></div>
      <h2 className={styles.detailTitle}><Highlight text={sn.title} kw={kw} /></h2>
      <div className={styles.detailMeta}>
        {date  && <span>📅 {date}</span>}
        {views && <span>👁 {views}</span>}
        {likes && <span>👍 {likes}</span>}
        {dur   && <span>⏱ {dur}</span>}
      </div>
      {desc && (
        <div className={styles.detailDesc}>
          <Highlight text={desc} kw={kw} />
        </div>
      )}
      {trHit && (
        <div className={styles.trInDetail}>
          <h4>📄 Ditemukan di transkrip</h4>
          {trHit.hits.map((h,i) => (
            <div key={i} className={styles.trHit}>
              <div className={styles.trHitTime}>
                <a href={`https://youtube.com/watch?v=${id}&t=${Math.floor(h.start)}s`} target="_blank" rel="noopener">
                  ▶ {fmtTime(h.start)}
                </a>
              </div>
              <div className={styles.trHitText}><Highlight text={h.text} kw={kw} /></div>
            </div>
          ))}
        </div>
      )}
      <div className={styles.detailActions}>
        <a className={styles.btnYT} href={`https://youtube.com/watch?v=${id}`} target="_blank" rel="noopener">▶ Tonton di YouTube</a>
        <button className={styles.btnSec} onClick={copyLink}>Salin link</button>
      </div>
    </div>
  )
}

// ── Icons ──
const SearchIcon = ({size=17, color='currentColor'}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
)
const KeyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M15 7h3a5 5 0 0 1 5 5 5 5 0 0 1-5 5h-3m-6 0H6a5 5 0 0 1-5-5 5 5 0 0 1 5-5h3"/>
    <line x1="8" y1="12" x2="16" y2="12"/>
  </svg>
)
const EyeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>
)
const EyeOffIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
)
const InfoIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{flexShrink:0}}>
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
)
const AlertIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="1.5" style={{flexShrink:0}}>
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
)
const YTIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 0 0 1.46 6.42 29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58A2.78 2.78 0 0 0 3.41 19.6C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.95A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z"/>
    <polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02"/>
  </svg>
)
const HistIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.24"/>
  </svg>
)
const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6M14 11v6M9 6V4h6v2"/>
  </svg>
)
const CloseIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)
const GridIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
    <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
  </svg>
)
const ListIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
    <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
  </svg>
)
const DocIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
  </svg>
)
const Spinner = () => <div style={{width:17,height:17,border:'2px solid rgba(255,255,255,.3)',borderTopColor:'#fff',borderRadius:'50%',animation:'spin .7s linear infinite',display:'inline-block'}} />
