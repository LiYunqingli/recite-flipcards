import Dexie, { type Table } from 'dexie'

/* =====================================================================
   翻牌背题 — 离线数据库（IndexedDB / Dexie）
   ---------------------------------------------------------------------
   改造升级后数据模型：
   · 数据包（packages）携带「每日练习计划」plan { old, new }；
   · 卡片（cards）携带学习状态与艾宾浩斯调度字段
     （streak 连续答对、box 记忆层级、dueAt 下次复习时间、interval 间隔天数）；
   · 「知道」需连续答对 3 次才标记为已掌握（known），
     期间任意一次「不清楚」即清空 streak 并随机重练；
   · 每日练习 = 旧题（最近两日易错优先 + 艾宾浩斯到期卡片） + 新题，最后随机打乱；
   · attempts 表保留每次作答，供统计页「实际作答情况」图表使用。
   ===================================================================== */

export interface QAItem {
  id: number
  type?: string
  question: string
  answer: string
  /** 导出时写入的卡片学习进度（导入时恢复） */
  progress?: CardProgress
}

/** 单卡学习进度（随数据包导出 / 导入） */
export interface CardProgress {
  status?: CardStatus
  streak?: number
  box?: number
  missed?: number
  correct?: number
  reviewed?: number
  lastSeenAt?: number
  dueAt?: number
  interval?: number
}

/** 导入 / 导出使用的数据包结构（在 data.json 基础上扩展进度与计划字段） */
export interface DataPackage {
  title: string
  time?: string
  data: QAItem[]
  /** 该包的每日练习计划（导出时写入，导入时恢复） */
  plan?: PackagePlan
  exportedAt?: number
}

export type CardStatus = 'new' | 'known' | 'mistake'
/** 改造后仅保留两种练习入口：每日计划练习、错题本练习 */
export type StudyMode = 'plan' | 'mistake'

/** 每日练习计划：每日 X 道旧题 + Y 道新题 */
export interface PackagePlan {
  old: number
  new: number
}

export interface PackageRow {
  id?: number
  name: string
  importedAt: number
  file: string
  /** 原始数据包 JSON，导出时作为基础再补充进度与计划字段 */
  raw: DataPackage
  total: number
  /** 每日练习计划（首次练习前由用户设置） */
  plan?: PackagePlan
  planSetAt?: number
  // 断点续练：保存该包的练习进度
  resumeMode?: StudyMode
  resumeQueue?: number[]
  resumePending?: number[]
  resumeAnswered?: number
}

export interface CardRow {
  id?: number
  packageId: number
  /** 在数据包中的顺序，用于「新题」按序取出 */
  order: number
  question: string
  answer: string
  type?: string
  status: CardStatus
  /** 连续答对次数；达到 KNOWN_STREAK(3) 才标记为 known */
  streak: number
  /** 艾宾浩斯记忆层级（决定下次复习间隔） */
  box: number
  /** 累计错误 / 正确 / 复习次数 */
  missed: number
  correct: number
  reviewed: number
  /** 下次应复习的时间戳（<= now 即到期） */
  dueAt: number
  /** 当前复习间隔（天） */
  interval: number
  lastSeenAt?: number
}

/** 单次作答记录，用于「历史答题情况」与「实际作答情况」图表 */
export interface AttemptRow {
  id?: number
  cardId: number
  packageId: number
  known: boolean
  mode?: StudyMode
  at: number
}

/* ---------------- 艾宾浩斯间隔与常量 ---------------- */

/** 连续答对达到该次数即标记为「已掌握」 */
export const KNOWN_STREAK = 3

/** 一天毫秒数 */
export const DAY = 24 * 60 * 60 * 1000

/**
 * 艾宾浩斯复习间隔（天）。索引即记忆层级 box：
 * 第 1 次掌握后 1 天复习，第 2 次 2 天，随后 4 / 7 / 15 / 30 / 60 / 120 / 240 天。
 * 间隔随层级指数增长，对应「遗忘曲线」的对抗节奏。
 */
export const EB_INTERVALS = [1, 2, 4, 7, 15, 30, 60, 120, 240]

/** 最大记忆层级（封顶 240 天间隔） */
export const EB_MAX_BOX = EB_INTERVALS.length - 1

/** 给定记忆层级返回复习间隔（天） */
export function nextInterval(box: number): number {
  const idx = Math.max(0, Math.min(box, EB_MAX_BOX))
  return EB_INTERVALS[idx]
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
    // v2 新增作答历史表
    this.version(2).stores({
      packages: '++id, name, importedAt',
      cards: '++id, packageId, status, order',
      attempts: '++id, cardId, packageId, at',
    })
    // v3 给卡片增加 dueAt 索引（艾宾浩斯到期查询）
    this.version(3).stores({
      packages: '++id, name, importedAt',
      cards: '++id, packageId, status, order, dueAt',
      attempts: '++id, cardId, packageId, at',
    })
  }
}

export const db = new ReciteDB()

/* ---------------- 小工具 ---------------- */

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/* ---------------- 写入 ---------------- */

export async function importPackage(pkg: DataPackage, fileName: string): Promise<void> {
  await db.transaction('rw', db.packages, db.cards, async () => {
    const pid = await db.packages.add({
      name: pkg.title,
      importedAt: Date.now(),
      file: fileName,
      raw: pkg,
      total: pkg.data.length,
      plan: pkg.plan,
      planSetAt: pkg.plan ? Date.now() : undefined,
    })
    const cards: CardRow[] = pkg.data.map((it, i) => {
      const p = it.progress
      return {
        packageId: pid,
        order: i,
        question: it.question,
        answer: it.answer,
        type: it.type,
        status: p?.status ?? 'new',
        streak: p?.streak ?? 0,
        box: p?.box ?? 0,
        missed: p?.missed ?? 0,
        correct: p?.correct ?? 0,
        reviewed: p?.reviewed ?? 0,
        dueAt: p?.dueAt ?? 0,
        interval: p?.interval ?? 0,
        lastSeenAt: p?.lastSeenAt,
      }
    })
    await db.cards.bulkAdd(cards)
  })
}

/** 校验任意 JSON 是否为合法数据包；非法返回 null（兼容含 progress/plan 的新格式与不含的旧格式） */
function validatePackage(j: unknown): DataPackage | null {
  if (!j || typeof j !== 'object') return null
  const o = j as Record<string, unknown>
  if (!Array.isArray(o.data)) return null
  const items: QAItem[] = (o.data as unknown[])
    .map((it, i) => {
      const it2 = (it ?? {}) as Record<string, unknown>
      const prog = (it2.progress ?? null) as CardProgress | null
      return {
        id: typeof it2.id === 'number' ? it2.id : i + 1,
        type: typeof it2.type === 'string' ? it2.type : undefined,
        question: String(it2.question ?? '').trim(),
        answer: String(it2.answer ?? ''),
        progress:
          prog && typeof prog === 'object'
            ? {
                status: prog.status,
                streak: typeof prog.streak === 'number' ? prog.streak : undefined,
                box: typeof prog.box === 'number' ? prog.box : undefined,
                missed: typeof prog.missed === 'number' ? prog.missed : undefined,
                correct: typeof prog.correct === 'number' ? prog.correct : undefined,
                reviewed: typeof prog.reviewed === 'number' ? prog.reviewed : undefined,
                lastSeenAt: typeof prog.lastSeenAt === 'number' ? prog.lastSeenAt : undefined,
                dueAt: typeof prog.dueAt === 'number' ? prog.dueAt : undefined,
                interval: typeof prog.interval === 'number' ? prog.interval : undefined,
              }
            : undefined,
      }
    })
    .filter((it) => it.question.length > 0)
  if (items.length === 0) return null
  const title =
    typeof o.title === 'string' && o.title.trim()
      ? o.title.trim()
      : `未命名数据包 ${new Date().toLocaleDateString('zh-CN')}`
  const planRaw = (o.plan ?? null) as PackagePlan | null
  const plan: PackagePlan | undefined =
    planRaw && typeof planRaw.old === 'number' && typeof planRaw.new === 'number'
      ? { old: planRaw.old, new: planRaw.new }
      : undefined
  return {
    title,
    time: typeof o.time === 'string' ? o.time : undefined,
    data: items,
    plan,
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
  learning: number
  reviewed: number
  correct: number
  missed: number
}

export async function getDeckStats(packageId: number): Promise<DeckStats> {
  const cards = await db.cards.where('packageId').equals(packageId).toArray()
  const s: DeckStats = {
    total: cards.length,
    known: 0,
    mistake: 0,
    learning: 0,
    reviewed: 0,
    correct: 0,
    missed: 0,
  }
  for (const c of cards) {
    if (c.status === 'known') s.known++
    else if (c.status === 'mistake') s.mistake++
    else s.learning++
    s.reviewed += c.reviewed
    s.correct += c.correct
    s.missed += c.missed
  }
  return s
}

/** 取某包所有「错题」（status === 'mistake'） */
export async function getMistakeCards(packageId: number): Promise<CardRow[]> {
  return db.cards.where('packageId').equals(packageId).and((c) => c.status === 'mistake').toArray()
}

/** 取全部错题（跨包），附 packageId 用于分组展示 */
export async function getAllMistakes(): Promise<CardRow[]> {
  return db.cards.where('status').equals('mistake').toArray()
}

export interface GlobalStats {
  packages: number
  cards: number
  known: number
  mistake: number
  learning: number
  reviewed: number
}

export async function getGlobalStats(): Promise<GlobalStats> {
  const [all, packages] = await Promise.all([db.cards.toArray(), db.packages.count()])
  const g: GlobalStats = {
    packages,
    cards: all.length,
    known: 0,
    mistake: 0,
    learning: 0,
    reviewed: 0,
  }
  for (const c of all) {
    if (c.status === 'known') g.known++
    else if (c.status === 'mistake') g.mistake++
    else g.learning++
    g.reviewed += c.reviewed
  }
  return g
}

/* ---------------- 每日练习计划 ---------------- */

/** 读取某包的每日计划（未设置返回 null） */
export async function getPlan(packageId: number): Promise<PackagePlan | null> {
  const p = await db.packages.get(packageId)
  return p?.plan ?? null
}

/** 设置 / 覆盖某包的每日计划 */
export async function setPlan(packageId: number, plan: PackagePlan): Promise<void> {
  await db.packages.update(packageId, { plan, planSetAt: Date.now() })
}

/**
 * 构建「每日练习」队列（返回卡片 id 顺序，已随机打乱）。
 *
 * 组成（严格遵循需求）：
 *  1) 旧题优先取「最近两日易错」的题目（lastSeenAt 在 2 天内且 missed>0）；
 *  2) 再用「艾宾浩斯遗忘曲线」补入到期（dueAt<=now 且未掌握）的复习卡片；
 *  3) 新题取尚未练习（status==='new'）的卡片，按数据包顺序；
 *  4) 旧题上限 plan.old、新题上限 plan.new，最后整体随机打乱。
 */
export async function buildDailyPlan(packageId: number, plan: PackagePlan): Promise<number[]> {
  const cards = await db.cards.where('packageId').equals(packageId).toArray()
  const now = Date.now()

  // 1) 最近两日易错（优先）
  const recent = cards
    .filter((c) => c.status !== 'known' && c.lastSeenAt && now - c.lastSeenAt <= 2 * DAY && c.missed > 0)
    .sort((a, b) => (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0))
    .map((c) => c.id!)

  // 2) 艾宾浩斯到期（未掌握且已到复习时间），排除新题（新题走第 3 步）
  const due = cards
    .filter((c) => c.status !== 'known' && c.status !== 'new' && (c.dueAt ?? 0) <= now)
    .map((c) => c.id!)

  // 合并去重：recent 优先，再补 due
  const oldPool: number[] = []
  const seen = new Set<number>()
  for (const id of [...recent, ...due]) {
    if (!seen.has(id)) {
      seen.add(id)
      oldPool.push(id)
    }
  }
  const old = oldPool.slice(0, Math.max(0, plan.old))

  // 3) 新题（按数据包顺序取前 plan.new）
  const fresh = cards
    .filter((c) => c.status === 'new')
    .sort((a, b) => a.order - b.order)
    .slice(0, Math.max(0, plan.new))
    .map((c) => c.id!)

  // 4) 合并并随机打乱
  return shuffle([...old, ...fresh])
}

/* ---------------- 学习状态（3 次正确机制） ---------------- */

/**
 * 应用一次作答结果到卡片对象（就地修改）。
 * · 知道：correct++、streak++；streak 达到 KNOWN_STREAK → 标记 known 并按艾宾浩斯推进 box / 安排下次复习；
 *        否则若原是 mistake 则降级回 learning(new)。
 * · 不清楚：missed++、streak 清零、标记为 mistake、box 归零、立即到期（稍后重练）。
 */
function applyOutcome(c: CardRow, known: boolean): CardRow {
  c.reviewed += 1
  c.lastSeenAt = Date.now()
  if (known) {
    c.correct += 1
    c.streak = (c.streak ?? 0) + 1
    if (c.streak >= KNOWN_STREAK) {
      c.status = 'known'
      c.box = Math.min((c.box ?? 0) + 1, EB_MAX_BOX)
      const days = nextInterval(c.box)
      c.interval = days
      c.dueAt = Date.now() + days * DAY
    } else if (c.status === 'mistake') {
      c.status = 'new'
    }
  } else {
    c.missed += 1
    c.streak = 0
    c.status = 'mistake'
    c.box = 0
    c.dueAt = Date.now()
  }
  return c
}

/** 记录一次作答（在翻牌后点「下一张」时落库），返回最新卡片状态 */
export async function recordAnswer(
  cardId: number,
  known: boolean,
  mode?: StudyMode,
): Promise<CardRow | null> {
  let updated: CardRow | null = null
  await db.cards.update(cardId, (c: CardRow) => {
    applyOutcome(c, known)
    updated = c
  })
  const card = await db.cards.get(cardId)
  if (card) await logAttempt(cardId, card.packageId, known, mode)
  return updated ?? card ?? null
}

/** 写入一条作答历史（供统计页「实际作答情况」图表使用） */
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

/* ---------------- 导出 / 删除 ---------------- */

/**
 * 导出某包：在原始数据包基础上补充每张卡片的学习进度与计划字段，
 * 形成可完整迁移的「数据包 + 学习进度」文件。
 */
export async function exportPackageRaw(
  packageId: number,
): Promise<{ name: string; pkg: DataPackage } | null> {
  const pkg = await db.packages.get(packageId)
  if (!pkg) return null
  const cards = await db.cards.where('packageId').equals(packageId).toArray()
  const raw = pkg.raw
  const data: QAItem[] = cards
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((c, i) => {
      const orig = raw.data[i]
      return {
        id: orig?.id ?? i + 1,
        type: c.type ?? orig?.type,
        question: c.question,
        answer: c.answer,
        progress: {
          status: c.status,
          streak: c.streak,
          box: c.box,
          missed: c.missed,
          correct: c.correct,
          reviewed: c.reviewed,
          lastSeenAt: c.lastSeenAt,
          dueAt: c.dueAt,
          interval: c.interval,
        },
      }
    })
  return {
    name: pkg.name,
    pkg: {
      title: pkg.name,
      time: raw.time,
      data,
      plan: pkg.plan,
      exportedAt: Date.now(),
    },
  }
}

export async function deletePackage(packageId: number): Promise<void> {
  await db.transaction('rw', db.packages, db.cards, db.attempts, async () => {
    await db.attempts.where('packageId').equals(packageId).delete()
    await db.cards.where('packageId').equals(packageId).delete()
    await db.packages.delete(packageId)
  })
}

export async function clearAll(): Promise<void> {
  await db.transaction('rw', db.packages, db.cards, db.attempts, async () => {
    await db.attempts.clear()
    await db.cards.clear()
    await db.packages.clear()
  })
}

/* ---------------- 首次启动播种示例数据包 ---------------- */

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
