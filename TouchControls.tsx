import { useEffect, useRef } from 'react'
import type { PointerEvent as RPointerEvent, ReactNode, RefObject } from 'react'
import type { Engine } from './engine'

/** 视角区:按住超过该时间开始连续破坏(原版:轻点放置,长按破坏) */
const HOLD_MS = 350
/** 手指移动超过该距离才算滑动转视角,否则仍算轻点 / 长按 */
const MOVE_SLOP = 10
/** 连点两下前进键(间隔毫秒)进入疾跑 */
const DOUBLE_TAP_MS = 300

function buzz(ms: number) {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* 部分浏览器(如 iOS Safari)不支持震动 */
  }
}

/** 像素箭头(与原版触控键一致的粗箭头),rot 为顺时针旋转角度 */
const ARROW = ['....X....', '...XXX...', '..XXXXX..', '.XXXXXXX.', 'XXXXXXXXX', '...XXX...', '...XXX...', '...XXX...', '...XXX...']

function Arrow({ rot = 0 }: { rot?: number }) {
  const cells: ReactNode[] = []
  ARROW.forEach((row, y) =>
    row.split('').forEach((ch, x) => {
      if (ch === 'X') cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="1.02" height="1.02" />)
    }),
  )
  return (
    <svg className="tc-arrow" viewBox="0 0 10 10" shapeRendering="crispEdges" style={{ transform: `rotate(${rot}deg)` }}>
      <g fill="#2e2e2e" opacity="0.75" transform="translate(1 1)">
        {cells}
      </g>
      <g fill="#ffffff">{cells}</g>
    </svg>
  )
}

function PadButton({
  className,
  onDown,
  onUp,
  children,
}: {
  className: string
  onDown: () => void
  onUp: () => void
  children: ReactNode
}) {
  const end = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.dataset.pressed !== '1') return
    e.currentTarget.dataset.pressed = '0'
    onUp()
  }
  return (
    <div
      className={`tc-btn ${className}`}
      data-pressed="0"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        e.currentTarget.dataset.pressed = '1'
        buzz(6)
        onDown()
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {children}
    </div>
  )
}

type Dirs = { up: boolean; down: boolean; left: boolean; right: boolean }
const NONE: Dirs = { up: false, down: false, left: false, right: false }

export default function TouchControls({
  engineRef,
  onPause,
}: {
  engineRef: RefObject<Engine | null>
  onPause: () => void
}) {
  const dpadRef = useRef<HTMLDivElement>(null)
  const dpadBtns = useRef<Record<keyof Dirs, HTMLDivElement | null>>({ up: null, down: null, left: null, right: null })
  const fingers = useRef(new Map<number, { x: number; y: number }>())
  const dirs = useRef<Dirs>({ ...NONE })
  const sprint = useRef({ on: false, lastUp: 0 })
  const look = useRef({ id: -1, x: 0, y: 0, sx: 0, sy: 0, moved: false, fired: false, timer: 0 })

  // 组件卸载(暂停 / 回到标题)时清掉所有输入,避免角色一直走
  useEffect(() => {
    const lookState = look.current
    return () => {
      window.clearTimeout(lookState.timer)
      const eng = engineRef.current
      eng?.setTouchMove(0, 0, false)
      eng?.setTouchJump(false)
      eng?.setTouchDescend(false)
      eng?.setHold(null)
    }
  }, [engineRef])

  /* ---------------------- 方向键:十字键,可滑动、可斜向 ---------------------- */

  const applyDpad = () => {
    const root = dpadRef.current
    if (!root) return
    const r = root.getBoundingClientRect()
    const cell = r.width / 3
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const next: Dirs = { ...NONE }
    fingers.current.forEach((p) => {
      const dx = p.x - cx
      const dy = p.y - cy
      if (dy < -cell * 0.5) next.up = true
      if (dy > cell * 0.5) next.down = true
      if (dx < -cell * 0.5) next.left = true
      if (dx > cell * 0.5) next.right = true
    })

    // 连点两下 ↑:按住期间持续疾跑
    const now = performance.now()
    if (next.up && !dirs.current.up) {
      sprint.current.on = now - sprint.current.lastUp < DOUBLE_TAP_MS
      sprint.current.lastUp = now
    }
    if (!next.up) sprint.current.on = false

    if (next.up !== dirs.current.up || next.down !== dirs.current.down || next.left !== dirs.current.left || next.right !== dirs.current.right) {
      if ((next.up && !dirs.current.up) || (next.down && !dirs.current.down) || (next.left && !dirs.current.left) || (next.right && !dirs.current.right)) buzz(5)
    }
    dirs.current = next
    ;(Object.keys(next) as (keyof Dirs)[]).forEach((k) => {
      const el = dpadBtns.current[k]
      if (el) {
        el.dataset.pressed = next[k] ? '1' : '0'
        el.dataset.sprint = k === 'up' && sprint.current.on ? '1' : '0'
      }
    })
    engineRef.current?.setTouchMove((next.right ? 1 : 0) - (next.left ? 1 : 0), (next.up ? 1 : 0) - (next.down ? 1 : 0), sprint.current.on)
  }

  const onDpadDown = (e: RPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    applyDpad()
  }
  const onDpadMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (!fingers.current.has(e.pointerId)) return
    fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    applyDpad()
  }
  const onDpadEnd = (e: RPointerEvent<HTMLDivElement>) => {
    if (!fingers.current.delete(e.pointerId)) return
    applyDpad()
  }

  /* -------------------- 视角区:滑动转视角 / 轻点放置 / 长按破坏 -------------------- */

  const onLookDown = (e: RPointerEvent<HTMLDivElement>) => {
    const l = look.current
    if (l.id !== -1) return
    e.currentTarget.setPointerCapture(e.pointerId)
    l.id = e.pointerId
    l.x = l.sx = e.clientX
    l.y = l.sy = e.clientY
    l.moved = false
    l.fired = false
    window.clearTimeout(l.timer)
    l.timer = window.setTimeout(() => {
      if (l.id === -1 || l.moved) return
      l.fired = true
      engineRef.current?.setHold('break')
      buzz(14)
    }, HOLD_MS)
  }

  const onLookMove = (e: RPointerEvent<HTMLDivElement>) => {
    const l = look.current
    if (e.pointerId !== l.id) return
    if (!l.moved && !l.fired) {
      if (Math.hypot(e.clientX - l.sx, e.clientY - l.sy) < MOVE_SLOP) return
      l.moved = true
      window.clearTimeout(l.timer)
      // 以越过阈值的位置为起点,避免视角突然跳一下
      l.x = e.clientX
      l.y = e.clientY
      return
    }
    // 长按破坏的同时也可以继续滑动转视角
    engineRef.current?.touchLook(e.clientX - l.x, e.clientY - l.y)
    l.x = e.clientX
    l.y = e.clientY
  }

  const onLookUp = (e: RPointerEvent<HTMLDivElement>) => {
    const l = look.current
    if (e.pointerId !== l.id) return
    window.clearTimeout(l.timer)
    if (l.fired) engineRef.current?.setHold(null)
    else if (e.type === 'pointerup' && !l.moved) {
      engineRef.current?.actionOnce('place')
      buzz(8)
    }
    l.id = -1
  }

  return (
    <div className="tc-root pointer-events-none absolute inset-0" onContextMenu={(e) => e.preventDefault()}>
      {/* 全屏视角区(其余按键盖在它上面) */}
      <div
        className="pointer-events-auto absolute inset-0 z-[5] touch-none"
        onPointerDown={onLookDown}
        onPointerMove={onLookMove}
        onPointerUp={onLookUp}
        onPointerCancel={onLookUp}
      />

      {/* 左下:十字方向键 */}
      <div
        ref={dpadRef}
        className="tc-dpad z-[15]"
        onPointerDown={onDpadDown}
        onPointerMove={onDpadMove}
        onPointerUp={onDpadEnd}
        onPointerCancel={onDpadEnd}
      >
        <div ref={(el) => void (dpadBtns.current.up = el)} className="tc-btn tc-d-up" data-pressed="0" data-sprint="0">
          <Arrow rot={0} />
        </div>
        <div ref={(el) => void (dpadBtns.current.left = el)} className="tc-btn tc-d-left" data-pressed="0">
          <Arrow rot={-90} />
        </div>
        <div ref={(el) => void (dpadBtns.current.right = el)} className="tc-btn tc-d-right" data-pressed="0">
          <Arrow rot={90} />
        </div>
        <div ref={(el) => void (dpadBtns.current.down = el)} className="tc-btn tc-d-down" data-pressed="0">
          <Arrow rot={180} />
        </div>
      </div>

      {/* 右下:跳跃 / 潜行(飞行时为下降) */}
      <div className="pointer-events-none absolute inset-0 z-[15]">
        <PadButton
          className="tc-jump"
          onDown={() => engineRef.current?.setTouchJump(true)}
          onUp={() => engineRef.current?.setTouchJump(false)}
        >
          <Arrow rot={0} />
        </PadButton>
        <PadButton
          className="tc-sneak"
          onDown={() => engineRef.current?.setTouchDescend(true)}
          onUp={() => engineRef.current?.setTouchDescend(false)}
        >
          <Arrow rot={180} />
        </PadButton>
        {/* 顶部居中:暂停 */}
        <PadButton className="tc-pause" onDown={onPause} onUp={() => {}}>
          <svg viewBox="0 0 8 8" shapeRendering="crispEdges" className="tc-arrow" style={{ width: '48%', height: '48%' }}>
            <g fill="#2e2e2e" opacity="0.75" transform="translate(0.6 0.6)">
              <rect x="1" y="0" width="2" height="7" />
              <rect x="5" y="0" width="2" height="7" />
            </g>
            <rect x="1" y="0" width="2" height="7" fill="#fff" />
            <rect x="5" y="0" width="2" height="7" fill="#fff" />
          </svg>
        </PadButton>
      </div>
    </div>
  )
}
