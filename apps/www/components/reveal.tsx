'use client'

import { useEffect } from 'react'

export function RevealProvider(): null {
  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'))
    if (elements.length === 0) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced || !('IntersectionObserver' in window)) {
      for (const element of elements) element.dataset.revealState = 'visible'
      return
    }

    for (const element of elements) element.dataset.revealState = 'pending'

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const element = entry.target as HTMLElement
          element.dataset.revealState = 'visible'
          observer.unobserve(element)
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    )

    for (const element of elements) observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return null
}
