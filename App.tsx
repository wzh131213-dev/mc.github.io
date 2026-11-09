import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Engine } from './engine'
import type { InfoPayload, Settings } from './engine'
import Logo from './Logo'
import TouchControls from './TouchControls'
import { BLOCKS, HOTBAR, blockIcon, dirtDataURL } from './world'
import MINECRAFT_REGISTRY from './minecraft-26.3-registry.json'
import Inventory, { type InventoryStack } from './Inventory'

type Screen = 'title' | 'options' | 'multi' | 'loading' | 'playing' | 'paused' | 'quit'

const HOTBAR_STORAGE_KEY = 'mc-web-hotbar:v1'
const BAG_STORAGE_KEY = 'mc-web-inventory:v1'
const ITEM_IDS = new Set(MINECRAFT_REGISTRY.items.map((item) => item.id))

function readSavedInventory(): InventoryStack[] {
  try {
    const raw = window.localStorage.getItem(BAG_STORAGE_KEY)
    const value: unknown = raw ? JSON.parse(raw) : null
    if (
      Array.isArray(value) &&
      value.length === 27 &&
      value.every((slot) => slot === null || (
        typeof slot === 'object' && slot !== null &&
        Number.isInteger((slot as { itemId?: unknown }).itemId) &&
        ITEM_IDS.has((slot as { itemId: number }).itemId) &&
        Number.isInteger((slot as { count?: unknown }).count) &&
        (slot as { count: number }).count > 0 &&
        (slot as { count: number }).count <= 64
      ))
    ) return value as InventoryStack[]
  } catch {
    // 损坏或不可用的存档回退为空背包。
  }
  return Array.from({ length: 27 }, () => null)
}

function readSavedHotbar(): number[] {
  try {
    const raw = window.localStorage.getItem(HOTBAR_STORAGE_KEY)
    const value: unknown = raw ? JSON.parse(raw) : null
    if (
      Array.isArray(value) &&
      value.length === 9 &&
      value.every((id) => Number.isInteger(id) && BLOCKS.includes(id as (typeof BLOCKS)[number]))
    ) return value as number[]
  } catch {
    // 浏览器隐私模式可能禁用本地存储；回退到默认快捷栏。
  }
  return [...HOTBAR]
}

const SPLASHES = [
  '你好,世界!',
  '苦力怕?哎呀老兄!',
  '别往下挖!',
  '100% 纯天然方块!',
  '现在运行在浏览器里!',
  '快看,是末影人!',
  '合成表在脑子里!',
  '小心岩浆!',
  '钻石!钻石!',
  '一方块一世界!',
  '天黑之前回家!',
  '也试试挖矿吧!',
  '像素风永不过时!',
]

const TIPS = 'WASD 移动 · 空格 跳跃(双击飞行) · Shift 疾跑 · 左键 破坏 · 右键 放置 · 1-9 / 滚轮 切换方块 · E 背包 · Esc 菜单'
const TIPS_TOUCH =
  '左下十字键 移动(连点两下 ↑ 疾跑) · 屏幕上滑动 转视角 · 轻点 放置方块 · 长按 破坏方块 · 连点两下跳跃键 飞行 · 右上角背包 · 点快捷栏切换方块'

/** 尝试进入全屏并锁定横屏(Android Chrome 等支持;iOS Safari 会静默忽略) */
function enterFullscreen() {
  try {
    const el = document.documentElement
    if (document.fullscreenElement || !el.requestFullscreen) return
    Promise.resolve(el.requestFullscreen({ navigationUI: 'hide' }))
      .then(() => {
        const o = screen.orientation as unknown as { lock?: (o: string) => Promise<void> }
        return o.lock?.('landscape')
      })
      .catch(() => {})
  } catch {
    /* 忽略 */
  }
}

function McButton({
  children,
  onClick,
  disabled,
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  className?: string
}) {
  return (
    <button className={`mc-btn ${className}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

function McSlider({
  label,
  value,
  min,
  max,
  step = 1,
  format,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  format: (v: number) => string
  onChange: (v: number) => void
}) {
  const pct = (value - min) / (max - min)
  return (
    <div className="mc-slider relative h-10 w-full">
      <div className="absolute inset-0 border-2 border-black bg-[#3a3a3a] shadow-[inset_2px_2px_0_rgba(0,0,0,0.5),inset_-2px_-2px_0_rgba(255,255,255,0.25)]" />
      <div
        className="mc-handle absolute top-0 bottom-0 w-[12px]"
        style={{ left: `calc(${pct} * (100% - 12px))` }}
      />
      <div className="mc-text pointer-events-none absolute inset-0 flex items-center justify-center text-[18px] font-semibold">
        {label}: {format(value)}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="absolute inset-0 h-full w-full cursor-pointer touch-none opacity-0"
      />
    </div>
  )
}

function DirtScreen({ children, dim = 0.62 }: { children: ReactNode; dim?: number }) {
  const url = useMemo(() => dirtDataURL(), [])
  return (
    <div
      className="dirt-bg menu-scroll absolute inset-0 z-20 flex flex-col items-center"
      style={{
        backgroundImage: `linear-gradient(rgba(0,0,0,${dim}),rgba(0,0,0,${dim})), url(${url})`,
      }}
    >
      {children}
    </div>
  )
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<Engine | null>(null)
  const [screen, setScreenState] = useState<Screen>('title')
  const screenRef = useRef<Screen>('title')
  const optionsFrom = useRef<Screen>('title')
  const [settings, setSettings] = useState<Settings>(() => ({
    fov: 70,
    sens: 1,
    // 手机默认少画一点,更流畅
    chunks: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 6 : 8,
  }))
  const [slot, setSlot] = useState(0)
  const [hotbarBlocks, setHotbarBlocks] = useState<number[]>(readSavedHotbar)
  const [bagSlots, setBagSlots] = useState<InventoryStack[]>(readSavedInventory)
  const [saveWarning, setSaveWarning] = useState(false)
  const [inventoryOpen, setInventoryOpen] = useState(false)
  const inventoryOpenRef = useRef(false)
  const setInventoryVisibility = useCallback((open: boolean) => {
    inventoryOpenRef.current = open
    setInventoryOpen(open)
  }, [])
  const openInventory = useCallback(() => {
    setInventoryVisibility(true)
    const engine = engineRef.current
    engine?.setActive(false)
    // 桌面模式打开物品栏时释放鼠标指针锁定，让关闭/替换按钮真正可点击。
    engine?.unlock()
  }, [setInventoryVisibility])
  const closeInventory = useCallback((restorePointerLock = true) => {
    setInventoryVisibility(false)
    const engine = engineRef.current
    if (screenRef.current === 'playing') {
      engine?.setActive(true)
      if (restorePointerLock && engine && !engine.touchMode && !engine.isLocked() && !engine.noLock) engine.lock()
    }
  }, [setInventoryVisibility])
  const [info, setInfo] = useState<InfoPayload>({ text: '', chunkText: '', underwater: false, fly: false })
  const [touch, setTouch] = useState(false)
  const [progress, setProgress] = useState(0)
  const [splash] = useState(() => SPLASHES[Math.floor(Math.random() * SPLASHES.length)])

  const go = useCallback((s: Screen) => {
    screenRef.current = s
    setScreenState(s)
    setInventoryVisibility(false)
    engineRef.current?.setActive(s === 'playing')
  }, [setInventoryVisibility])

  useEffect(() => {
    const engine = new Engine(canvasRef.current!)
    engineRef.current = engine
    engine.onSlot = setSlot
    engine.onInfo = setInfo
    engine.onTouchMode = setTouch
    setTouch(engine.touchMode)
    engine.onLockChange = (locked) => {
      if (locked) return
      // 打开背包时主动释放鼠标锁定，但不应因此关闭背包或进入暂停菜单。
      if (inventoryOpenRef.current) {
        engine.setActive(false)
        return
      }
      if (screenRef.current === 'playing') go('paused')
    }
    return () => {
      engine.dispose()
      engineRef.current = null
    }
  }, [go, setInventoryVisibility])

  useEffect(() => {
    engineRef.current?.setSettings(settings)
  }, [settings])

  useEffect(() => {
    try {
      window.localStorage.setItem(HOTBAR_STORAGE_KEY, JSON.stringify(hotbarBlocks))
    } catch {
      setSaveWarning(true)
    }
  }, [hotbarBlocks])

  useEffect(() => {
    try {
      window.localStorage.setItem(BAG_STORAGE_KEY, JSON.stringify(bagSlots))
    } catch {
      setSaveWarning(true)
    }
  }, [bagSlots])

  // iOS Safari 忽略 user-scalable=no,需要拦截捏合手势
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault()
    document.addEventListener('gesturestart', stop)
    document.addEventListener('gesturechange', stop)
    return () => {
      document.removeEventListener('gesturestart', stop)
      document.removeEventListener('gesturechange', stop)
    }
  }, [])

  // 指针锁定可用时由 pointerlockchange 负责 Esc；触屏/无锁定模式由这里处理。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return
      const s = screenRef.current
      const eng = engineRef.current
      if (inventoryOpenRef.current) {
        // 桌面浏览器按 Esc 会退出指针锁定；随后由此处理器关闭背包。
        if (s === 'playing' && eng && !eng.touchMode && eng.isLocked()) return
        closeInventory(false)
        return
      }
      if (s === 'playing') {
        if (eng && !eng.touchMode && !eng.noLock) return
        go('paused')
      } else if (s === 'paused') {
        eng?.lock()
        go('playing')
      } else if (s === 'options') go(optionsFrom.current)
      else if (s === 'multi') go('title')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeInventory, go])

  useEffect(() => {
    const onInventoryKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyE' || !['playing', 'paused'].includes(screenRef.current) || e.repeat) return
      const target = e.target
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return
      e.preventDefault()
      const next = !inventoryOpenRef.current
      setInventoryVisibility(next)
      const engine = engineRef.current
      engine?.setActive(!next && screenRef.current === 'playing')
      if (next) engine?.unlock()
      else if (screenRef.current === 'playing' && engine && !engine.touchMode && !engine.noLock) engine.lock()
    }
    window.addEventListener('keydown', onInventoryKey)
    return () => window.removeEventListener('keydown', onInventoryKey)
  }, [setInventoryVisibility])

  // 加载界面:真实等待视野内的区块生成完毕(至少 1 秒,最多 15 秒)
  useEffect(() => {
    if (screen !== 'loading') return
    setProgress(0)
    const eng = engineRef.current!
    eng.setMode('game')
    const start = performance.now()
    const id = setInterval(() => {
      const elapsed = performance.now() - start
      const p = elapsed > 15000 ? 1 : Math.min(1, elapsed / 1000, eng.loadProgress())
      setProgress(p)
      if (p >= 1) {
        clearInterval(id)
        if (eng.isLocked() || eng.noLock) go('playing')
        else go('paused')
      }
    }, 50)
    return () => clearInterval(id)
  }, [screen, go])

  const startGame = () => {
    setSaveWarning(false)
    engineRef.current?.lock()
    if (engineRef.current?.touchMode) enterFullscreen()
    go('loading')
  }

  const resume = () => {
    engineRef.current?.lock()
    go('playing')
  }

  const toTitle = () => {
    const eng = engineRef.current
    // 区块修改在每次操作时已自动保存；退出时再统一写入并检查存储状态。
    setSaveWarning(!(eng?.saveWorld() ?? false))
    go('title')
    eng?.unlock()
    eng?.setMode('panorama')
  }

  const openOptions = (from: Screen) => {
    optionsFrom.current = from
    go('options')
  }

  const inGame = screen === 'playing' || screen === 'paused' || (screen === 'options' && optionsFrom.current === 'paused')

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* ------------------------------ TITLE ------------------------------ */}
      {screen === 'title' && (
        <div className="menu-scroll absolute inset-0 z-10 flex flex-col items-center">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/45" />
          <div className="relative mt-[5vh] flex flex-col items-center">
            <div className="relative">
              <Logo />
              <div
                className="splash pointer-events-none absolute right-[-2%] bottom-[-6%] whitespace-nowrap text-[clamp(16px,2.4vw,26px)] font-bold"
                style={{ color: '#ffff00', textShadow: '2px 2px 0 #3f3f00' }}
              >
                {splash}
              </div>
            </div>
            <div
              className="mc-text -mt-1 self-end pr-[4%] text-[clamp(12px,1.6vw,18px)] font-bold tracking-[0.3em] italic"
              style={{ color: '#e6e6e6' }}
            >
              WEB EDITION
            </div>
          </div>

          {saveWarning && (
            <div role="status" className="mc-text absolute top-2 max-w-[92vw] rounded border border-[#b88632] bg-black/80 px-3 py-2 text-center text-sm text-[#ffd77a]">
              本地存储不可用：当前世界修改可能无法保存
            </div>
          )}

          <div className="relative mt-[5vh] flex w-[min(400px,90vw)] flex-col gap-2">
            <McButton onClick={startGame}>单人游戏</McButton>
            <McButton onClick={() => go('multi')}>多人游戏</McButton>
            <McButton disabled>Minecraft Realms</McButton>
            <div className="mt-4 flex gap-2 [@media(max-height:440px)]:mt-0">
              <McButton onClick={() => openOptions('title')}>选项...</McButton>
              <McButton onClick={() => go('quit')}>退出游戏</McButton>
            </div>
          </div>

          <div className="mc-text safe-bl absolute text-[15px]">Minecraft 1.20.4</div>
          <div className="mc-text safe-br absolute text-[15px]">版权所有 Mojang AB,请勿散布!</div>
        </div>
      )}

      {/* ----------------------------- MULTIPLAYER ----------------------------- */}
      {screen === 'multi' && (
        <DirtScreen>
          <h2 className="mc-text mt-5 text-[22px] font-semibold">玩多人游戏</h2>
          <div className="mt-4 h-[50%] w-[min(620px,92vw)] overflow-hidden border-2 border-[#000] bg-black/60 shadow-[inset_0_0_0_2px_#2a2a2a]">
            <div className="flex items-center gap-3 border-2 border-transparent p-2 hover:border-[#9a9a9a]">
              <img src={blockIcon(1)} alt="" className="h-16 w-16" style={{ imageRendering: 'pixelated' }} />
              <div className="flex-1">
                <div className="mc-text text-[18px]">Minecraft 服务器</div>
                <div className="text-[16px] text-[#ff5555]" style={{ textShadow: '2px 2px 0 #3f1515' }}>
                  无法连接到服务器
                </div>
                <div className="text-[14px] text-[#a0a0a0]">localhost:25565</div>
              </div>
              <div className="mr-2 flex items-end gap-[2px]">
                {[8, 12, 16, 20, 24].map((h) => (
                  <div key={h} className="w-[5px] bg-[#4a4a4a]" style={{ height: h }} />
                ))}
              </div>
            </div>
            <div className="p-4 text-[15px] text-[#bbb]">网页演示版暂不支持联机,请尝试单人游戏。</div>
          </div>
          <div className="mt-4 flex w-[min(420px,92vw)] flex-col gap-2">
            <div className="flex gap-2">
              <McButton disabled>加入服务器</McButton>
              <McButton disabled>直接连接</McButton>
            </div>
            <McButton onClick={() => go('title')}>返回</McButton>
          </div>
        </DirtScreen>
      )}

      {/* ------------------------------ OPTIONS ------------------------------ */}
      {screen === 'options' &&
        (() => {
          const body = (
            <>
              <h2 className="mc-text mt-6 text-[22px] font-semibold [@media(max-height:440px)]:mt-3">选项</h2>
              <div className="mt-6 grid w-[min(420px,92vw)] grid-cols-1 gap-3 [@media(max-height:440px)]:mt-3 [@media(max-height:440px)]:gap-2">
                <McSlider
                  label="视野"
                  value={settings.fov}
                  min={50}
                  max={110}
                  format={(v) => (v === 70 ? '正常' : `${v}`)}
                  onChange={(v) => setSettings((s) => ({ ...s, fov: v }))}
                />
                <McSlider
                  label="渲染距离"
                  value={settings.chunks}
                  min={3}
                  max={12}
                  format={(v) => `${v} 区块`}
                  onChange={(v) => setSettings((s) => ({ ...s, chunks: v }))}
                />
                <McSlider
                  label={touch ? '视角灵敏度' : '鼠标灵敏度'}
                  value={settings.sens}
                  min={0.25}
                  max={2.5}
                  step={0.05}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => setSettings((s) => ({ ...s, sens: v }))}
                />
              </div>
              <div className="mt-10 mb-4 w-[min(420px,92vw)] [@media(max-height:440px)]:mt-4">
                <McButton onClick={() => go(optionsFrom.current)}>完成</McButton>
              </div>
            </>
          )
          return optionsFrom.current === 'paused' ? (
            <div className="menu-scroll absolute inset-0 z-20 flex flex-col items-center bg-black/60">{body}</div>
          ) : (
            <DirtScreen>{body}</DirtScreen>
          )
        })()}

      {/* ------------------------------ LOADING ------------------------------ */}
      {screen === 'loading' && (
        <DirtScreen dim={0.5}>
          <div className="flex flex-1 flex-col items-center justify-center">
            <div className="mc-text text-[22px] font-semibold">正在加载世界</div>
            <div className="mc-text mt-2 text-[16px]">生成地形中...{Math.round(progress * 100)}%</div>
            <div className="mt-4 h-[10px] w-[min(380px,80vw)] border-2 border-black bg-[#2b2b2b]">
              <div className="h-full bg-[#5fd13c]" style={{ width: `${progress * 100}%` }} />
            </div>
          </div>
          <div className="mc-text mb-8 max-w-[92vw] px-4 text-center text-[14px] text-[#cfcfcf]">
            {touch ? TIPS_TOUCH : TIPS}
            {touch && <div className="portrait-only mt-2 text-[#ffff55]">建议把设备横过来玩,操作更舒服</div>}
          </div>
        </DirtScreen>
      )}

      {/* ------------------------------ HUD ------------------------------ */}
      {inGame && (
        <div className="pointer-events-none absolute inset-0 z-10">
          {info.underwater && <div className="absolute inset-0 bg-[#1b4fd6]/35" />}
          <div className="mc-text safe-tl absolute text-[14px] leading-5">
            <div>Minecraft 1.20.4 (web/vanilla)</div>
            <div>{info.text}</div>
            <div>{info.chunkText}</div>
          </div>
          {/* crosshair */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 mix-blend-difference">
            <div className="absolute h-[2px] w-[18px] -translate-x-1/2 -translate-y-1/2 bg-white" />
            <div className="absolute h-[18px] w-[2px] -translate-x-1/2 -translate-y-1/2 bg-white" />
          </div>
          {/* hotbar */}
          <div
            className="absolute left-1/2 flex -translate-x-1/2 border-2 border-black bg-[#8b8b8b] p-[3px]"
            style={
              {
                bottom: 'calc(8px + env(safe-area-inset-bottom, 0px))',
                // 触屏:根据屏幕宽度缩放快捷栏,给两侧按键留出空间
                '--slot': touch ? 'clamp(28px, calc((100vw - 400px) / 9), 46px)' : '46px',
              } as CSSProperties
            }
          >
            {hotbarBlocks.map((b, i) => (
              <div
                key={i}
                className={`hotbar-slot relative flex h-[var(--slot)] w-[var(--slot)] items-center justify-center bg-[#8b8b8b] ${touch ? 'pointer-events-auto touch-none' : ''}`}
                onPointerDown={touch ? () => engineRef.current?.selectSlot(i) : undefined}
                style={
                  i === slot
                    ? { outline: '4px solid #fff', outlineOffset: '-2px', zIndex: 1, boxShadow: '0 0 0 2px #000, inset 2px 2px 0 #373737, inset -2px -2px 0 #fff' }
                    : undefined
                }
              >
                <img src={blockIcon(b)} alt="" className="h-[83%] w-[83%]" style={{ imageRendering: 'pixelated' }} />
                <span className="absolute top-0 left-[3px] text-[10px] text-white/80">{i + 1}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {inventoryOpen && (screen === 'playing' || screen === 'paused') && (
        <Inventory
          selected={slot}
          hotbar={hotbarBlocks}
          bag={bagSlots}
          onSelect={(i) => { engineRef.current?.selectSlot(i); setSlot(i) }}
          onEquip={(id, targetSlot) => {
            const target = targetSlot ?? slot
            setHotbarBlocks((current) => {
              const next = [...current]
              next[target] = id
              if (engineRef.current) engineRef.current.hotbar[target] = id
              return next
            })
          }}
          onGive={(itemId, count) => {
            const item = MINECRAFT_REGISTRY.items.find((entry) => entry.id === itemId)
            if (!item) return
            const maxStack = Math.min(64, Math.max(1, item.stack))
            setBagSlots((current) => {
              const next = [...current]
              let remaining = Math.min(count, maxStack)
              for (let i = 0; i < next.length && remaining > 0; i++) {
                const stack = next[i]
                if (stack?.itemId !== itemId || stack.count >= maxStack) continue
                const added = Math.min(maxStack - stack.count, remaining)
                next[i] = { itemId, count: stack.count + added }
                remaining -= added
              }
              for (let i = 0; i < next.length && remaining > 0; i++) {
                if (next[i] !== null) continue
                const added = Math.min(maxStack, remaining)
                next[i] = { itemId, count: added }
                remaining -= added
              }
              return next
            })
          }}
          onRemove={(index) => setBagSlots((current) => current.map((stack, i) => i === index ? null : stack))}
          onClose={closeInventory}
        />
      )}

      {/* ---------------------------- TOUCH CONTROLS ---------------------------- */}
      {touch && screen === 'playing' && (
        <TouchControls engineRef={engineRef} onPause={() => go('paused')} />
      )}

      {/* 独立背包入口通过 Portal 挂到 body，脱离游戏画布/触控层的层叠上下文。 */}
      {(screen === 'playing' || screen === 'paused') && !inventoryOpen && createPortal(
        <button
          type="button"
          className="inventory-launcher"
          aria-label="打开背包"
          aria-haspopup="dialog"
          aria-expanded={inventoryOpen}
          onClick={openInventory}
        >
          <span aria-hidden="true">▦</span>
          <span>背包</span>
        </button>,
        document.body,
      )}

      {/* ------------------------------ PAUSE ------------------------------ */}
      {screen === 'paused' && (
        <div className="menu-scroll absolute inset-0 z-20 flex flex-col items-center bg-black/55">
          <h2 className="mc-text mt-[12vh] text-[22px] font-semibold [@media(max-height:440px)]:mt-4">游戏菜单</h2>
          <div className="mt-6 flex w-[min(400px,90vw)] flex-col gap-2">
            <McButton onClick={resume}>回到游戏</McButton>
            <McButton onClick={() => openOptions('paused')}>选项...</McButton>
            <McButton onClick={toTitle} className="mt-4">
              保存并退出到标题屏幕
            </McButton>
          </div>
          <div className="mc-text mt-8 mb-4 max-w-[92vw] px-4 text-center text-[14px] text-[#cfcfcf] [@media(max-height:440px)]:mt-4">
            {touch ? TIPS_TOUCH : TIPS}
          </div>
        </div>
      )}

      {/* ------------------------------ QUIT ------------------------------ */}
      {screen === 'quit' && (
        <div
          className="absolute inset-0 z-30 flex cursor-pointer flex-col items-center justify-center bg-black"
          onClick={() => go('title')}
        >
          <div className="mc-text text-[22px]">感谢游玩!你现在可以关闭这个标签页了。</div>
          <div className="mc-text mt-3 text-[14px] text-[#9a9a9a]">点击任意处返回标题屏幕</div>
        </div>
      )}

      {/* fade in from black on load */}
      <div
        className="pointer-events-none absolute inset-0 z-40 bg-black"
        style={{ animation: 'fade-from-black 1.6s ease-out forwards' }}
      />
    </div>
  )
}
