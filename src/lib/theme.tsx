import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type ThemeMode = 'light' | 'dark'

export interface ChartPalette {
  grid: string
  axis: string
  morning: string
  noon: string
  evening: string
  accent: string
  trend: string
  meal1: string
  meal2: string
  tipBg: string
  tipBorder: string
  tipText: string
}

export const PALETTES: Record<ThemeMode, ChartPalette> = {
  light: {
    grid: '#efeae0',
    axis: '#a39e93',
    morning: '#d98c2b',
    noon: '#3f8f5c',
    evening: '#9b4d6f',
    accent: '#0e6b57',
    trend: '#b97a1b',
    meal1: '#0e6b57',
    meal2: '#b97a1b',
    tipBg: '#ffffff',
    tipBorder: '#e7e2d9',
    tipText: '#1f1d1a',
  },
  dark: {
    grid: '#2a2722',
    axis: '#74706a',
    morning: '#e6a94e',
    noon: '#5bb47a',
    evening: '#c07496',
    accent: '#1f9c7c',
    trend: '#d59a3c',
    meal1: '#1f9c7c',
    meal2: '#d59a3c',
    tipBg: '#25221d',
    tipBorder: '#322e28',
    tipText: '#f0ede6',
  },
}

interface ThemeCtx {
  mode: ThemeMode
  toggle: () => void
  setMode: (m: ThemeMode) => void
  palette: ChartPalette
}

const Ctx = createContext<ThemeCtx>({
  mode: 'light',
  toggle: () => {},
  setMode: () => {},
  palette: PALETTES.light,
})

const KEY = 'wm_theme'

function initial(): ThemeMode {
  const saved = localStorage.getItem(KEY) as ThemeMode | null
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(initial)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', mode)
    localStorage.setItem(KEY, mode)
  }, [mode])

  const setMode = useCallback((m: ThemeMode) => setModeState(m), [])
  const toggle = useCallback(
    () => setModeState((m) => (m === 'dark' ? 'light' : 'dark')),
    [],
  )

  const value = useMemo<ThemeCtx>(
    () => ({ mode, toggle, setMode, palette: PALETTES[mode] }),
    [mode, toggle, setMode],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTheme() {
  return useContext(Ctx)
}
