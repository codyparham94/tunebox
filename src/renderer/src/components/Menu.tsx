import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { MoreIcon } from './Icons'

export interface MenuItem {
  label: string
  onSelect: () => void
  icon?: ReactNode
  hidden?: boolean
}

/** A "⋯" button with a keyboard-navigable popup menu. */
export function Menu({ items, label, className = 'icon-btn' }: { items: MenuItem[]; label: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, transformOrigin: 'top right' })
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const visible = items.filter((i) => !i.hidden)

  useLayoutEffect(() => {
    if (!open || !button.current || !menu.current) return
    const b = button.current.getBoundingClientRect()
    const m = menu.current.getBoundingClientRect()
    const above = b.bottom + m.height + 8 > window.innerHeight
    const top = above ? b.top - m.height - 4 : b.bottom + 4
    const left = Math.max(8, Math.min(b.right - m.width, window.innerWidth - m.width - 8))
    // grow out of the trigger, wherever the menu ended up relative to it
    const originX = Math.min(Math.max(b.left + b.width / 2 - left, 0), m.width)
    setPos({ top, left, transformOrigin: `${originX}px ${above ? '100%' : '0'}` })
    menu.current.querySelector<HTMLButtonElement>('button')?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false)
    }
    const onScroll = () => setOpen(false)
    document.addEventListener('mousedown', close)
    window.addEventListener('blur', onScroll)
    document.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', close)
      window.removeEventListener('blur', onScroll)
      document.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  const onKeyDown = (e: React.KeyboardEvent) => {
    const buttons = [...(menu.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault()
      setOpen(false)
      button.current?.focus()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      buttons[(i + 1) % buttons.length]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      buttons[(i - 1 + buttons.length) % buttons.length]?.focus()
    }
    e.stopPropagation()
  }

  return (
    <>
      <button
        ref={button}
        className={className}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
      >
        <MoreIcon />
      </button>
      {open &&
        createPortal(
          <div ref={menu} role="menu" className="menu" style={pos} onKeyDown={onKeyDown}>
            {visible.map((item) => (
              <button
                key={item.label}
                role="menuitem"
                className="menu-item"
                onClick={(e) => {
                  e.stopPropagation()
                  setOpen(false)
                  button.current?.focus()
                  item.onSelect()
                }}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  )
}
