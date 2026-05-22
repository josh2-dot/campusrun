interface ConfirmSheetProps {
  title: string
  body: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmSheet({ title, body, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, onConfirm, onCancel }: ConfirmSheetProps) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="confirm-sheet-title" style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 430, background: 'var(--bg-1, #1A1917)', borderTop: '1px solid var(--line, #2A2825)', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: '20px 20px 28px' }}>
        <div aria-hidden="true" style={{ width: 36, height: 4, background: 'var(--line, #2A2825)', borderRadius: 2, margin: '0 auto 16px' }} />
        <p id="confirm-sheet-title" className="font-display" style={{ fontSize: 18, margin: 0, color: 'white' }}>{title}</p>
        <p style={{ fontSize: 13, color: 'var(--ink-2, #A09A8E)', fontWeight: 500, margin: '6px 0 18px', lineHeight: 1.5 }}>{body}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} className="press" style={{ flex: 1, background: 'var(--bg-2, #26241F)', color: 'white', fontWeight: 800, fontSize: 14, padding: 14, borderRadius: 12, border: '1px solid var(--line, #2A2825)', cursor: 'pointer', fontFamily: 'inherit' }}>{cancelLabel}</button>
          <button onClick={onConfirm} className="press" style={{ flex: 1, background: danger ? 'var(--danger, #FF3B30)' : 'var(--accent, #FF6B2B)', color: 'white', fontWeight: 800, fontSize: 14, padding: 14, borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
