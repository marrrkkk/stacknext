import type { ReactElement, ReactNode } from 'react'
import {
  brandStyle,
  floorPath,
  IsoPacket,
  IsoTile,
  isoMatrix,
  isoRightEdge,
  NextGlyph,
  StackGlyph,
  StackSquare,
  systemBoxClass,
  systemBoxOnClass,
  systemGlyphClass,
  systemPinsClass,
  systemRowClass,
} from './iso'
import {
  systemArrowClass,
  systemDotClass,
  systemFigureClass,
  systemFigureTopClass,
  systemFigureTopLabelClass,
  systemFloorClass,
  systemGlyphIconClass,
  systemHitClass,
  systemLaneClass,
  systemLaneTextClass,
  systemLanesClass,
  systemListClass,
  systemLiveClass,
  systemMapClass,
  systemNodeClass,
  systemNodeFnsClass,
  systemNodeHeadClass,
  systemNodeItemClass,
  systemNodeListClass,
  systemNodeListTextClass,
  systemNodeRow2Class,
  systemNodeSubItemClass,
  systemNodeTitleClass,
  systemNodeTitleIconClass,
  systemPartClass,
  systemPlanClass,
  systemSchematicClass,
  systemSecClass,
  systemSplitClass,
  systemStageClass,
  systemStagePadClass,
  systemSvgClass,
  systemTextClass,
  systemTraceClass,
  systemWireClass,
  systemWireDotClass,
  systemWireLaneClass,
} from './styles'

const traceIn = [
  'M 248.1051176 88 H 280 C 337.5 88 337.5 166.72 395 166.72 H 414.644536576',
  'M 248.1051176 160 H 280 C 337.5 160 337.5 176.8 395 176.8 H 432.10360864',
  'M 248.1051176 232 H 280 C 337.5 232 337.5 186.88 395 186.88 H 449.562680704',
  'M 248.1051176 350 H 280 C 337.5 350 337.5 196.96 395 196.96 H 467.021752768',
] as const

const traceOut = [
  'M 585.3554634239999 166.72 H 610 C 665 166.72 665 88 720 88 H 751.8948824',
  'M 567.89639136 176.8 H 610 C 665 176.8 665 160 720 160 H 751.8948824',
  'M 550.4373192959999 186.88 H 610 C 665 186.88 665 232 720 232 H 751.8948824',
] as const

function DrizzleGlyph(): ReactElement {
  return (
    <g className={systemGlyphClass}>
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5.4" rx="7" ry="2.9" />
        <path d="M5 5.4v13.2c0 1.6 3.1 2.9 7 2.9s7-1.3 7-2.9V5.4" />
        <path d="M5 9.8c0 1.6 3.1 2.9 7 2.9s7-1.3 7-2.9M5 14.2c0 1.6 3.1 2.9 7 2.9s7-1.3 7-2.9" />
      </g>
    </g>
  )
}

function PrismaGlyph(): ReactElement {
  return (
    <g className={systemGlyphClass}>
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
        <path d="M13.4 2.5 21.2 18a1.5 1.5 0 0 1-1.3 2.2H4.1A1.5 1.5 0 0 1 2.8 18L10.6 2.5a1.6 1.6 0 0 1 2.8 0Z" />
        <path d="m9.7 7.2 6.9 13" />
      </g>
    </g>
  )
}

function RequestGlyph(): ReactElement {
  return (
    <g className={systemGlyphClass}>
      <path
        d="M2 12h4.1l2.4-6.2L13 18.4l2.5-6.4H22"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  )
}

function DashboardGlyph(): ReactElement {
  return (
    <g className={systemGlyphClass}>
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
        <rect x="3" y="3" width="7.4" height="7.4" rx="1.4" />
        <rect x="13.6" y="3" width="7.4" height="7.4" rx="1.4" />
        <rect x="3" y="13.6" width="7.4" height="7.4" rx="1.4" />
        <rect x="13.6" y="13.6" width="7.4" height="7.4" rx="1.4" />
      </g>
    </g>
  )
}

function TerminalGlyph(): ReactElement {
  return (
    <g className={systemGlyphClass}>
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2.4" y="3.8" width="19.2" height="16.4" rx="2.4" />
        <path d="m6.6 8.4 3.2 3.6-3.2 3.6M13.4 15.6h4.2" />
      </g>
    </g>
  )
}

function McpGlyph(): ReactElement {
  return (
    <g className={systemGlyphClass}>
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <circle cx="5.4" cy="12" r="2.4" />
        <circle cx="18.6" cy="6.4" r="2.4" />
        <circle cx="18.6" cy="17.6" r="2.4" />
        <path d="m7.6 10.9 8.8-3.4M7.6 13.1l8.8 3.4" />
      </g>
    </g>
  )
}

function IsoCore(): ReactElement {
  const baseSize = 112
  const baseRadius = 10

  const plateSize = 76
  const plateRadius = 7
  const plateX = -38
  const plateY = -38

  return (
    <>
      <g>
        <rect
          x="-56"
          y="-56"
          width={baseSize}
          height={baseSize}
          rx={baseRadius}
          transform={isoMatrix(160)}
          fill="var(--iso-side, var(--iso-fill))"
          stroke="none"
        />
        <path
          d="M -56 46 a 10 10 0 0 0 10 10 H 46 a 10 10 0 0 0 10 -10 V -46"
          transform={isoMatrix(160)}
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
        <rect
          x="-56"
          y="-56"
          width={baseSize}
          height={baseSize}
          rx={baseRadius}
          transform={isoMatrix(153)}
          fill="var(--top)"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={isoRightEdge(-56, -56, baseSize, baseRadius, 153, 7)}
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
        <g transform={isoMatrix(153)}>
          <path
            d="M -22 42 v 5 M -22 -42 v -5 M 42 -22 h 5 M -42 -22 h -5 M -11 42 v 5 M -11 -42 v -5 M 42 -11 h 5 M -42 -11 h -5 M 0 42 v 5 M 0 -42 v -5 M 42 0 h 5 M -42 0 h -5 M 11 42 v 5 M 11 -42 v -5 M 42 11 h 5 M -42 11 h -5 M 22 42 v 5 M 22 -42 v -5 M 42 22 h 5 M -42 22 h -5"
            className={systemPinsClass}
            vectorEffect="non-scaling-stroke"
          />
        </g>
      </g>
      <g>
        <rect
          x={plateX}
          y={plateY}
          width={plateSize}
          height={plateSize}
          rx={plateRadius}
          transform={isoMatrix(153)}
          fill="var(--iso-side, var(--iso-fill))"
          stroke="none"
        />
        <path
          d="M -38 31 a 7 7 0 0 0 7 7 H 31 a 7 7 0 0 0 7 -7 V -31"
          transform={isoMatrix(153)}
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
        <rect
          x={plateX}
          y={plateY}
          width={plateSize}
          height={plateSize}
          rx={plateRadius}
          transform={isoMatrix(141)}
          fill="var(--top)"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={isoRightEdge(plateX, plateY, plateSize, plateRadius, 141, 12)}
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
        <g transform={isoMatrix(141)}>
          <g transform="translate(-16.64 -16.64) scale(0.13)">
            <StackGlyph />
            <StackSquare />
          </g>
        </g>
      </g>
    </>
  )
}

function SamplePlate(): ReactElement {
  const x = 157
  const y = 157
  const size = 116
  const radius = 12

  return (
    <>
      <g>
        <rect
          x={x}
          y={y}
          width={size}
          height={size}
          rx={radius}
          transform={isoMatrix(160)}
          fill="var(--iso-side, var(--iso-fill))"
          stroke="none"
        />
        <path
          d="M 157 261 a 12 12 0 0 0 12 12 H 261 a 12 12 0 0 0 12 -12 V 169"
          transform={isoMatrix(160)}
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
        <rect x={x} y={y} width={size} height={size} rx={radius} transform={isoMatrix(150)} fill="var(--top)" vectorEffect="non-scaling-stroke" />
        <path
          d={isoRightEdge(x, y, size, radius, 150, 10)}
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
        <g transform={isoMatrix(150)}>
          <rect x="166" y="166" width="98" height="98" rx="6" className={systemPinsClass} vectorEffect="non-scaling-stroke" />
          <g>
            <rect x="175" y="182" width="6" height="6" rx="1" className={systemBoxOnClass} vectorEffect="non-scaling-stroke" />
            <path d="M 187 185 h 58" className={systemRowClass} vectorEffect="non-scaling-stroke" />
          </g>
          <g>
            <rect x="175" y="197" width="6" height="6" rx="1" className={systemBoxClass} vectorEffect="non-scaling-stroke" />
            <path d="M 187 200 h 40" className={systemRowClass} vectorEffect="non-scaling-stroke" />
          </g>
          <g>
            <rect x="175" y="212" width="6" height="6" rx="1" className={systemBoxOnClass} vectorEffect="non-scaling-stroke" />
            <path d="M 187 215 h 66" className={systemRowClass} vectorEffect="non-scaling-stroke" />
          </g>
          <g>
            <rect x="175" y="227" width="6" height="6" rx="1" className={systemBoxClass} vectorEffect="non-scaling-stroke" />
            <path d="M 187 230 h 34" className={systemRowClass} vectorEffect="non-scaling-stroke" />
          </g>
          <g>
            <rect x="175" y="242" width="6" height="6" rx="1" className={systemBoxOnClass} vectorEffect="non-scaling-stroke" />
            <path d="M 187 245 h 50" className={systemRowClass} vectorEffect="non-scaling-stroke" />
          </g>
        </g>
      </g>
    </>
  )
}

function GlyphIcon({
  children,
  viewBox = '0 0 24 24',
  className,
}: {
  children: ReactNode
  viewBox?: string
  className?: string
}): ReactElement {
  return (
    <svg viewBox={viewBox} className={className} aria-hidden="true" focusable="false">
      {children}
    </svg>
  )
}

function Schematic(): ReactElement {
  return (
    <div className={systemSchematicClass} aria-hidden="true">
      <div className={systemNodeClass}>
        <div className={systemSecClass}>
          <p className={systemNodeHeadClass}>Your app</p>
          <ul className={systemNodeRow2Class}>
            <li className={systemNodeItemClass}>
              <GlyphIcon className={systemGlyphIconClass}>
                <NextGlyph />
              </GlyphIcon>
              Next.js
            </li>
            <li className={systemNodeItemClass}>
              <GlyphIcon className={systemGlyphIconClass}>
                <DrizzleGlyph />
              </GlyphIcon>
              Drizzle
            </li>
            <li className={systemNodeItemClass}>
              <GlyphIcon className={systemGlyphIconClass}>
                <PrismaGlyph />
              </GlyphIcon>
              Prisma
            </li>
            <li className={systemNodeSubItemClass}>plus custom spans</li>
          </ul>
        </div>
        <div className={systemSecClass}>
          <p className={systemNodeHeadClass}>Signals</p>
          <ul className={systemNodeRow2Class}>
            <li className={systemNodeItemClass}>
              <GlyphIcon className={systemGlyphIconClass}>
                <RequestGlyph />
              </GlyphIcon>
              Every request
            </li>
            <li className={systemNodeSubItemClass}>spans · queries · errors</li>
          </ul>
        </div>
      </div>
      <span className={systemWireClass} data-k="in">
        <i className={systemWireDotClass} />
      </span>
      <div className={systemNodeClass}>
        <p className={systemNodeTitleClass}>
          <GlyphIcon viewBox="0 0 256 256" className={systemNodeTitleIconClass}>
            <g className={systemGlyphClass}>
              <StackGlyph />
              <StackSquare />
            </g>
          </GlyphIcon>
          StackNext
        </p>
        <p className={systemNodeFnsClass}>
          <span>One process</span>
          <span>
            {' · '}
            <span>10-minute window</span>
          </span>
          <span>
            {' · '}
            <span>Rule-based findings</span>
          </span>
        </p>
      </div>
      <div className={systemSplitClass}>
        <span className={systemWireClass} data-k="out">
          <i className={systemWireDotClass} />
        </span>
        <div className={systemLanesClass}>
          <span className={systemWireLaneClass} data-k="down">
            <i className={systemWireDotClass} />
          </span>
          <span className={systemWireLaneClass} data-k="up">
            <i className={systemWireDotClass} />
          </span>
          <span className={systemLaneTextClass}>
            Live traffic ↓<br />
            Same sample ↑
          </span>
        </div>
        <div className={systemNodeClass}>
          <p className={systemNodeHeadClass}>Readers</p>
          <ul className={systemListClass}>
            <li className={systemNodeItemClass} style={brandStyle('#4ade80')}>
              <GlyphIcon className={systemGlyphIconClass}>
                <DashboardGlyph />
              </GlyphIcon>
              Dashboard
            </li>
            <li className={systemNodeItemClass}>
              <GlyphIcon className={systemGlyphIconClass}>
                <TerminalGlyph />
              </GlyphIcon>
              CLI
            </li>
            <li className={systemNodeItemClass}>
              <GlyphIcon className={systemGlyphIconClass}>
                <McpGlyph />
              </GlyphIcon>
              MCP server
            </li>
          </ul>
        </div>
        <div className={systemNodeClass}>
          <p className={systemNodeTitleClass}>
            <i className={systemDotClass} />
            Local sample
          </p>
          <ul className={systemNodeListClass}>
            <li className={systemNodeListTextClass}>5,000 spans, 10 min</li>
            <li className={systemNodeListTextClass}>Rule-based findings</li>
            <li className={systemNodeListTextClass}>Read-only MCP</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export function RuntimeDiagram(): ReactElement {
  return (
    <figure className={systemFigureClass}>
      <div className={systemFigureTopClass}>
        <span>Fig 0.1</span>
        <span className={systemFigureTopLabelClass}>System</span>
      </div>
      <div className={`${systemStageClass} ${systemStagePadClass}`}>
        <div className={systemPlanClass}>
          <svg
            className={`${systemMapClass} ${systemSvgClass}`}
            viewBox="0 0 1000 456"
            role="img"
            aria-labelledby="system-map-title system-map-desc"
            fill="none"
            stroke="var(--iso-ink)"
            strokeWidth={1}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <title id="system-map-title">StackNext local runtime</title>
            <desc id="system-map-desc">
              Your Next.js app sends supported OpenTelemetry spans, Drizzle and Prisma query
              events and server errors over loopback to one collector. The collector keeps a
              fixed-size, redacted sample in memory at 127.0.0.1:4400. The dashboard, CLI and
              read-only MCP server read the same sample. No data leaves the machine.
            </desc>
            <defs>
              <radialGradient id="system-glow-bg" cx="50%" cy="50%" r="55%">
                <stop offset="0" stopColor="#fff" />
                <stop offset="0.6" stopColor="#fff" stopOpacity="0.6" />
                <stop offset="1" stopColor="#fff" stopOpacity="0" />
              </radialGradient>
              <mask id="system-glow-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="456">
                <rect width="1000" height="456" fill="url(#system-glow-bg)" />
              </mask>
            </defs>

            <g mask="url(#system-glow-mask)">
              <path d={floorPath} transform={isoMatrix(160)} className={systemFloorClass} vectorEffect="non-scaling-stroke" />
            </g>

            <g>
              {traceIn.map((path) => (
                <path key={path} d={path} className={systemTraceClass} data-trace="in" />
              ))}
              {traceOut.map((path) => (
                <path key={path} d={path} className={systemTraceClass} data-trace="out" />
              ))}
            </g>
            <path d="M 480 204.4529945657483 V 318.5470054342517" className={systemLaneClass} data-lane />
            <path d="M 520 318.5470054342517 V 204.4529945657483" className={systemLaneClass} data-lane />
            <path d="M 475 309.5470054342517 l 5 6 l 5 -6 M 515 213.4529945657483 l 5 -6 l 5 6" className={systemArrowClass} />
            <text x="466" y="266" textAnchor="end" className={systemTextClass.head}>
              Live traffic
            </text>
            <text x="534" y="266" className={systemTextClass.head}>
              Same sample
            </text>

            <g className={systemPartClass} data-part="app">
              <rect x="40" y="12" width="230" height="258" className={systemHitClass} />
              <text x="210" y="30" textAnchor="middle" className={systemTextClass.head}>
                Your app
              </text>
              <IsoTile x={-261.43157879664966} y={73.43157879664963} brand="#ffffff">
                <NextGlyph />
              </IsoTile>
              <IsoTile x={-189.43157879664963} y={145.43157879664963} brand="#c5f74f">
                <DrizzleGlyph />
              </IsoTile>
              <IsoTile x={-117.43157879664963} y={217.43157879664963} brand="#7dd3fc">
                <PrismaGlyph />
              </IsoTile>
              <text x="154" y="93" textAnchor="end" className={systemTextClass.name}>
                Next.js
              </text>
              <text x="154" y="165" textAnchor="end" className={systemTextClass.name}>
                Drizzle
              </text>
              <text x="154" y="237" textAnchor="end" className={systemTextClass.name}>
                Prisma
              </text>
              <text x="154" y="258" textAnchor="end" className={systemTextClass.sub}>
                optional adapters
              </text>
            </g>

            <g className={systemPartClass} data-part="signals">
              <rect x="30" y="280" width="240" height="110" className={systemHitClass} />
              <text x="210" y="298" textAnchor="middle" className={systemTextClass.head}>
                Signals
              </text>
              <IsoTile x={0.5684212033503684} y={335.43157879664966} brand="#ffffff">
                <RequestGlyph />
              </IsoTile>
              <text x="154" y="347" textAnchor="end" className={systemTextClass.name}>
                Every request
              </text>
              <text x="154" y="367" textAnchor="end" className={systemTextClass.sub}>
                spans · queries · errors
              </text>
            </g>

            <g className={systemPartClass} data-part="readers">
              <rect x="730" y="12" width="220" height="250" className={systemHitClass} />
              <text x="790" y="30" textAnchor="middle" className={systemTextClass.head}>
                Readers
              </text>
              <IsoTile x={73.43157879664963} y={-261.43157879664966} rise={16} brand="#4ade80">
                <DashboardGlyph />
              </IsoTile>
              <IsoTile x={145.43157879664963} y={-189.43157879664963} rise={16} brand="#ffffff">
                <TerminalGlyph />
              </IsoTile>
              <IsoTile x={217.43157879664963} y={-117.43157879664963} rise={16} brand="#ffffff">
                <McpGlyph />
              </IsoTile>
              <text x="846" y="93" className={systemTextClass.name}>
                Dashboard
              </text>
              <text x="846" y="165" className={systemTextClass.name}>
                CLI
              </text>
              <text x="846" y="237" className={systemTextClass.name}>
                MCP server
              </text>
            </g>

            <g className={systemPartClass} data-part="core">
              <rect x="330" y="12" width="340" height="210" className={systemHitClass} />
              <text x="500" y="31" textAnchor="middle" className={systemTextClass.title}>
                StackNext
              </text>
              <text x="500" y="55" textAnchor="middle" className={systemTextClass.fn}>
                One Node process
              </text>
              <IsoCore />
            </g>

            <g className={systemPartClass} data-part="sample">
              <rect x="390" y="300" width="420" height="150" className={systemHitClass} />
              <SamplePlate />
              <circle cx="642" cy="354" r="4" className={systemLiveClass} stroke="none" />
              <text x="656" y="360" className={systemTextClass.title}>
                Local sample
              </text>
              <text x="638" y="386" className={systemTextClass.fn}>
                5,000 spans, 10 minutes
              </text>
              <text x="638" y="407" className={systemTextClass.fn}>
                Rule-based findings
              </text>
              <text x="638" y="428" className={systemTextClass.fn}>
                Dashboard · CLI · MCP
              </text>
            </g>

            <IsoPacket x={303.6} y={93.4} />
            <IsoPacket x={380.2} y={200.9} />
            <IsoPacket x={591.1} y={186.9} scale={0.5} />
            <IsoPacket x={681.4} y={163.9} scale={0.5} />
            <IsoPacket x={480} y={260.5} scale={0.55} />
            <IsoPacket x={520} y={263.1} scale={0.55} fix />
          </svg>
        </div>
        <Schematic />
      </div>
    </figure>
  )
}
