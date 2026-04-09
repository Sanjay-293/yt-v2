import { useState, useEffect } from 'react'

const SENTIMENT_COLORS = {
  positive: { bg: '#F0FFF6', border: '#22C55E', text: '#166534', label: 'Positive', emoji: '😊' },
  neutral:  { bg: '#FFFBEB', border: '#F59E0B', text: '#92400E', label: 'Neutral',  emoji: '😐' },
  negative: { bg: '#FFF0F0', border: '#FF4444', text: '#991B1B', label: 'Negative', emoji: '😠' },
}

async function apiPost(path, body) {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!r.ok) {
    const e = await r.json().catch(() => ({}))
    throw new Error(e.detail || 'Request failed')
  }
  return r.json()
}

async function apiGet(path) {
  const r = await fetch(path)
  if (!r.ok) {
    const e = await r.json().catch(() => ({}))
    throw new Error(e.detail || 'Request failed')
  }
  return r.json()
}

function Badge({ sentiment }) {
  const c = SENTIMENT_COLORS[sentiment] || SENTIMENT_COLORS.neutral
  return (
    <span style={{
      background: c.bg, border: `1px solid ${c.border}`, color: c.text,
      borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 500,
      display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap'
    }}>
      {c.emoji} {c.label}
    </span>
  )
}

function ScoreBar({ score, sentiment }) {
  const c = SENTIMENT_COLORS[sentiment] || SENTIMENT_COLORS.neutral
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
      <div style={{ flex: 1, height: 5, background: '#E5E7EB', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ width: `${Math.round((score || 0) * 100)}%`, height: '100%', background: c.border, borderRadius: 10 }} />
      </div>
      <span style={{ fontSize: 11, color: '#9CA3AF', minWidth: 32 }}>{Math.round((score || 0) * 100)}%</span>
    </div>
  )
}

function Accordion({ icon, label, text }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ background: '#FAFAFA', border: '1px solid #E5E7EB', borderRadius: 10, padding: '10px 14px', cursor: 'pointer' }}
      onClick={() => setOpen(!open)}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: '#6B7280' }}>{icon} {label}</span>
        <span style={{ fontSize: 11, color: '#9CA3AF' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && <p style={{ marginTop: 8, fontSize: 13, color: '#374151', lineHeight: 1.6 }}>{text}</p>}
    </div>
  )
}

function CommentCard({ result, index }) {
  const c = SENTIMENT_COLORS[result.sentiment] || SENTIMENT_COLORS.neutral
  return (
    <div style={{
      background: '#FFF', border: `1px solid ${c.border}`, borderRadius: 16,
      padding: '18px 20px', marginBottom: 14,
      animation: `fadeUp 0.35s ease ${index * 0.04}s both`
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {result.author && (
            <div style={{ fontSize: 12, fontWeight: 500, color: '#6366F1', marginBottom: 4 }}>
              @{result.author}
            </div>
          )}
          <p style={{ fontSize: 14, lineHeight: 1.65, color: '#1F2937', wordBreak: 'break-word' }}>
            "{result.comment || result.original_text}"
          </p>
          {(result.likes > 0 || result.reply_count > 0) && (
            <div style={{ display: 'flex', gap: 12, marginTop: 5 }}>
              {result.likes > 0 && <span style={{ fontSize: 11, color: '#9CA3AF' }}>👍 {result.likes}</span>}
              {result.reply_count > 0 && <span style={{ fontSize: 11, color: '#9CA3AF' }}>💬 {result.reply_count} replies</span>}
            </div>
          )}
        </div>
        <Badge sentiment={result.sentiment} />
      </div>
      <ScoreBar score={result.score} sentiment={result.sentiment} />
      {result.topics?.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {result.topics.map(t => (
            <span key={t} style={{ background: '#F3F4F6', color: '#6B7280', fontSize: 11, padding: '3px 9px', borderRadius: 20 }}>{t}</span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
        <Accordion icon="💬" label="Reply suggestion"    text={result.reply_suggestion} />
        <Accordion icon="🎬" label="Content improvement" text={result.content_improvement} />
        <Accordion icon="🤝" label="Engagement tip"      text={result.engagement_tip} />
      </div>
    </div>
  )
}

function SummaryBar({ results }) {
  const counts = results.reduce((acc, r) => {
    acc[r.sentiment] = (acc[r.sentiment] || 0) + 1
    return acc
  }, {})
  const total = results.length
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
      {['positive', 'neutral', 'negative'].map(s => {
        const count = counts[s] || 0
        const c = SENTIMENT_COLORS[s]
        return (
          <div key={s} style={{
            background: c.bg, border: `1px solid ${c.border}`,
            borderRadius: 12, padding: '12px 20px', flex: 1, minWidth: 100
          }}>
            <div style={{ fontSize: 26, fontWeight: 600, color: c.text }}>{count}</div>
            <div style={{ fontSize: 12, color: c.text, opacity: 0.8 }}>
              {c.label} {total > 0 ? `(${Math.round(count / total * 100)}%)` : ''}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function VideoCard({ info }) {
  const fmt = n => n ? Number(n).toLocaleString() : '–'
  return (
    <div style={{
      background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 14,
      padding: 16, marginBottom: 20, display: 'flex', gap: 14, alignItems: 'flex-start'
    }}>
      {info.thumbnail && (
        <img src={info.thumbnail} alt="" style={{ width: 110, borderRadius: 8, flexShrink: 0 }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontWeight: 500, fontSize: 14, lineHeight: 1.4, marginBottom: 4, color: '#1F2937' }}>{info.title}</p>
        <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>{info.channel}</p>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: '#374151' }}>👁 {fmt(info.view_count)}</span>
          <span style={{ fontSize: 12, color: '#374151' }}>👍 {fmt(info.like_count)}</span>
          <span style={{ fontSize: 12, color: '#374151' }}>💬 {fmt(info.comment_count)}</span>
        </div>
      </div>
    </div>
  )
}

function ExportPanel({ sessionId }) {
  const [status, setStatus] = useState('')
  const [url, setUrl]       = useState('')
  const [loading, setLoad]  = useState(false)

  const handleExport = async (format) => {
    setLoad(true); setStatus(''); setUrl('')
    try {
      const data = await apiPost('/api/export', { session_id: sessionId, format })
      setUrl(data.url)
      setStatus(`Uploaded to Cloud Storage as .${format}`)
    } catch (e) {
      setStatus('Export failed: ' + e.message)
    }
    setLoad(false)
  }

  return (
    <div style={{
      background: '#F8F9FF', border: '1px solid #C7D2FE',
      borderRadius: 12, padding: '14px 16px', marginBottom: 20
    }}>
      <p style={{ fontSize: 13, fontWeight: 500, color: '#3730A3', marginBottom: 10 }}>
        ☁️ Export to Cloud Storage
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" onClick={() => handleExport('json')} disabled={loading}
          style={{ fontSize: 12, padding: '7px 16px', background: '#4F46E5', color: '#FFF', borderRadius: 8 }}>
          Export JSON
        </button>
        <button className="btn" onClick={() => handleExport('csv')} disabled={loading}
          style={{ fontSize: 12, padding: '7px 16px', background: '#0891B2', color: '#FFF', borderRadius: 8 }}>
          Export CSV
        </button>
      </div>
      {loading && <p style={{ fontSize: 12, color: '#6366F1', marginTop: 8 }}>Uploading…</p>}
      {status  && <p style={{ fontSize: 12, color: '#3730A3', marginTop: 8 }}>{status}</p>}
      {url     && <a href={url} target="_blank" rel="noreferrer"
        style={{ fontSize: 12, color: '#4F46E5', display: 'block', marginTop: 4, wordBreak: 'break-all' }}>
        🔗 {url}
      </a>}
    </div>
  )
}

function HistoryPanel({ onSelect }) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    apiGet('/api/history?limit=10')
      .then(d => setSessions(d.sessions || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p style={{ fontSize: 13, color: '#9CA3AF', padding: '20px 0' }}>Loading history…</p>
  if (!sessions.length) return <p style={{ fontSize: 13, color: '#9CA3AF', padding: '20px 0' }}>No past analyses yet.</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {sessions.map(s => {
        const pos = s.counts?.positive || 0
        const neg = s.counts?.negative || 0
        return (
          <div key={s.session_id} onClick={() => onSelect(s.session_id)}
            style={{
              background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 12,
              padding: '12px 16px', cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'center'
            }}>
            {s.thumbnail && <img src={s.thumbnail} alt="" style={{ width: 64, borderRadius: 6, flexShrink: 0 }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 500, color: '#1F2937', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.video_title}
              </p>
              <p style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 6 }}>
                {s.channel} · {new Date(s.created_at).toLocaleDateString()}
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ fontSize: 11, color: '#166534', background: '#F0FFF6', borderRadius: 20, padding: '1px 8px' }}>😊 {pos}</span>
                <span style={{ fontSize: 11, color: '#991B1B', background: '#FFF0F0', borderRadius: 20, padding: '1px 8px' }}>😠 {neg}</span>
                <span style={{ fontSize: 11, color: '#6B7280' }}>{s.total} total</span>
              </div>
            </div>
            <span style={{ fontSize: 18, color: '#9CA3AF' }}>›</span>
          </div>
        )
      })}
    </div>
  )
}

export default function App() {
  const [tab,       setTab]     = useState('analyze')
  const [ytUrl,     setYtUrl]   = useState('')
  const [maxC,      setMaxC]    = useState(20)
  const [loading,   setLoading] = useState(false)
  const [loadMsg,   setLoadMsg] = useState('')
  const [error,     setError]   = useState('')
  const [videoInfo, setVideo]   = useState(null)
  const [results,   setResults] = useState([])
  const [sessionId, setSession] = useState(null)
  const [filter,    setFilter]  = useState('all')

  const handleAnalyze = async () => {
    setError(''); setResults([]); setVideo(null); setSession(null); setFilter('all')
    if (!ytUrl.trim()) { setError('Please enter a YouTube URL.'); return }
    setLoading(true)
    setLoadMsg('Fetching video info & comments…')
    try {
      setLoadMsg('Fetching comments from YouTube…')
      const data = await apiPost('/api/analyze', { youtube_url: ytUrl, max_comments: maxC })
      setVideo(data.video_info)
      setResults(data.results)
      setSession(data.session_id)
    } catch (e) {
      setError(e.message)
    }
    setLoading(false); setLoadMsg('')
  }

  const handleHistorySelect = async (sid) => {
    setTab('analyze'); setError(''); setResults([]); setVideo(null); setSession(null); setFilter('all')
    setLoading(true); setLoadMsg('Loading session…')
    try {
      const data = await apiGet(`/api/session/${sid}`)
      setVideo(data.video_info)
      setResults(data.results)
      setSession(data.session_id)
    } catch (e) {
      setError(e.message)
    }
    setLoading(false); setLoadMsg('')
  }

  const filtered = filter === 'all' ? results : results.filter(r => r.sentiment === filter)

  return (
    <div style={{ maxWidth: 780, margin: '0 auto', padding: '36px 20px 80px' }}>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(14px) } to { opacity:1; transform:translateY(0) } }
        @keyframes spin   { to { transform:rotate(360deg) } }
        input:focus, select:focus { outline:none; border-color:#6366F1 !important }
        .btn { cursor:pointer; border:none; font-family:'DM Sans',sans-serif; font-weight:500; border-radius:10px; transition:all 0.15s }
        .btn:hover:not(:disabled) { opacity:0.88; transform:translateY(-1px) }
        .btn:active:not(:disabled) { transform:scale(0.97) }
        .btn:disabled { cursor:not-allowed; opacity:0.6 }
        .filter-btn { cursor:pointer; font-size:13px; padding:6px 16px; border-radius:20px; border:1px solid #E5E7EB; background:white; font-family:'DM Sans',sans-serif; transition:all 0.15s }
        .filter-btn.active { background:#1F2937; color:white; border-color:#1F2937 }
        .tab { cursor:pointer; padding:8px 20px; font-size:14px; font-family:'DM Sans',sans-serif; border:none; background:none; border-bottom:2px solid transparent; color:#6B7280; transition:all 0.15s }
        .tab.active { color:#FF4444; border-bottom-color:#FF4444; font-weight:500 }
        .spinner { width:15px; height:15px; border:2px solid rgba(255,255,255,0.4); border-top-color:white; border-radius:50%; animation:spin 0.7s linear infinite; display:inline-block; vertical-align:middle; margin-right:8px }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 28, animation: 'fadeUp 0.5s ease both' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
          <div style={{ width: 38, height: 38, background: '#FF4444', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path d="M21.593 7.203a2.506 2.506 0 0 0-1.762-1.766C18.265 5.007 12 5 12 5s-6.264-.007-7.831.404a2.56 2.56 0 0 0-1.766 1.778c-.413 1.566-.417 4.814-.417 4.814s-.004 3.264.406 4.814c.23.857.905 1.534 1.762 1.766 1.582.43 7.83.437 7.83.437s6.265.007 7.831-.403a2.515 2.515 0 0 0 1.767-1.763c.414-1.565.417-4.812.417-4.812s.02-3.265-.407-4.831zM9.996 15.005l.005-6 5.207 3.005-5.212 2.995z"/>
            </svg>
          </div>
          <h1 style={{ fontSize: 26, letterSpacing: '-0.5px' }}>YT Sentiment Analyzer</h1>
          <span style={{ fontSize: 11, background: '#EEF2FF', color: '#4F46E5', padding: '3px 8px', borderRadius: 6, fontWeight: 500 }}>
            Gemini · Firestore · BigQuery · GCS
          </span>
        </div>
        <p style={{ color: '#6B7280', fontSize: 14, lineHeight: 1.6 }}>
          Paste a YouTube link → fetch comments → analyze with Gemini AI → auto-save to Firestore & BigQuery → export reports to Cloud Storage.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: '1px solid #E5E7EB', marginBottom: 24, display: 'flex' }}>
        <button className={`tab ${tab === 'analyze' ? 'active' : ''}`} onClick={() => setTab('analyze')}>▶ Analyze</button>
        <button className={`tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>🕘 History</button>
      </div>

      {/* History Tab */}
      {tab === 'history' && <HistoryPanel onSelect={handleHistorySelect} />}

      {/* Analyze Tab */}
      {tab === 'analyze' && (
        <>
          <div style={{
            background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 16,
            padding: '22px', marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            animation: 'fadeUp 0.5s ease 0.05s both'
          }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 6 }}>
              YouTube Video URL
            </label>
            <div style={{ position: 'relative', marginBottom: 18 }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}>🔗</span>
              <input
                value={ytUrl}
                onChange={e => setYtUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
                placeholder="https://www.youtube.com/watch?v=..."
                style={{
                  width: '100%', padding: '10px 12px 10px 36px',
                  border: '1.5px solid #E5E7EB', borderRadius: 10,
                  fontSize: 13, fontFamily: 'DM Sans, sans-serif',
                  background: '#FAFAFA', color: '#1F2937'
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>Comments to fetch:</label>
              <select value={maxC} onChange={e => setMaxC(Number(e.target.value))}
                style={{
                  border: '1.5px solid #E5E7EB', borderRadius: 8, padding: '7px 10px',
                  fontSize: 13, fontFamily: 'DM Sans, sans-serif',
                  background: '#FAFAFA', color: '#1F2937', cursor: 'pointer'
                }}>
                {[10, 20, 30, 50].map(n => <option key={n} value={n}>{n} most relevant</option>)}
              </select>
            </div>

            {error && (
              <div style={{
                background: '#FFF0F0', border: '1px solid #FCA5A5',
                borderRadius: 10, padding: '10px 14px', marginBottom: 14,
                fontSize: 13, color: '#991B1B', lineHeight: 1.5
              }}>
                ⚠️ {error}
              </div>
            )}

            <button className="btn" onClick={handleAnalyze} disabled={loading}
              style={{
                width: '100%', padding: '13px',
                background: loading ? '#9CA3AF' : '#FF4444',
                color: '#FFF', fontSize: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
              {loading
                ? <><span className="spinner" />{loadMsg || 'Working…'}</>
                : '▶  Fetch & Analyze Comments'}
            </button>

            <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 10, textAlign: 'center' }}>
              Results auto-saved to Firestore & BigQuery · API keys secured in Secret Manager
            </p>
          </div>

          {videoInfo && <VideoCard info={videoInfo} />}
          {sessionId && <ExportPanel sessionId={sessionId} />}

          {results.length > 0 && (
            <div style={{ animation: 'fadeUp 0.4s ease both' }}>
              <SummaryBar results={results} />
              <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
                {['all', 'positive', 'neutral', 'negative'].map(f => (
                  <button key={f}
                    className={`filter-btn ${filter === f ? 'active' : ''}`}
                    onClick={() => setFilter(f)}>
                    {f === 'all'
                      ? `All (${results.length})`
                      : `${SENTIMENT_COLORS[f].emoji} ${f[0].toUpperCase() + f.slice(1)} (${results.filter(r => r.sentiment === f).length})`}
                  </button>
                ))}
              </div>
              {filtered.length === 0 && (
                <p style={{ color: '#9CA3AF', fontSize: 14, textAlign: 'center', padding: '20px 0' }}>
                  No {filter} comments.
                </p>
              )}
              {filtered.map((r, i) => <CommentCard key={i} result={r} index={i} />)}
            </div>
          )}
        </>
      )}
    </div>
  )
}
