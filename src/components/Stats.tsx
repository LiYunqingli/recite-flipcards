import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { db, getGlobalStats, type PackageRow, type AttemptRow } from '../lib/db'
import { useTheme } from '../lib/theme'
import ProgressRing from './ui/ProgressRing'
import Empty from './ui/Empty'
import { IconBook, IconCheck, IconRepeat, IconTarget, IconMistake, IconTrendUp, IconActivity, IconChart } from './ui/icons'

interface Mini {
  total: number
  known: number
  mistake: number
  learning: number
}

export default function Stats() {
  const { palette } = useTheme()
  const packages = useLiveQuery(() => db.packages.orderBy('importedAt').reverse().toArray())
  const cards = useLiveQuery(() => db.cards.toArray())
  const attempts = useLiveQuery(() => db.attempts.orderBy('at').toArray())

  const global = useLiveQuery(() => getGlobalStats())

  const byDeck = useMemo(() => {
    const m: Record<number, Mini> = {}
    for (const c of cards ?? []) {
      const s = (m[c.packageId] ??= { total: 0, known: 0, mistake: 0, learning: 0 })
      s.total++
      if (c.status === 'known') s.known++
      else if (c.status === 'mistake') s.mistake++
      else s.learning++
    }
    return m
  }, [cards])

  const knownRate = global && global.cards ? Math.round((global.known / global.cards) * 100) : 0

  // 艾宾浩斯遗忘曲线（经典留存率数据点）
  const ebData = useMemo(
    () => [
      { t: '20分钟', r: 58 },
      { t: '1小时', r: 44 },
      { t: '9小时', r: 36 },
      { t: '1天', r: 33 },
      { t: '2天', r: 28 },
      { t: '6天', r: 25 },
      { t: '31天', r: 21 },
    ],
    [],
  )

  // 实际作答情况：最近 14 天，每天 答对 / 答错 次数
  const actualData = useMemo(() => {
    const list: AttemptRow[] = attempts ?? []
    const days: { key: string; known: number; unknown: number }[] = []
    const map = new Map<string, { known: number; unknown: number }>()
    const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`
    for (let i = 13; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = fmt(d)
      map.set(key, { known: 0, unknown: 0 })
      days.push({ key, known: 0, unknown: 0 })
    }
    for (const a of list) {
      const key = fmt(new Date(a.at))
      const cell = map.get(key)
      if (cell) {
        if (a.known) cell.known++
        else cell.unknown++
      }
    }
    return days.map((d) => ({ ...d, ...map.get(d.key)! }))
  }, [attempts])

  // 近 14 天整体正确率
  const recentRate = useMemo(() => {
    let k = 0
    let u = 0
    for (const d of actualData) {
      k += d.known
      u += d.unknown
    }
    const tot = k + u
    return tot ? Math.round((k / tot) * 100) : 0
  }, [actualData])

  const noData = !global || global.cards === 0

  return (
    <div className="screen">
      <div className="section-head">
        <h2 className="screen-title">统计</h2>
        <span className="screen-sub">学习概览</span>
      </div>

      {noData ? (
        <Empty icon={<IconChart />} text="还没有学习数据，先去牌库练习吧" />
      ) : (
        <>
          <div className="hero stats-hero">
            <div className="hero-top">
              <div>
                <div className="hero-label">累计卡片</div>
                <div className="hero-big">{global!.cards}</div>
                <div className="hero-delta">已掌握 {knownRate}%</div>
              </div>
              <ProgressRing
                progress={global!.cards ? global!.known / global!.cards : 0}
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
              <div className="stat-ico" style={{ background: 'var(--success)', color: '#fff' }}>
                <IconCheck />
              </div>
              <div className="stat-value tnum">{global!.known}</div>
              <div className="stat-sub">已掌握</div>
            </div>
            <div className="stat">
              <div className="stat-ico" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                <IconTarget />
              </div>
              <div className="stat-value tnum">{global!.learning}</div>
              <div className="stat-sub">学习中</div>
            </div>
            <div className="stat">
              <div className="stat-ico" style={{ background: 'var(--danger)', color: '#fff' }}>
                <IconMistake />
              </div>
              <div className="stat-value tnum">{global!.mistake}</div>
              <div className="stat-sub">没记住</div>
            </div>
            <div className="stat">
              <div className="stat-ico" style={{ background: 'var(--warning)', color: '#fff' }}>
                <IconRepeat />
              </div>
              <div className="stat-value tnum">{global!.reviewed}</div>
              <div className="stat-sub">累计练习</div>
            </div>
          </div>

          {/* 艾宾浩斯遗忘曲线 */}
          <div className="chart-card">
            <div className="chart-card-head">
              <span className="chart-card-ico">
                <IconTrendUp />
              </span>
              <span className="chart-card-title">艾宾浩斯遗忘曲线</span>
            </div>
            <p className="chart-card-sub">记忆随时间自然衰减；到期复习可把留存率重新拉回高位。</p>
            <div className="chart-wrap" style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={ebData} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ebGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={palette.trend} stopOpacity={0.32} />
                      <stop offset="100%" stopColor={palette.trend} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="t" tick={{ fontSize: 11 }} interval={0} angle={-18} textAnchor="end" height={42} />
                  <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
                  <Tooltip
                    formatter={(value) => [`${value}%`, '记忆留存']}
                    labelFormatter={(l) => `第 ${l}`}
                    contentStyle={{ borderRadius: 10, border: 'none' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="r"
                    stroke={palette.trend}
                    strokeWidth={2.4}
                    fill="url(#ebGrad)"
                    dot={{ r: 2.5, fill: palette.trend }}
                    name="记忆留存"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 实际作答情况 */}
          <div className="chart-card">
            <div className="chart-card-head">
              <span className="chart-card-ico" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                <IconActivity />
              </span>
              <span className="chart-card-title">实际作答情况</span>
              <span className="chart-card-rate">近14天正确率 {recentRate}%</span>
            </div>
            <div className="chart-wrap" style={{ height: 210 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={actualData} margin={{ top: 8, right: 8, left: -22, bottom: 0 }} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="key" tick={{ fontSize: 10 }} interval={1} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    formatter={(value, name) => [value as number, name as string]}
                    labelFormatter={(l) => l}
                    contentStyle={{ borderRadius: 10, border: 'none' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="known" name="答对" stackId="a" fill={palette.noon} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="unknown" name="答错" stackId="a" fill={palette.evening} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 各数据包掌握度 */}
          <div className="section-title">各数据包掌握度</div>
          {!packages || packages.length === 0 ? (
            <div className="card muted" style={{ textAlign: 'center' }}>
              暂无数据
            </div>
          ) : (
            <div className="deck-list plain">
              {packages.map((p: PackageRow) => {
                const s = byDeck[p.id!] ?? { total: 0, known: 0, mistake: 0, learning: 0 }
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
                        {s.learning > 0 && <span className="deck-badge" style={{ color: 'var(--accent)' }}> · 学习 {s.learning}</span>}
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
        </>
      )}
    </div>
  )
}
