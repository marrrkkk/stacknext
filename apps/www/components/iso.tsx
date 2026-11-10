import type { CSSProperties, ReactElement, ReactNode } from 'react'

export const floorPath = (() => {
  const lines: string[] = []
  for (let offset = -624; offset <= 624; offset += 24) {
    lines.push(`M -624 ${offset} H 624`, `M ${offset} -624 V 624`)
  }
  return lines.join(' ')
})()

export function brandStyle(brand?: string): CSSProperties | undefined {
  return brand ? ({ '--brand': brand } as CSSProperties) : undefined
}

export function isoMatrix(origin = 160, center = 500): string {
  return `matrix(0.8660254 0.5 -0.8660254 0.5 ${center} ${origin})`
}

/**
 * Right vertical edge of an extruded isometric plate. Without it the side
 * face meets the top face at a dark, seemingly clipped corner.
 */
export function isoRightEdge(
  x: number,
  y: number,
  size: number,
  radius: number,
  top: number,
  rise: number,
  center = 500,
): string {
  const edgeX = center + 0.8660254 * (x + size - (y + radius))
  const edgeY = top + 0.5 * (x + size + y + radius)
  return `M ${edgeX} ${edgeY} V ${edgeY + rise}`
}

export const systemGlyphClass =
  'system-glyph fill-current text-ink-2 transition-[color] duration-300'

export const systemLogoClass = 'system-logo transition-[fill] duration-[350ms]'

export const systemPlateClass = 'fill-[#060606] stroke-[rgba(255,255,255,0.12)]'

export const systemPinsClass = 'fill-none stroke-[rgba(255,255,255,0.16)]'

export const systemBoxClass = 'fill-none stroke-[rgba(255,255,255,0.22)]'

export const systemBoxOnClass = 'fill-[rgba(255,255,255,0.5)] stroke-none'

export const systemRowClass = 'system-row fill-none stroke-[rgba(255,255,255,0.22)]'

export function NextGlyph(): ReactElement {
  return (
    <g className={systemGlyphClass}>
      <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="4.8" r="2.2" />
        <circle cx="5.4" cy="19.2" r="2.2" />
        <circle cx="18.6" cy="19.2" r="2.2" />
        <path d="M12 7v3M12 10H5.4v7M12 10h6.6v7" />
      </g>
    </g>
  )
}

export function StackGlyph(): ReactElement {
  return (
    <path
      className={systemLogoClass}
      stroke="none"
      d="M168 34H68A34 34 0 0 0 34 68V188A34 34 0 0 0 68 222H188A34 34 0 0 0 222 188V88H194V188A6 6 0 0 1 188 194H68A6 6 0 0 1 62 188V68A6 6 0 0 1 68 62H168Z"
    />
  )
}

export function StackSquare(): ReactElement {
  return (
    <rect
      className={systemLogoClass}
      stroke="none"
      x="88"
      y="128"
      width="40"
      height="40"
      rx="6"
    />
  )
}

export function StackBadgeGlyph(): ReactElement {
  return (
    <g transform="scale(0.09375)">
      <StackGlyph />
      <StackSquare />
    </g>
  )
}

type IsoTileProps = {
  x: number
  y: number
  size?: number
  rise?: number
  origin?: number
  center?: number
  brand?: string
  children: ReactNode
}

export function IsoTile({
  x,
  y,
  size = 44,
  rise = 10,
  origin = 160,
  center = 500,
  brand,
  children,
}: IsoTileProps): ReactElement {
  const radius = (size * 7) / 44
  const plateInset = (size * 6) / 44
  const plateSize = size - plateInset * 2
  const plateRadius = (size * 4) / 44
  const glyphSize = (size * 20) / 44
  const glyphInset = (size - glyphSize) / 2

  return (
    <g style={brandStyle(brand)}>
      <rect
        x={x}
        y={y}
        width={size}
        height={size}
        rx={radius}
        transform={isoMatrix(origin, center)}
        fill="var(--iso-side, var(--iso-fill))"
        stroke="none"
      />
      <path
        d={`M ${x} ${y + size - radius} a ${radius} ${radius} 0 0 0 ${radius} ${radius} H ${x + size - radius} a ${radius} ${radius} 0 0 0 ${radius} -${radius} V ${y + radius}`}
        transform={isoMatrix(origin, center)}
        fill="none"
        vectorEffect="non-scaling-stroke"
      />
      <rect
        x={x}
        y={y}
        width={size}
        height={size}
        rx={radius}
        transform={isoMatrix(origin - rise, center)}
        fill="var(--top)"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={isoRightEdge(x, y, size, radius, origin - rise, rise, center)}
        fill="none"
        vectorEffect="non-scaling-stroke"
      />
      <g transform={isoMatrix(origin - rise, center)}>
        <rect
          x={x + plateInset}
          y={y + plateInset}
          width={plateSize}
          height={plateSize}
          rx={plateRadius}
          className={systemPlateClass}
          vectorEffect="non-scaling-stroke"
        />
        <g transform={`translate(${x + glyphInset} ${y + glyphInset}) scale(${glyphSize / 24})`}>
          {children}
        </g>
      </g>
    </g>
  )
}

export function IsoPacket({
  x,
  y,
  scale = 1,
  fix = false,
}: {
  x: number
  y: number
  scale?: number
  fix?: boolean
}): ReactElement {
  return (
    <g
      className={[
        'system-packet',
        fix
          ? 'fill-[var(--iso-hot)] stroke-[var(--iso-hot)]'
          : 'fill-[var(--iso-fill)] stroke-[rgba(255,255,255,0.75)]',
      ].join(' ')}
      transform={`translate(${x} ${y}) scale(${scale})`}
    >
      <path
        d="M -11.2583302 0 L 0 6.5 L 11.2583302 0 L 11.2583302 -7 L 0 -13.5 L -11.2583302 -7 Z M -11.2583302 -7 L 0 -0.5 L 11.2583302 -7 M 0 6.5 V -0.5"
        vectorEffect="non-scaling-stroke"
      />
    </g>
  )
}
