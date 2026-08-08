import { useRef, useState, type MouseEvent } from 'react'

interface Props {
  question: string
  answer: string
  flipped: boolean
  /** 用户作答选择，用于正/误着色 */
  choice: 'known' | 'unknown' | null
  /** 翻面后于「题目」右侧提供的掌握程度开关；点击即把本题判定为 知道/不知道 */
  onToggleChoice?: (known: boolean) => void
}

interface Ripple {
  id: number
  x: number
  y: number
  known: boolean
}

/**
 * 翻牌子卡片：正面仅显示题目；点击「知道 / 不清楚」后翻面，
 * 背面同时展开题目与答案，choice 决定边框着色（绿=知道 / 红=不清楚）。
 * 翻面后「题目」右侧提供 知道/不知道 开关，可直接改判本题；
 * 改判时从开关位置向外扩散一圈绿/红涟漪动画。
 */
export default function FlashCard({ question, answer, flipped, choice, onToggleChoice }: Props) {
  const backRef = useRef<HTMLDivElement>(null)
  const rippleSeq = useRef(0)
  const [ripples, setRipples] = useState<Ripple[]>([])
  const backClass = choice === 'unknown' ? ' unknown' : choice === 'known' ? ' known' : ''

  // 从被点击的开关处生成涟漪，原点坐标相对于卡片背面容器
  const spawnRipple = (e: MouseEvent<HTMLButtonElement>, known: boolean) => {
    const back = backRef.current
    if (back) {
      const b = e.currentTarget.getBoundingClientRect()
      const r = back.getBoundingClientRect()
      const id = ++rippleSeq.current
      setRipples((prev) => [
        ...prev,
        { id, x: b.left + b.width / 2 - r.left, y: b.top + b.height / 2 - r.top, known },
      ])
    }
  }

  const removeRipple = (id: number) => setRipples((prev) => prev.filter((p) => p.id !== id))

  const handleChoice = (e: MouseEvent<HTMLButtonElement>, known: boolean) => {
    spawnRipple(e, known)
    onToggleChoice?.(known)
  }

  return (
    <div className={`flip-card${flipped ? ' flipped' : ''}${backClass}`}>
      <div className="flip-inner">
        <div className="flip-face flip-front">
          <span className="fc-kicker">题目</span>
          <p className="fc-text">{question}</p>
          <span className="fc-hint">点按下方按钮翻牌看答案</span>
        </div>
        <div className="flip-face flip-back" ref={backRef}>
          <div className="fc-head">
            <span className="fc-kicker">题目</span>
            {choice && onToggleChoice && (
              <div className="choice-toggle" role="group" aria-label="掌握程度">
                <button
                  type="button"
                  className={choice === 'known' ? 'on known' : ''}
                  aria-pressed={choice === 'known'}
                  onClick={(e) => handleChoice(e, true)}
                >
                  知道
                </button>
                <button
                  type="button"
                  className={choice === 'unknown' ? 'on unknown' : ''}
                  aria-pressed={choice === 'unknown'}
                  onClick={(e) => handleChoice(e, false)}
                >
                  不知道
                </button>
              </div>
            )}
          </div>
          <p className="fc-text">{question}</p>
          <span className="fc-divider" />
          <span className="fc-kicker answer">答案</span>
          <p className="fc-text answer-text">
            {answer && answer.trim() ? answer : '（此题暂无答案）'}
          </p>
          <span className="fc-ripple-layer" aria-hidden="true">
            {ripples.map((rp) => (
              <span
                key={rp.id}
                className={`fc-ripple ${rp.known ? 'known' : 'unknown'}`}
                style={{ left: rp.x, top: rp.y }}
                onAnimationEnd={() => removeRipple(rp.id)}
              />
            ))}
          </span>
        </div>
      </div>
    </div>
  )
}
