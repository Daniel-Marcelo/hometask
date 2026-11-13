/** 56px terracotta floating action button, bottom-right above the tab bar. */
export function Fab({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" className="ht-fab" aria-label={label} onClick={onClick}>
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
        <path
          d="M12 5v14M5 12h14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </button>
  )
}
