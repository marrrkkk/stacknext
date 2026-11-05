import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'

const BUBBLE_ID = 'stacknext-ui-tooltip'
const SHOW_DELAY = 120
const HIDE_DELAY = 60
const VIEWPORT_MARGIN = 12
const TRIGGER_GAP = 8

interface TooltipState {
  text: string
  target: Element
}

interface TooltipPosition {
  left: number
  top: number
  side: 'top' | 'bottom'
}

function findTitleElement(node: EventTarget | null): Element | null {
  if (!(node instanceof Element)) return null
  const element = node.closest('[title]')
  if (!element) return null
  return element.getAttribute('title')?.trim() ? element : null
}

function isInside(element: Element, node: EventTarget | null): boolean {
  return node instanceof Node && element.contains(node)
}

/**
 * Turns every native `title` attribute into the dashboard tooltip surface.
 *
 * The title is removed as soon as a pointer or focus enters the trigger, which
 * suppresses the browser tooltip, then restored when the tooltip closes. This
 * keeps existing call sites and their accessibility fallback intact.
 */
export function TooltipLayer(): React.ReactElement | null {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [position, setPosition] = useState<TooltipPosition | null>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<Element | null>(null)
  const titleRef = useRef<string | null>(null)
  const describedByRef = useRef<string | null>(null)
  const showTimerRef = useRef<number | null>(null)
  const hideTimerRef = useRef<number | null>(null)
  const pendingTextRef = useRef<string | null>(null)
  const titleObserverRef = useRef<MutationObserver | null>(null)

  const clearTimers = useCallback(() => {
    if (showTimerRef.current !== null) {
      window.clearTimeout(showTimerRef.current)
      showTimerRef.current = null
    }
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  const restore = useCallback(() => {
    titleObserverRef.current?.disconnect()
    const element = activeRef.current
    if (element) {
      if (titleRef.current !== null && element.isConnected) {
        element.setAttribute('title', titleRef.current)
      }
      if (describedByRef.current === null) {
        element.removeAttribute('aria-describedby')
      } else {
        element.setAttribute('aria-describedby', describedByRef.current)
      }
    }
    activeRef.current = null
    titleRef.current = null
    describedByRef.current = null
    pendingTextRef.current = null
    setTooltip(null)
    setPosition(null)
  }, [])

  const hide = useCallback(() => {
    clearTimers()
    restore()
  }, [clearTimers, restore])

  const capture = useCallback(
    (element: Element): string | null => {
      if (activeRef.current === element) return null
      const title = element.getAttribute('title')?.trim()
      if (!title) return null

      restore()
      activeRef.current = element
      titleRef.current = element.getAttribute('title')
      describedByRef.current = element.getAttribute('aria-describedby')
      element.removeAttribute('title')
      element.setAttribute(
        'aria-describedby',
        describedByRef.current
          ? `${describedByRef.current} ${BUBBLE_ID}`
          : BUBBLE_ID,
      )

      if (typeof MutationObserver !== 'undefined') {
        if (!titleObserverRef.current) {
          titleObserverRef.current = new MutationObserver(() => {
            const active = activeRef.current
            if (!active) return
            const next = active.getAttribute('title')
            if (next === null) return
            titleRef.current = next
            pendingTextRef.current = next.trim()
            active.removeAttribute('title')
            setTooltip((current) =>
              current && current.target === active
                ? { text: next.trim(), target: active }
                : current,
            )
          })
        }
        titleObserverRef.current.disconnect()
        titleObserverRef.current.observe(element, {
          attributes: true,
          attributeFilter: ['title'],
        })
      }

      return title
    },
    [restore],
  )

  const arm = useCallback(
    (element: Element) => {
      if (activeRef.current === element) return
      clearTimers()
      const title = capture(element)
      if (!title) return
      pendingTextRef.current = title
      showTimerRef.current = window.setTimeout(() => {
        showTimerRef.current = null
        if (
          activeRef.current !== element ||
          pendingTextRef.current === null ||
          !element.isConnected
        ) {
          return
        }
        setTooltip({ text: pendingTextRef.current, target: element })
      }, SHOW_DELAY)
    },
    [capture, clearTimers],
  )

  const showNow = useCallback(
    (element: Element) => {
      if (activeRef.current === element) {
        if (titleRef.current) {
          setTooltip({ text: titleRef.current, target: element })
        }
        return
      }
      clearTimers()
      const title = capture(element)
      if (title) setTooltip({ text: title, target: element })
    },
    [capture, clearTimers],
  )

  useEffect(() => {
    const onPointerOver = (event: PointerEvent): void => {
      if (event.pointerType === 'touch') return
      const active = activeRef.current
      if (active && isInside(active, event.target)) {
        if (hideTimerRef.current !== null) {
          window.clearTimeout(hideTimerRef.current)
          hideTimerRef.current = null
        }
        showNow(active)
        return
      }
      const element = findTitleElement(event.target)
      if (!element) return
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
      arm(element)
    }

    const onPointerOut = (event: PointerEvent): void => {
      const active = activeRef.current
      if (!active || isInside(active, event.relatedTarget)) return
      const focused = document.activeElement
      if (focused && isInside(active, focused)) return
      if (showTimerRef.current !== null) {
        window.clearTimeout(showTimerRef.current)
        showTimerRef.current = null
      }
      hideTimerRef.current = window.setTimeout(() => {
        hideTimerRef.current = null
        hide()
      }, HIDE_DELAY)
    }

    const onFocusIn = (event: FocusEvent): void => {
      const element = findTitleElement(event.target)
      if (element) showNow(element)
    }

    const onFocusOut = (event: FocusEvent): void => {
      const active = activeRef.current
      if (!active || isInside(active, event.relatedTarget)) return
      hide()
    }

    const onScroll = (): void => hide()
    const onResize = (): void => hide()
    const onPointerDown = (): void => hide()
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') hide()
    }

    document.addEventListener('pointerover', onPointerOver, true)
    document.addEventListener('pointerout', onPointerOut, true)
    document.addEventListener('focusin', onFocusIn, true)
    document.addEventListener('focusout', onFocusOut, true)
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)

    return () => {
      clearTimers()
      document.removeEventListener('pointerover', onPointerOver, true)
      document.removeEventListener('pointerout', onPointerOut, true)
      document.removeEventListener('focusin', onFocusIn, true)
      document.removeEventListener('focusout', onFocusOut, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
      restore()
    }
  }, [arm, clearTimers, hide, restore, showNow])

  useLayoutEffect(() => {
    if (!tooltip) return
    const target = activeRef.current
    const bubble = bubbleRef.current
    if (!target || !target.isConnected || !bubble) return

    const targetRect = target.getBoundingClientRect()
    const width = bubble.offsetWidth
    const height = bubble.offsetHeight
    const spaceAbove = targetRect.top - VIEWPORT_MARGIN
    const spaceBelow = window.innerHeight - targetRect.bottom - VIEWPORT_MARGIN
    let side: TooltipPosition['side'] = 'top'

    if (spaceAbove < height + TRIGGER_GAP) {
      side = spaceBelow >= height + TRIGGER_GAP ? 'bottom' : 'top'
    }
    if (
      side === 'bottom' &&
      spaceBelow < height + TRIGGER_GAP &&
      spaceAbove >= height + TRIGGER_GAP
    ) {
      side = 'top'
    }

    const maxLeft = Math.max(
      VIEWPORT_MARGIN,
      window.innerWidth - width - VIEWPORT_MARGIN,
    )
    const left = Math.min(
      Math.max(
        VIEWPORT_MARGIN,
        targetRect.left + targetRect.width / 2 - width / 2,
      ),
      maxLeft,
    )
    const top =
      side === 'top'
        ? targetRect.top - height - TRIGGER_GAP
        : targetRect.bottom + TRIGGER_GAP

    setPosition({
      left,
      top: Math.min(
        Math.max(VIEWPORT_MARGIN, top),
        Math.max(VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN),
      ),
      side,
    })
  }, [tooltip])

  if (!tooltip) return null

  return createPortal(
    <div
      ref={bubbleRef}
      id={BUBBLE_ID}
      role="tooltip"
      className="global-tooltip"
      data-side={position?.side ?? 'top'}
      data-visible={position ? 'true' : 'false'}
      style={position ? { left: position.left, top: position.top } : undefined}
    >
      {tooltip.text}
    </div>,
    document.body,
  )
}
