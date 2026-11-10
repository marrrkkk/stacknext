import type { ReactElement, ReactNode } from 'react'
import { CheckIcon } from './icons'
import {
  floorPath,
  IsoPacket,
  IsoTile,
  isoMatrix,
  NextGlyph,
  StackBadgeGlyph,
  StackGlyph,
  StackSquare,
  systemGlyphClass,
} from './iso'
import {
  diagramArrowheadClass,
  diagramCheckClass,
  diagramChipClass,
  diagramDotClass,
  diagramDotLiveClass,
  diagramFlowPathClass,
  diagramLabelClass,
  diagramLineFaintClass,
  diagramPanelClass,
  diagramPanelVerifiedClass,
  diagramSmallClass,
  diagramSmallHotClass,
  diagramSmallLiveClass,
  privacyBoundaryClass,
  privacyCloudClass,
  privacyCloudSideClass,
  privacyCloudSlashCaseClass,
  privacyCloudSlashClass,
  privacyFigureClass,
  privacyFloorClass,
  privacyMapClass,
  privacyPlanClass,
  privacyRuleClass,
  privacyShieldClass,
  privacyStagePadClass,
  privacyTraceClass,
  regressionDiagramClass,
  systemFigureTopClass,
  systemFigureTopLabelClass,
  systemFloorClass,
  systemGlyphIconClass,
  systemHitClass,
  systemMapClass,
  systemNodeClass,
  systemNodeFnsClass,
  systemNodeHeadClass,
  systemNodeItemClass,
  systemNodeListClass,
  systemNodeListTextClass,
  systemNodeRow2Class,
  systemNodeTitleClass,
  systemNodeTitleIconClass,
  systemPartClass,
  systemSchematicClass,
  systemSecClass,
  systemStageClass,
  systemSvgClass,
  systemTextClass,
  systemWireClass,
  systemWireDotClass,
} from './styles'

function DotGrid({ id }: { id: string }): ReactElement {
  return (
    <defs>
      <pattern id={id} width="18" height="18" patternUnits="userSpaceOnUse">
        <circle cx="1" cy="1" r="1" fill="rgba(255,255,255,.13)" />
      </pattern>
    </defs>
  )
}

function ArrowHead({ x, y, direction = 'right' }: { x: number; y: number; direction?: 'right' | 'down' }): ReactElement {
  if (direction === 'down') {
    return <path d={`M${x - 4} ${y - 7} L${x} ${y} L${x + 4} ${y - 7}`} className={diagramArrowheadClass} />
  }
  return <path d={`M${x - 7} ${y - 4} L${x} ${y} L${x - 7} ${y + 4}`} className={diagramArrowheadClass} />
}

export function RegressionDiagram(): ReactElement {
  return (
    <svg
      className={regressionDiagramClass}
      viewBox="0 0 720 330"
      role="img"
      aria-labelledby="regression-diagram-title regression-diagram-desc"
    >
      <title id="regression-diagram-title">Verified Playwright correlation</title>
      <desc id="regression-diagram-desc">
        A Playwright scenario injects a trace id. The collector verifies that id and a
        server span parented to it before the sample can be compared.
      </desc>
      <DotGrid id="regression-dots" />
      <rect width="720" height="330" fill="url(#regression-dots)" opacity={0.32} />

      <g>
        <rect x="22" y="58" width="218" height="208" rx="14" className={diagramPanelClass} />
        <text x="44" y="88" className={diagramLabelClass}>
          PLAYWRIGHT
        </text>
        <text x="44" y="106" className={diagramSmallClass}>
          SCENARIO
        </text>
        <path d="M44 128h174M44 146h130" className={diagramLineFaintClass} />
        <rect x="44" y="166" width="174" height="34" rx="8" className={diagramChipClass} />
        <text x="58" y="188" className={diagramSmallHotClass}>
          stacknext.scenario
        </text>
        <text x="44" y="226" className={diagramSmallClass}>
          injected trace id
        </text>
        <text x="44" y="244" className={diagramSmallClass}>
          one worker · no time window
        </text>
      </g>

      <g>
        <path d="M240 176h58" className={diagramFlowPathClass} />
        <ArrowHead x={294} y={176} />
        <text x="244" y="158" className={diagramSmallClass}>
          traceparent
        </text>
      </g>

      <g>
        <rect x="302" y="58" width="188" height="208" rx="14" className={diagramPanelClass} />
        <text x="324" y="88" className={diagramLabelClass}>
          SERVER
        </text>
        <text x="324" y="106" className={diagramSmallClass}>
          COLLECTOR
        </text>
        <path d="M324 128h144" className={diagramLineFaintClass} />
        <circle cx="334" cy="154" r="4" className={diagramDotClass} />
        <text x="346" y="158" className={diagramSmallClass}>
          injected span
        </text>
        <path d="M340 150v22h8" className={diagramLineFaintClass} />
        <circle cx="352" cy="178" r="4" className={diagramDotLiveClass} />
        <text x="364" y="182" className={diagramSmallClass}>
          server span
        </text>
        <text x="324" y="218" className={diagramSmallClass}>
          parent id matches
        </text>
        <text x="324" y="236" className={diagramSmallClass}>
          else: incomplete
        </text>
      </g>

      <g>
        <path d="M490 176h54" className={diagramFlowPathClass} />
        <ArrowHead x={540} y={176} />
      </g>

      <g>
        <rect x="548" y="96" width="150" height="132" rx="14" className={diagramPanelVerifiedClass} />
        <circle cx="590" cy="136" r="16" className={diagramCheckClass} />
        <CheckIcon x={580} y={126} width={20} height={20} className="text-live" />
        <text x="614" y="141" className={diagramLabelClass}>
          VERIFIED
        </text>
        <text x="568" y="174" className={diagramSmallClass}>
          comparison eligible
        </text>
        <text x="568" y="192" className={diagramSmallClass}>
          report-only
        </text>
        <text x="568" y="210" className={diagramSmallClass}>
          --fail-on is the gate
        </text>
      </g>

      <text x="22" y="306" className={diagramSmallClass}>
        FIG. 0.5
      </text>
      <text x="698" y="306" textAnchor="end" className={diagramSmallLiveClass}>
        ● EVIDENCE, NOT A GUESS
      </text>
    </svg>
  )
}

function PrivacyLockGlyph(): ReactElement {
  return (
    <g className={systemGlyphClass}>
      <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="10" width="14" height="11" rx="2.5" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
      </g>
    </g>
  )
}

const CLOUD_SILHOUETTE =
  'M2.25 15a4.5 4.5 0 0 0 4.5 4.5H18a3.75 3.75 0 0 0 1.332-7.257 3 3 0 0 0-3.758-3.848 5.25 5.25 0 0 0-10.233 2.33A4.502 4.502 0 0 0 2.25 15Z'

function PrivacyCloudGlyph(): ReactElement {
  return (
    <g className={systemGlyphClass}>
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d={CLOUD_SILHOUETTE} />
        <path d="m3 3 18 18" />
      </g>
    </g>
  )
}

function PrivacyGlyphBox({
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

function PrivacySchematic(): ReactElement {
  return (
    <div className={systemSchematicClass} aria-hidden="true">
      <div className={systemNodeClass}>
        <div className={systemSecClass}>
          <p className={systemNodeHeadClass}>Your machine</p>
          <p className={systemNodeTitleClass}>
            <PrivacyGlyphBox className={systemNodeTitleIconClass}>
              <PrivacyLockGlyph />
            </PrivacyGlyphBox>
            Loopback boundary
          </p>
          <ul className={systemNodeRow2Class}>
            <li className={systemNodeItemClass}>
              <PrivacyGlyphBox className={systemGlyphIconClass}>
                <NextGlyph />
              </PrivacyGlyphBox>
              Next.js app
            </li>
            <li className={systemNodeItemClass}>
              <PrivacyGlyphBox viewBox="0 0 256 256" className={systemGlyphIconClass}>
                <StackGlyph />
                <StackSquare />
              </PrivacyGlyphBox>
              Collector
            </li>
          </ul>
          <p className={systemNodeFnsClass}>127.0.0.1:4400 · token 0600</p>
        </div>
        <div className={systemSecClass}>
          <p className={systemNodeHeadClass}>Never captured</p>
          <ul className={systemNodeListClass}>
            <li className={systemNodeListTextClass}>Bodies · headers · cookies</li>
            <li className={systemNodeListTextClass}>Query values · SQL params</li>
          </ul>
        </div>
      </div>
      <span className={systemWireClass} data-k="in">
        <i className={systemWireDotClass} />
      </span>
      <div className={systemNodeClass}>
        <p className={systemNodeTitleClass}>
          <PrivacyGlyphBox className={systemNodeTitleIconClass}>
            <PrivacyCloudGlyph />
          </PrivacyGlyphBox>
          No outbound telemetry
        </p>
        <p className={systemNodeFnsClass}>
          <span>No cloud</span> · <span>no account</span>
          <br />
          <span>No analytics</span> · <span>no AI API</span>
        </p>
      </div>
    </div>
  )
}

export function PrivacyBoundary(): ReactElement {
  return (
    <figure className={privacyFigureClass}>
      <div className={systemFigureTopClass}>
        <span>Fig 0.6</span>
        <span className={systemFigureTopLabelClass}>Privacy</span>
      </div>
      <div className={`${systemStageClass} ${privacyStagePadClass}`}>
        <div className={privacyPlanClass}>
          <svg
            className={`${systemMapClass} ${privacyMapClass} ${systemSvgClass}`}
            viewBox="0 0 760 460"
            role="img"
            aria-labelledby="privacy-map-title privacy-map-desc"
            fill="none"
            stroke="var(--iso-ink)"
            strokeWidth={1}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <title id="privacy-map-title">Local data boundary</title>
            <desc id="privacy-map-desc">
              Your Next.js app and the StackNext collector sit inside a loopback boundary on
              your machine. Spans, queries and errors travel to 127.0.0.1:4400 with a bearer
              token. Bodies, headers, cookies, query values and SQL bind parameters are never
              captured. No telemetry leaves the machine.
            </desc>
            <defs>
              <clipPath id="privacy-boundary-clip">
                <rect x="30" y="80" width="510" height="340" rx="24" />
              </clipPath>
            </defs>

            <g clipPath="url(#privacy-boundary-clip)">
              <path
                d={floorPath}
                transform={isoMatrix(300, 285)}
                className={`${systemFloorClass} ${privacyFloorClass}`}
                vectorEffect="non-scaling-stroke"
              />
            </g>

            <rect
              x="30"
              y="80"
              width="510"
              height="340"
              rx="24"
              className={privacyBoundaryClass}
              data-privacy-boundary
              vectorEffect="non-scaling-stroke"
            />

            <text x="44" y="46" className={systemTextClass.head}>
              Your machine
            </text>
            <text x="44" y="66" className={systemTextClass.fn}>
              Loopback boundary
            </text>

            <g>
              <path
                d="M 232.7 233 C 268 233 312 229 347.3 229"
                className={privacyTraceClass}
                data-privacy-trace
                vectorEffect="non-scaling-stroke"
              />
              <IsoPacket x={272} y={232.3} scale={0.55} />
              <IsoPacket x={316} y={230.1} scale={0.55} />
            </g>
            <text x="290" y="207" textAnchor="middle" className={systemTextClass.fn}>
              Bearer token
            </text>
            <text x="290" y="260" textAnchor="middle" className={systemTextClass.fn}>
              Loopback only
            </text>

            <g className={systemPartClass} data-part="app">
              <rect x="60" y="118" width="200" height="192" className={systemHitClass} />
              <text x="160" y="146" textAnchor="middle" className={systemTextClass.name}>
                Your app
              </text>
              <text x="160" y="168" textAnchor="middle" className={systemTextClass.sub}>
                Next.js · Drizzle · Prisma
              </text>
              <IsoTile
                x={-42}
                y={-42}
                size={84}
                rise={12}
                origin={245}
                center={160}
                brand="#ffffff"
              >
                <NextGlyph />
              </IsoTile>
            </g>

            <g className={systemPartClass} data-part="collector">
              <rect x="320" y="150" width="200" height="210" className={systemHitClass} />
              <IsoTile
                x={-42}
                y={-42}
                size={84}
                rise={16}
                origin={245}
                center={420}
                brand="#ffffff"
              >
                <StackBadgeGlyph />
              </IsoTile>
              <text x="420" y="316" textAnchor="middle" className={systemTextClass.name}>
                Collector
              </text>
              <text x="420" y="340" textAnchor="middle" className={systemTextClass.sub}>
                127.0.0.1:4400 · token 0600
              </text>
            </g>

            <g className={systemPartClass} data-part="cloud">
              <rect x="566" y="150" width="184" height="236" className={systemHitClass} />
              <g transform="translate(592 175.09) scale(6)">
                <path
                  d={CLOUD_SILHOUETTE}
                  className={privacyCloudSideClass}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
              <g transform="translate(592 157.09) scale(6)">
                <path
                  d={CLOUD_SILHOUETTE}
                  className={privacyCloudClass}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
              <path d="M 611 195 L 717 289" className={privacyCloudSlashCaseClass} vectorEffect="non-scaling-stroke" />
              <path
                d="M 611 195 L 717 289"
                className={privacyCloudSlashClass}
                data-cloud-slash
                vectorEffect="non-scaling-stroke"
              />
              <text x="664" y="316" textAnchor="middle" className={systemTextClass.name}>
                No outbound telemetry
              </text>
              <text x="664" y="342" textAnchor="middle" className={systemTextClass.sub}>
                No cloud · no account
              </text>
              <text x="664" y="364" textAnchor="middle" className={systemTextClass.sub}>
                No AI API · no analytics
              </text>
            </g>

            <g className={systemPartClass} data-part="redaction">
              <rect x="36" y="360" width="498" height="54" className={systemHitClass} />
              <path d="M48 356 H 522" className={privacyRuleClass} vectorEffect="non-scaling-stroke" />
              <g className={privacyShieldClass} transform="translate(48 370)">
                <path d="M9 0 18 4v7c0 6-4 10-9 13-5-3-9-7-9-13V4Z" vectorEffect="non-scaling-stroke" />
                <path d="m5.2 11.4 2.6 2.6 4.8-5.2" vectorEffect="non-scaling-stroke" />
              </g>
              <text x="78" y="386" className={systemTextClass.fn}>
                No bodies · headers · cookies
              </text>
              <text x="78" y="408" className={systemTextClass.fn}>
                No query values · SQL bind parameters
              </text>
            </g>
          </svg>
        </div>
        <PrivacySchematic />
      </div>
    </figure>
  )
}
