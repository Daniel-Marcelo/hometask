import { useEffect } from 'react'
import type { ReactNode } from 'react'

/**
 * Bottom sheet: slides up over a dimmed backdrop, closes on backdrop click
 * and Escape. Rendered in place (portal-free); one instance at a time.
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
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="ht-sheet">
      <div className="ht-sheet__backdrop" onClick={onClose} />
      <section className="ht-sheet__panel" role="dialog" aria-modal="true" aria-label={title}>
        <div className="ht-sheet__handle" aria-hidden="true" />
        <header className="ht-sheet__header">
          <h2 className="ht-sheet__title">{title}</h2>
        </header>
        <div className="ht-sheet__body">{children}</div>
      </section>
    </div>
  )
}
