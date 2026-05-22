import { useEffect, useState } from 'react'

interface ScrollToTopProps {
  scroller: HTMLElement | null
}

export function ScrollToTop({ scroller }: ScrollToTopProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!scroller) return
    function onScroll() {
      setVisible(scroller!.scrollTop > 200)
    }
    scroller.addEventListener('scroll', onScroll)
    onScroll()
    return () => scroller.removeEventListener('scroll', onScroll)
  }, [scroller])

  if (!visible) return null

  return (
    <button
      className="scroll-to-top"
      onClick={() => scroller?.scrollTo({ top: 0, behavior: 'smooth' })}
      title="Back to top"
    >
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="5,10 9,5 13,10" />
        <line x1="9" y1="14" x2="9" y2="5" />
      </svg>
    </button>
  )
}
