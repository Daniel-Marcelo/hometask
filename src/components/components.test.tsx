import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Fab } from './Fab'
import { OfflineBanner } from './OfflineBanner'
import { PriorityChip } from './PriorityChip'
import { ProgressBar } from './ProgressBar'
import { Sheet } from './Sheet'
import { StatTile } from './StatTile'
import { UndoToast } from './UndoToast'

// RTL auto-cleanup needs vitest globals, which this project doesn't enable.
afterEach(cleanup)

describe('StatTile', () => {
  it('renders label, value and optional sub', () => {
    render(<StatTile label="Progress" value="16%" sub="13 of 69 done" />)
    expect(screen.getByText('Progress')).toBeInTheDocument()
    expect(screen.getByText('16%')).toBeInTheDocument()
    expect(screen.getByText('13 of 69 done')).toBeInTheDocument()
  })

  it('renders without a sub line', () => {
    const { container } = render(<StatTile label="Remaining" value="56" />)
    expect(container.querySelector('.ht-tile__sub')).toBeNull()
  })

  it('accent variant carries the accent class', () => {
    const { container } = render(<StatTile label="Progress" value="16%" accent />)
    expect(container.querySelector('.ht-tile')).toHaveClass('ht-tile--accent')
  })
})

describe('ProgressBar', () => {
  it('fill width matches pct', () => {
    const { container } = render(<ProgressBar pct={56} />)
    const fill = container.querySelector<HTMLElement>('.ht-progress__fill')
    expect(fill).not.toBeNull()
    expect(fill!.style.width).toBe('56%')
  })

  it('clamps pct into 0–100', () => {
    const { container } = render(<ProgressBar pct={150} />)
    expect(container.querySelector<HTMLElement>('.ht-progress__fill')!.style.width).toBe('100%')
  })

  it('exposes an accessible progressbar with the current value', () => {
    render(<ProgressBar pct={16.1} />)
    const track = screen.getByRole('progressbar')
    expect(track).toHaveAttribute('aria-valuenow', '16')
  })
})

describe('PriorityChip', () => {
  it('renders the terracotta chip only for urgent', () => {
    const { container } = render(<PriorityChip priority="urgent" />)
    expect(container.querySelector('.ht-chip')).toHaveClass('ht-chip--urgent')
    expect(screen.getByText('Urgent')).toBeInTheDocument()
  })

  it('renders neutral chips for every other priority', () => {
    for (const priority of ['medium', 'low', 'very_low'] as const) {
      const { container, unmount } = render(<PriorityChip priority={priority} />)
      expect(container.querySelector('.ht-chip')).not.toHaveClass('ht-chip--urgent')
      unmount()
    }
  })

  it('labels very_low in human form', () => {
    render(<PriorityChip priority="very_low" />)
    expect(screen.getByText('Very low')).toBeInTheDocument()
  })
})

describe('UndoToast', () => {
  it('renders nothing when not visible', () => {
    const { container } = render(
      <UndoToast message="Task completed" onUndo={() => {}} visible={false} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the message and calls onUndo', () => {
    const onUndo = vi.fn()
    render(<UndoToast message="Task completed" onUndo={onUndo} visible={true} />)
    expect(screen.getByText('Task completed')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(onUndo).toHaveBeenCalledOnce()
  })
})

describe('OfflineBanner', () => {
  it('renders nothing when online', () => {
    const { container } = render(<OfflineBanner visible={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the offline message', () => {
    render(<OfflineBanner visible={true} />)
    expect(screen.getByText('Offline — changes will sync')).toBeInTheDocument()
  })
})

describe('Fab', () => {
  it('calls onClick and exposes its label accessibly', () => {
    const onClick = vi.fn()
    render(<Fab onClick={onClick} label="Add task" />)
    const fab = screen.getByRole('button', { name: 'Add task' })
    fireEvent.click(fab)
    expect(onClick).toHaveBeenCalledOnce()
  })
})

describe('Sheet', () => {
  const onClose = vi.fn()

  it('renders nothing when closed', () => {
    const { container } = render(
      <Sheet open={false} onClose={onClose} title="Edit task">
        <p>Body</p>
      </Sheet>,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders title and children when open', () => {
    render(
      <Sheet open={true} onClose={onClose} title="Edit task">
        <p>Sheet body</p>
      </Sheet>,
    )
    expect(screen.getByText('Edit task')).toBeInTheDocument()
    expect(screen.getByText('Sheet body')).toBeInTheDocument()
  })

  it('calls onClose on backdrop click', () => {
    const { container } = render(
      <Sheet open={true} onClose={onClose} title="Edit task">
        <p>Body</p>
      </Sheet>,
    )
    fireEvent.click(container.querySelector('.ht-sheet__backdrop')!)
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose on Escape', () => {
    render(
      <Sheet open={true} onClose={onClose} title="Edit task">
        <p>Body</p>
      </Sheet>,
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
