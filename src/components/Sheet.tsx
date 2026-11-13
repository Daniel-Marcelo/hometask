import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

/** Focusable elements inside the sheet, in DOM order (tabindex="-1" excluded). */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/* Body scroll lock, ref-counted so stacked sheets restore the page correctly. */
let openSheetCount = 0
let bodyOverflowBeforeLock = ''

/**
 * Bottom sheet: slides up over a dimmed backdrop, closes on backdrop click
 * and Escape. Rendered in place (portal-free); one instance at a time.
 * On open, focus moves to the panel; Tab is trapped at the sheet's edges;
 * on close, focus returns to the previously focused element.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  const panelRef = useRef<HTMLElement>(null)

  // Focus management: move focus in on open, trap Tab at the edges,
  // restore the previously focused element on close/unmount.
  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    panelRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus()
    }
  }, [open, onClose])

  // Scroll containment: lock the page behind the sheet while it is open.
  useEffect(() => {
    if (!open) return
    if (openSheetCount === 0) {
      bodyOverflowBeforeLock = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    openSheetCount++
    return () => {
      openSheetCount--
      if (openSheetCount === 0) {
        document.body.style.overflow = bodyOverflowBeforeLock
      }
    }
  }, [open])

  if (!open) return null
  return (
    <div className="ht-sheet">
      <div className="ht-sheet__backdrop" onClick={onClose} />
      <section
        ref={panelRef}
        tabIndex={-1}
        className="ht-sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="ht-sheet__handle" aria-hidden="true" />
        <header className="ht-sheet__header">
          <h2 className="ht-sheet__title">{title}</h2>
        </header>
        <div className="ht-sheet__body">{children}</div>
      </section>
    </div>
  )
}
