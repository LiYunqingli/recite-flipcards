import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type PackageRow } from '../lib/db'
import ProgressRing from './ui/ProgressRing'
import { IconBook, IconCheck, IconRepeat, IconTarget } from './ui/icons'

interface Mini {
  total: number
  known: number
  mistake: number
}

export default function Stats() {
  const packages = useLiveQuery(() => db.packages.orderBy('importedAt').reverse().toArray())
  const cards = useLiveQuery(() => db.cards.toArray())

  const data = useMemo(() => {
    const byDeck: Record<number, Mini> = {}
    let total = 0
    let known = 0
    let mistake = 0
    let reviewed = 0
    for (const c of cards ?? []) {
      const s = (byDeck[c.packageId] ??= { total: 0, known: 0, mistake: 0 })
      s.total++
      total++
      reviewed += c.reviewed
      if (c.status === 'known') {
        s.known++
        known++
      }
      if (c.status === 'mistake') {
        s.mistake++
        mistake++
      }
    }
    return {
      packages: packages?.length ?? 0,
      total,
      known,
      mistake,
      reviewed,
      byDeck,
    }
  }, [cards, packages])

  const knownRate = data.total ? Math.round((data.known / data.total) * 100) : 0

  return (
    <div className="screen">
      <div className="section-head">
        <h2 className="screen-title">统计</h2>
        <span className="screen-sub">学习概览</span>
      </div>

      <div className="hero stats-hero">
        <div className="hero-top">
          <div>
            <div className="hero-label">累计卡片</div>
            <div className="hero-big">{data.total}</div>
            <div className="hero-delta">已掌握 {knownRate}%</div>
          </div>
          <ProgressRing
            progress={data.total ? data.known / data.total : 0}
            size={92}
            stroke={9}
            color="rgba(255,255,255,0.96)"
            track="rgba(255,255,255,0.22)"
          >
            <span className="ring-pct" style={{ color: '#fff', fontSize: 22 }}>
              {knownRate}%
            </span>
          </ProgressRing>
        </div>
      </div>

      <div className="stat-grid cols-2">
        <div className="stat">
          <div className="stat-ico">
            <IconBook />
          </div>
          <div className="stat-value tnum">{data.packages}</div>
          <div className="stat-sub">数据包</div>
        </div>
        <div className="stat">
          <div className="stat-ico" style={{ background: 'var(--success)', color: '#fff' }}>
            <IconCheck />
          </div>
          <div className="stat-value tnum">{data.known}</div>
          <div className="stat-sub">已掌握</div>
        </div>
        <div className="stat">
          <div className="stat-ico" style={{ background: 'var(--danger)', color: '#fff' }}>
            <IconRepeat />
          </div>
          <div className="stat-value tnum">{data.mistake}</div>
          <div className="stat-sub">没记住</div>
        </div>
        <div className="stat">
          <div className="stat-ico" style={{ background: 'var(--warning)', color: '#fff' }}>
            <IconTarget />
          </div>
          <div className="stat-value tnum">{data.reviewed}</div>
          <div className="stat-sub">学习次数</div>
        </div>
      </div>

      <div className="section-title">各数据包掌握度</div>
      {!packages || packages.length === 0 ? (
        <div className="card muted" style={{ textAlign: 'center' }}>
          暂无数据
        </div>
      ) : (
        <div className="deck-list plain">
          {packages.map((p: PackageRow) => {
            const s = data.byDeck[p.id!] ?? { total: 0, known: 0, mistake: 0 }
            const rate = s.total ? s.known / s.total : 0
            return (
              <div key={p.id} className="deck static">
                <span className="deck-ico">
                  <IconBook />
                </span>
                <span className="deck-main">
                  <span className="deck-title">{p.name}</span>
                  <span className="deck-sub">
                    {s.total} 题
                    {s.mistake > 0 && <span className="deck-badge"> · 没记住 {s.mistake}</span>}
                  </span>
                </span>
                <ProgressRing progress={rate} size={42} stroke={5}>
                  <span className="ring-pct" style={{ fontSize: 11 }}>
                    {Math.round(rate * 100)}%
                  </span>
                </ProgressRing>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
