import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getAllMistakes, type CardRow, type PackageRow, type StudyMode } from '../lib/db'
import Button from './ui/Button'
import Empty from './ui/Empty'
import { IconMistake, IconBook, IconActivity } from './ui/icons'

interface Props {
  onStartPractice: (pkg: PackageRow, mode: StudyMode) => void
}

export default function Mistakes({ onStartPractice }: Props) {
  const packages = useLiveQuery(() => db.packages.orderBy('importedAt').reverse().toArray())
  const mistakes = useLiveQuery(() => getAllMistakes())

  const groups = useMemo(() => {
    const pkgMap = new Map<number, PackageRow>()
    for (const p of packages ?? []) if (p.id != null) pkgMap.set(p.id, p)
    const byPkg = new Map<number, CardRow[]>()
    for (const c of mistakes ?? []) {
      const arr = byPkg.get(c.packageId) ?? []
      arr.push(c)
      byPkg.set(c.packageId, arr)
    }
    const list = [...byPkg.entries()]
      .map(([pid, cards]) => ({ pkg: pkgMap.get(pid), cards }))
      .filter((g) => g.pkg && g.cards.length > 0)
      .sort((a, b) => b.cards.length - a.cards.length)
    return list
  }, [packages, mistakes])

  const total = mistakes?.length ?? 0
  const deckCount = groups.length

  return (
    <div className="screen">
      <div className="section-head">
        <h2 className="screen-title">错题</h2>
        <span className="screen-sub">{total} 道待巩固</span>
      </div>

      {total === 0 ? (
        <Empty
          icon={<IconMistake />}
          text="还没有错题，继续每日练习吧"
        />
      ) : (
        <>
          <div className="mistake-overview">
            <div className="mistake-ov-stat">
              <b className="tnum" style={{ color: 'var(--danger)' }}>{total}</b>
              <span>错题总数</span>
            </div>
            <div className="mistake-ov-stat">
              <b className="tnum">{deckCount}</b>
              <span>涉及数据包</span>
            </div>
          </div>

          <div className="section-title">按数据包</div>
          <div className="mistake-groups">
            {groups.map((g) => (
              <div key={g.pkg!.id} className="mistake-group">
                <div className="mistake-group-head">
                  <span className="mistake-group-ico">
                    <IconBook />
                  </span>
                  <span className="mistake-group-name">{g.pkg!.name}</span>
                  <span className="mistake-group-count">{g.cards.length}</span>
                  <Button
                    variant="soft"
                    size="sm"
                    onClick={() => onStartPractice(g.pkg!, 'mistake')}
                    icon={<IconActivity />}
                  >
                    练习
                  </Button>
                </div>
                <div className="mistake-items">
                  {g.cards.slice(0, 8).map((c) => (
                    <div key={c.id} className="mistake-item">
                      <span className="mistake-dot" />
                      <span className="mistake-q">{c.question}</span>
                      {c.streak > 0 && (
                        <span className="mistake-streak">连对 {c.streak}/3</span>
                      )}
                    </div>
                  ))}
                  {g.cards.length > 8 && (
                    <div className="mistake-more muted">还有 {g.cards.length - 8} 道…</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
