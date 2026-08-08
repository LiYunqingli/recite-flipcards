import Dexie, { type Table } from 'dexie'

/* =====================================================================
   翻牌背题 — 离线数据库（IndexedDB / Dexie）
   数据包（packages）与卡片（cards）分离存储；卡片携带学习状态，
   用于「顺序 / 随机 / 错题本」等模式的复习调度。
   ===================================================================== */

export interface QAItem {
  id: number
  type?: string
  question: string
  answer: string
}

/** 导入 / 导出使用的数据包结构（与 data.json 一致） */
export interface DataPackage {
  title: string
  time?: string
  data: QAItem[]
}

export type CardStatus = 'new' | 'known' | 'mistake'
export type StudyMode = 'sequential' | 'random' | 'mistake'

export interface PackageRow {
  id?: number
  name: string
  importedAt: number
  file: string
  /** 原始数据包 JSON，导出时原样返回 */
  raw: DataPackage
  total: number
  // 断点续练：保存该包的练习进度
  resumeMode?: StudyMode
  resumeQueue?: number[]
  resumePending?: number[]
  resumeAnswered?: number
}

export interface CardRow {
  id?: number
  packageId: number
  /** 在数据包中的顺序，用于「顺序 / 按数据包」模式 */
  order: number
  question: string
  answer: string
  type?: string
  status: CardStatus
  missed: number
  correct: number
  reviewed: number
  lastSeenAt?: number
}

/** 单次作答记录，用于「历史答题情况」时间线 */
export interface AttemptRow {
  id?: number
  cardId: number
  packageId: number
  known: boolean
  mode?: StudyMode
  at: number
}

class ReciteDB extends Dexie {
  packages!: Table<PackageRow, number>
  cards!: Table<CardRow, number>
  attempts!: Table<AttemptRow, number>

  constructor() {
    super('recite')
    this.version(1).stores({
      packages: '++id, name, importedAt',
      cards: '++id, packageId, status, order',
    })
    // v2 新增作答历史表；必须完整声明全部 store，否则旧表会被丢弃
    this.version(2).stores({
      packages: '++id, name, importedAt',
      cards: '++id, packageId, status, order',
      attempts: '++id, cardId, packageId, at',
    })
  }
}

export const db = new ReciteDB()

/* ---------------- 写入 ---------------- */

export async function importPackage(pkg: DataPackage, fileName: string): Promise<void> {
  await db.transaction('rw', db.packages, db.cards, async () => {
    const pid = await db.packages.add({
      name: pkg.title,
      importedAt: Date.now(),
      file: fileName,
      raw: pkg,
      total: pkg.data.length,
    })
    const cards: CardRow[] = pkg.data.map((it, i) => ({
      packageId: pid,
      order: i,
      question: it.question,
      answer: it.answer,
      type: it.type,
      status: 'new',
      missed: 0,
      correct: 0,
      reviewed: 0,
    }))
    await db.cards.bulkAdd(cards)
  })
}

/** 校验任意 JSON 是否为合法数据包；非法返回 null */
function validatePackage(j: unknown): DataPackage | null {
  if (!j || typeof j !== 'object') return null
  const o = j as Record<string, unknown>
  if (!Array.isArray(o.data)) return null
  const items: QAItem[] = (o.data as unknown[])
    .map((it, i) => {
      const it2 = (it ?? {}) as Record<string, unknown>
      return {
        id: typeof it2.id === 'number' ? it2.id : i + 1,
        type: typeof it2.type === 'string' ? it2.type : undefined,
        question: String(it2.question ?? '').trim(),
        answer: String(it2.answer ?? ''),
      }
    })
    .filter((it) => it.question.length > 0)
  if (items.length === 0) return null
  const title =
    typeof o.title === 'string' && o.title.trim()
      ? o.title.trim()
      : `未命名数据包 ${new Date().toLocaleDateString('zh-CN')}`
  return {
    title,
    time: typeof o.time === 'string' ? o.time : undefined,
    data: items,
  }
}

export interface ImportResult {
  ok: boolean
  name?: string
  error?: string
}

/** 从文件读取并导入；同名数据包会被跳过 */
export async function importPackageFile(file: File): Promise<ImportResult> {
  let text: string
  try {
    text = await file.text()
  } catch {
    return { ok: false, error: '无法读取文件' }
  }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false, error: 'JSON 解析失败，请检查文件格式' }
  }
  const pkg = validatePackage(json)
  if (!pkg) {
    return { ok: false, error: '数据包格式不正确（需含 data 数组，每项有 question / answer）' }
  }
  const exists = await db.packages.where('name').equals(pkg.title).first()
  if (exists) {
    return { ok: false, error: `已存在同名数据包：${pkg.title}` }
  }
  try {
    await importPackage(pkg, file.name)
    return { ok: true, name: pkg.title }
  } catch {
    return { ok: false, error: '写入数据库失败' }
  }
}

/* ---------------- 查询 ---------------- */

export function listPackages() {
  return db.packages.orderBy('importedAt').reverse().toArray()
}

export interface DeckStats {
  total: number
  known: number
  mistake: number
  reviewed: number
  correct: number
  missed: number
}

export async function getDeckStats(packageId: number): Promise<DeckStats> {
  const cards = await db.cards.where('packageId').equals(packageId).toArray()
  const s: DeckStats = { total: cards.length, known: 0, mistake: 0, reviewed: 0, correct: 0, missed: 0 }
  for (const c of cards) {
    if (c.status === 'known') s.known++
    if (c.status === 'mistake') s.mistake++
    s.reviewed += c.reviewed
    s.correct += c.correct
    s.missed += c.missed
  }
  return s
}

export async function getMistakeCards(packageId: number): Promise<CardRow[]> {
  const cards = await db.cards.where('packageId').equals(packageId).toArray()
  return cards.filter((c) => c.status === 'mistake')
}

export interface GlobalStats {
  packages: number
  cards: number
  known: number
  mistake: number
  reviewed: number
}

export async function getGlobalStats(): Promise<GlobalStats> {
  const [all, packages] = await Promise.all([db.cards.toArray(), db.packages.count()])
  const g: GlobalStats = { packages, cards: all.length, known: 0, mistake: 0, reviewed: 0 }
  for (const c of all) {
    if (c.status === 'known') g.known++
    if (c.status === 'mistake') g.mistake++
    g.reviewed += c.reviewed
  }
  return g
}

/* ---------------- 学习状态 ---------------- */

/** 记录一次作答：知道 -> 已掌握；不清楚 -> 错题本（没记住） */
export async function recordAnswer(cardId: number, known: boolean, mode?: StudyMode): Promise<void> {
  const card = await db.cards.get(cardId)
  await db.cards.update(cardId, (c: CardRow) => {
    c.reviewed += 1
    c.lastSeenAt = Date.now()
    if (known) {
      c.status = 'known'
      c.correct += 1
    } else {
      c.status = 'mistake'
      c.missed += 1
    }
  })
  if (card) await logAttempt(cardId, card.packageId, known, mode)
}

/** 写入一条作答历史（供预览页「历史答题情况」时间线使用） */
export async function logAttempt(
  cardId: number,
  packageId: number,
  known: boolean,
  mode?: StudyMode,
): Promise<void> {
  await db.attempts.add({ cardId, packageId, known, mode, at: Date.now() })
}

/** 取某张卡片的作答历史，按时间倒序（最新在前） */
export async function getCardAttempts(cardId: number): Promise<AttemptRow[]> {
  const items = await db.attempts.where('cardId').equals(cardId).toArray()
  return items.sort((a, b) => b.at - a.at)
}

/** 编辑卡片：修改题目 / 答案 / 类型 / 掌握状态等字段 */
export async function updateCard(cardId: number, patch: Partial<CardRow>): Promise<void> {
  await db.cards.update(cardId, patch)
}

/* ---------------- 练习进度（断点续练） ---------------- */

export interface ResumeProgress {
  mode?: StudyMode
  queue?: number[]
  pending?: number[]
  answered?: number
}

export async function getProgress(packageId: number): Promise<ResumeProgress | null> {
  const p = await db.packages.get(packageId)
  if (!p) return null
  if (!p.resumeQueue?.length && !p.resumePending?.length) return null
  return {
    mode: p.resumeMode,
    queue: p.resumeQueue ?? [],
    pending: p.resumePending ?? [],
    answered: p.resumeAnswered ?? 0,
  }
}

export async function saveProgress(
  packageId: number,
  mode: StudyMode,
  queue: number[],
  pending: number[],
  answered: number,
): Promise<void> {
  await db.packages.update(packageId, {
    resumeMode: mode,
    resumeQueue: queue,
    resumePending: pending,
    resumeAnswered: answered,
  })
}

export async function clearProgress(packageId: number): Promise<void> {
  await db.packages.update(packageId, {
    resumeQueue: [],
    resumePending: [],
    resumeAnswered: 0,
  })
}

/**
 * 作答后「撤回」：在不增加 reviewed 计数的前提下，将本题判定反向修正。
 * 从 known→mistake：correct-1、missed+1；从 mistake→known：missed-1、correct+1。
 * 仅用于用户在本题翻面后即时纠正自己的选择，不重复计入复习次数。
 */
export async function flipCardStatus(cardId: number, known: boolean): Promise<void> {
  await db.cards.update(cardId, (c: CardRow) => {
    c.lastSeenAt = Date.now()
    if (known) {
      c.status = 'known'
      c.correct += 1
      if (c.missed > 0) c.missed -= 1
    } else {
      c.status = 'mistake'
      c.missed += 1
      if (c.correct > 0) c.correct -= 1
    }
  })
}

/* ---------------- 导出 / 删除 ---------------- */

export async function exportPackageRaw(
  packageId: number,
): Promise<{ name: string; raw: DataPackage } | null> {
  const pkg = await db.packages.get(packageId)
  if (!pkg) return null
  return { name: pkg.name, raw: pkg.raw }
}

export async function deletePackage(packageId: number): Promise<void> {
  await db.transaction('rw', db.packages, db.cards, async () => {
    await db.cards.where('packageId').equals(packageId).delete()
    await db.packages.delete(packageId)
  })
}

export async function clearAll(): Promise<void> {
  await db.transaction('rw', db.packages, db.cards, async () => {
    await db.cards.clear()
    await db.packages.clear()
  })
}

/* ---------------- 首次启动播种示例数据包 ---------------- */

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

async function seedIfEmpty(seed: DataPackage): Promise<boolean> {
  const count = await db.packages.count()
  if (count > 0) return false
  const exists = await db.packages.where('name').equals(seed.title).first()
  if (exists) return false
  await importPackage(seed, 'data.json')
  return true
}

let seedPromise: Promise<boolean> | null = null
/** 幂等播种：多次调用只执行一次（兼容 StrictMode 双调用） */
export function ensureSeed(seed: DataPackage): Promise<boolean> {
  if (!seedPromise) seedPromise = seedIfEmpty(seed)
  return seedPromise
}

export { shuffle }
