import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type PackageRow } from '../lib/db'
import ProgressRing from './ui/ProgressRing'
import Empty from './ui/Empty'
import ImportButton from './ImportButton'
import { IconBook, IconChevronRight } from './ui/icons'

interface Props {
  onOpen: (p: PackageRow) => void
}

interface Mini {
  total: number
  known: number
  mistake: number
}

export default function Library({ onOpen }: Props) {
  const packages = useLiveQuery(() => db.packages.orderBy('importedAt').reverse().toArray())
  const cards = useLiveQuery(() => db.cards.toArray())

  const stats = useMemo(() => {
    const m: Record<number, Mini> = {}
    for (const c of cards ?? []) {
      const s = (m[c.packageId] ??= { total: 0, known: 0, mistake: 0 })
      s.total++
      if (c.status === 'known') s.known++
      if (c.status === 'mistake') s.mistake++
    }
    return m
  }, [cards])

  const count = packages?.length ?? 0

  return (
    <div className="screen">
      <div className="section-head">
        <h2 className="screen-title">牌库</h2>
        <span className="screen-sub">{count} 个数据包</span>
      </div>

      {!packages ? null : count === 0 ? (
        <Empty
          icon={<IconBook />}
          text="还没有数据包，先导入一个吧"
          action={<ImportButton variant="primary" label="导入数据包（.json）" />}
        />
      ) : (
        <div className="deck-list">
          {packages.map((p) => {
            const s = stats[p.id!] ?? { total: 0, known: 0, mistake: 0 }
            const rate = s.total ? s.known / s.total : 0
            return (
              <button key={p.id} className="deck" onClick={() => onOpen(p)}>
                <span className="deck-ico">
                  <IconBook />
                </span>
                <span className="deck-main">
                  <span className="deck-title">{p.name}</span>
                  <span className="deck-sub">
                    {s.total} 题 · 已掌握 {s.known}
                    {s.mistake > 0 && <span className="deck-badge"> · 没记住 {s.mistake}</span>}
                  </span>
                </span>
                <ProgressRing progress={rate} size={46} stroke={5}>
                  <span className="ring-pct" style={{ fontSize: 12 }}>
                    {Math.round(rate * 100)}%
                  </span>
                </ProgressRing>
                <IconChevronRight />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
