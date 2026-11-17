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
 * The focus effect depends on `open` only — parents may pass a fresh
 * inline `onClose` identity on every render without disturbing focus.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  showClose = false,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** Optional sticky action area below the scrolling body. */
  footer?: ReactNode
  /** Render a 44px "×" close button in the header (aria-label "Close"). */
  showClose?: boolean
}) {
  const panelRef = useRef<HTMLElement>(null)
  const onCloseRef = useRef(onClose)
  const isOpenRef = useRef(false)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  // Keep the latest callback available to the [open]-dependent effect
  // without re-running it when the parent passes a new identity.
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (open) {
      isOpenRef.current = true
      previouslyFocusedRef.current = document.activeElement as HTMLElement | null
      panelRef.current?.focus()

      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          onCloseRef.current()
          return
        }
        if (event.key !== 'Tab') return
        const panel = panelRef.current
        if (!panel) return
        const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
        if (focusable.length === 0) {
          // Still a modal: never let Tab walk into the covered page.
          event.preventDefault()
          return
        }
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
      }
    }

    // Closing transition: hand focus back to the opener, once per cycle.
    if (isOpenRef.current) {
      isOpenRef.current = false
      previouslyFocusedRef.current?.focus()
      previouslyFocusedRef.current = null
    }
    return undefined
  }, [open])

  // Unmount while open: restore focus the same way a close would.
  useEffect(() => {
    return () => {
      if (isOpenRef.current) {
        isOpenRef.current = false
        previouslyFocusedRef.current?.focus()
        previouslyFocusedRef.current = null
      }
    }
  }, [])

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
          {showClose && (
            <button
              type="button"
              className="ht-sheet__close"
              aria-label="Close"
              onClick={onClose}
            >
              ×
            </button>
          )}
        </header>
        <div className="ht-sheet__body">{children}</div>
        {footer !== undefined && (
          <footer className="ht-sheet__footer">{footer}</footer>
        )}
      </section>
    </div>
  )
}
