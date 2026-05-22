import { useEffect, useRef } from 'react'
import { Crepe } from '@milkdown/crepe'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'

interface EditorProps {
  value: string
  onChange: (v: string) => void
}

/**
 * Milkdown Crepe editor.
 *
 * The instance is created once with the initial value and is the source of
 * truth thereafter. Parent value updates from a *new document load* trigger a
 * full remount via the `key` prop in the caller — we deliberately do NOT
 * reconcile external value changes here, because that would break the editor's
 * cursor state on every keystroke.
 */
export function Editor({ value, onChange }: EditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const crepeRef = useRef<Crepe | null>(null)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  })

  useEffect(() => {
    if (!hostRef.current) return

    const crepe = new Crepe({
      root: hostRef.current,
      defaultValue: value,
    })

    crepeRef.current = crepe

    crepe.create().then(() => {
      crepe.on((listener) => {
        listener.markdownUpdated((_ctx, markdown) => {
          onChangeRef.current(markdown)
        })
      })
    })

    return () => {
      crepe.destroy()
      crepeRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="h-full overflow-y-auto">
      <div className="writing-surface">
        <div ref={hostRef} />
      </div>
    </div>
  )
}
