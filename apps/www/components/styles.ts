/**
 * Shared Tailwind class strings.
 *
 * These are plain utility strings, not a component stylesheet: they only keep
 * repeated layout chrome (frame, section, prose) identical across routes.
 */

export const frameClass =
  'relative mx-auto w-frame border-x border-line bg-bg bg-[linear-gradient(180deg,rgba(255,255,255,0.012),transparent_520px)] max-720:w-[calc(100%_-_24px)]'

const sectionLayout = 'relative border-t border-line px-pad'
const sectionMarks =
  "before:pointer-events-none before:absolute before:-top-[5px] before:-left-[5px] before:z-[2] before:h-[9px] before:w-[9px] before:[background:linear-gradient(var(--color-ink-4),var(--color-ink-4))_center/1px_9px_no-repeat,linear-gradient(var(--color-ink-4),var(--color-ink-4))_center/9px_1px_no-repeat] before:content-[''] after:pointer-events-none after:absolute after:-top-[5px] after:-right-[5px] after:z-[2] after:h-[9px] after:w-[9px] after:[background:linear-gradient(var(--color-ink-4),var(--color-ink-4))_center/1px_9px_no-repeat,linear-gradient(var(--color-ink-4),var(--color-ink-4))_center/9px_1px_no-repeat] after:content-[''] max-720:before:hidden max-720:after:hidden"

export const sectionShellClass = `${sectionLayout} ${sectionMarks}`
export const sectionClass = `${sectionShellClass} py-[clamp(88px,10vw,136px)] max-720:py-[76px]`
export const sectionCompactClass = `${sectionShellClass} py-[26px] max-720:py-[76px]`

export const skipLinkClass =
  'fixed top-[10px] left-[10px] z-[200] rounded-[9px] bg-[#f3f3f3] px-[14px] py-[10px] text-[13px] font-semibold text-[#111] -translate-y-[160%] transition-transform duration-[180ms] ease-soft focus-visible:translate-y-0'

export const contentProseClass =
  '[&>section+section]:mt-[clamp(40px,5vw,56px)] [&>section+section]:border-t [&>section+section]:border-line [&>section+section]:pt-[clamp(32px,4vw,44px)] ' +
  '[&_h2]:text-[clamp(1.5rem,2.3vw,2rem)] [&_h2]:font-medium [&_h2]:leading-[1.15] [&_h2]:tracking-[-0.03em] [&_h2]:text-balance ' +
  '[&_h3]:mt-[26px] [&_h3]:text-[16px] [&_h3]:font-medium ' +
  '[&_p]:mt-4 [&_p]:text-[14.5px] [&_p]:leading-[1.72] [&_p]:text-ink-2 ' +
  '[&_section>h2+p]:mt-[18px] ' +
  '[&_ul]:mt-[18px] [&_ul]:grid [&_ul]:gap-[10px] ' +
  '[&_ul_li]:relative [&_ul_li]:pl-[19px] [&_ul_li]:text-[14.5px] [&_ul_li]:leading-[1.65] [&_ul_li]:text-ink-2 ' +
  "[&_ul_li]:before:absolute [&_ul_li]:before:top-[0.62em] [&_ul_li]:before:left-0 [&_ul_li]:before:h-[5px] [&_ul_li]:before:w-[5px] [&_ul_li]:before:rotate-45 [&_ul_li]:before:border [&_ul_li]:before:border-[#777] [&_ul_li]:before:bg-[#1a1a1a] [&_ul_li]:before:content-[''] " +
  '[&_p_a]:text-[#e4e4e4] [&_p_a]:underline [&_p_a]:[text-decoration-color:#ffffff40] [&_p_a]:underline-offset-[3px] [&_p_a]:transition-[text-decoration-color] [&_p_a]:duration-[160ms] [&_p_a:hover]:decoration-white ' +
  '[&_li_a]:text-[#e4e4e4] [&_li_a]:underline [&_li_a]:[text-decoration-color:#ffffff40] [&_li_a]:underline-offset-[3px] [&_li_a]:transition-[text-decoration-color] [&_li_a]:duration-[160ms] [&_li_a:hover]:decoration-white ' +
  '[&_strong]:font-medium [&_strong]:text-[#dedede] ' +
  '[&_code]:rounded-[4px] [&_code]:border [&_code]:border-line [&_code]:bg-[#101010] [&_code]:px-[5px] [&_code]:py-px [&_code]:text-[0.88em] [&_code]:text-[#c6c6c6] ' +
  'max-560:[&_p]:text-[14px] max-560:[&_ul_li]:text-[14px]'

export const contentNoteClass =
  'border border-line border-l-2 border-l-[#8a8a8a] rounded-r-[10px] bg-[#0a0a0a] px-[18px] py-4 text-[#b9b9b9]!'

export const contentCopyrightClass =
  'text-[12.5px]! tracking-[0.02em] text-[#d6d6d6]! font-mono'

export const contentTableWrapClass = 'mt-5 overflow-x-auto rounded-[12px] border border-line'

export const contentTableClass =
  'w-full border-collapse text-[13.5px] leading-[1.55] ' +
  '[&_th]:border-b [&_th]:border-line [&_th]:p-[13px_16px] [&_th]:text-left [&_th]:align-top [&_th]:bg-[#0b0b0b] [&_th]:font-mono [&_th]:text-[11px] [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-[0.1em] [&_th]:text-ink-3 ' +
  '[&_td]:border-b [&_td]:border-line [&_td]:p-[13px_16px] [&_td]:text-left [&_td]:align-top [&_td]:text-ink-2 ' +
  '[&_tbody_tr:last-child_td]:border-b-0 ' +
  '[&_td:first-child]:w-[34%] [&_td:first-child]:text-[#dedede] ' +
  'max-560:text-[13px] max-560:[&_th]:p-[11px_12px] max-560:[&_td]:p-[11px_12px] max-560:[&_td:first-child]:w-[42%]'

export const contentLicenseClass =
  'mt-[22px] overflow-x-auto rounded-[12px] border border-line bg-[#080808] p-[clamp(20px,3vw,30px)] font-mono text-[12.5px] leading-[1.75] whitespace-pre-wrap text-[#bdbdbd] ' +
  '[&_code]:border-0 [&_code]:bg-transparent [&_code]:p-0! [&_code]:text-inherit [&_code]:[font-size:inherit]!'

export const releaseHeadClass = 'flex flex-wrap items-baseline gap-3'

export const releaseTitleClass =
  'text-[clamp(1.9rem,3vw,2.6rem)]! tracking-[-0.04em]!'

export const releaseDateClass =
  'font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3'

export const releaseBadgeClass =
  'rounded-full border border-live/40 bg-live/[0.08] px-2 py-[3px] font-mono text-[10px] uppercase tracking-[0.12em] text-live'

export const releaseGroupClass = 'mt-[26px] [&_h3]:mt-0! [&_ul]:mt-3!'

/**
 * SVG labels shared by the runtime and privacy diagrams. Text inherits the
 * root stroke, so every label opts out of it explicitly.
 */
export const systemTextClass = {
  head: 'stroke-none fill-ink-3 font-mono text-[13px] tracking-[0.08em] uppercase transition-[fill] duration-300 group-hover:fill-ink max-1180:text-[13.5px]',
  fn: 'stroke-none fill-ink-2 font-mono text-[13px] tracking-[0.08em] uppercase transition-[fill] duration-300 group-hover:fill-ink max-1180:text-[13.5px]',
  name: 'stroke-none fill-ink-2 font-sans text-[15px] transition-[fill] duration-300 group-hover:fill-ink max-1180:text-[16.5px]',
  sub: 'stroke-none fill-ink-3 font-sans text-[13px] transition-[fill] duration-300 group-hover:fill-ink max-1180:text-[14.5px]',
  title: 'stroke-none fill-ink font-sans text-[20px] font-medium tracking-[-0.02em] transition-[fill] duration-300',
} as const

export const systemFigureClass =
  'relative grid min-h-0 select-none grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr] rounded-[18px] border border-line-2 bg-card bg-[radial-gradient(ellipse_58%_56%_at_50%_48%,#ffffff06,transparent_72%)] p-[18px_20px] shadow-[inset_0_1px_#ffffff0a] transition-[border-color,--iso-ink] duration-300 [--iso-fill:#0d0d0d] [--iso-grid:#ffffff0e] [--iso-hot:#ededed] [--iso-ink:#ffffff70] [--iso-side:#070707] hover:border-white/20 hover:[--iso-ink:#ffffff94] max-720:rounded-[13px] max-720:p-[14px]'

export const systemFigureTopClass =
  'pointer-events-none flex items-center justify-between gap-3 font-mono text-[12.5px] leading-none text-ink-3'

export const systemFigureTopLabelClass = 'text-[12px] uppercase tracking-[0.08em]'

export const systemStageClass =
  'relative grid min-h-0 grid-cols-[minmax(0,1fr)] place-items-center'

export const systemStagePadClass = 'p-[22px_0_18px] max-720:p-[14px_0_10px]'

export const privacyStagePadClass = 'p-[18px_0_12px]'

export const systemPlanClass = 'mx-auto w-full max-w-[1040px] max-959:hidden'

export const privacyPlanClass = 'mx-auto w-full max-w-[760px] max-959:hidden'

export const systemSvgClass = 'block h-auto w-full overflow-visible'

export const systemMapClass =
  'system-map [&_.system-logo]:fill-[rgba(255,255,255,0.58)]'

export const systemFloorClass = 'stroke-[var(--iso-grid)]'

export const privacyFloorClass = 'opacity-70'

export const systemTraceClass = 'fill-none stroke-[#ffffff21] transition-[stroke] duration-300'

export const systemLaneClass =
  'fill-none stroke-[#ffffff3d] transition-[stroke] duration-300 [stroke-dasharray:3_4]'

export const systemArrowClass = 'fill-none stroke-[#fff6]'

export const systemPartClass =
  'system-part group transition-[opacity,stroke] duration-300 [--top:var(--iso-fill)] hover:stroke-[var(--iso-hot)] hover:[--top:#151515]'

export const systemHitClass = 'fill-transparent stroke-none'

export const systemLiveClass =
  'system-live fill-live [animation:system-pulse_2.4s_ease-in-out_infinite] motion-reduce:hidden'

export const systemListClass = 'mt-[11px] grid list-none gap-2 p-0'

export const systemSchematicClass =
  'system-schematic hidden grid-cols-[minmax(0,1fr)] max-959:mx-auto max-959:grid max-959:w-full max-959:max-w-[520px]'

export const systemNodeClass =
  'system-node min-w-0 rounded-xl border border-line-2 bg-[#070707] p-[13px_12px_14px] transition-[border-color,opacity] duration-300 hover:border-white/50 max-420:p-[12px_10px_13px]'

export const systemSecClass = '[&+&]:mt-[13px] [&+&]:border-t [&+&]:border-line [&+&]:pt-3'

export const systemNodeHeadClass =
  'm-0 font-mono text-[12px] font-normal leading-[1.2] tracking-[0.08em] uppercase text-ink-3'

export const systemNodeTitleClass =
  'm-0 flex items-center gap-[9px] whitespace-nowrap text-[16px] font-medium tracking-[-0.02em] text-ink'

export const systemNodeFnsClass =
  'm-0 mt-[10px] font-mono text-[12px] font-normal leading-[1.6] tracking-[0.06em] uppercase text-ink-2 [&>span]:whitespace-nowrap [&_span_span]:whitespace-nowrap max-959:text-[11px] max-959:leading-[1.7] max-959:tracking-[0.04em] max-959:[&>span]:whitespace-normal max-959:[&_span_span]:whitespace-normal'

export const systemNodeListClass = 'mt-[11px] grid list-none gap-[6px] p-0'

export const systemNodeListTextClass =
  'font-mono text-[12px] font-normal leading-[1.3] tracking-[0.06em] uppercase text-ink-2 max-420:text-[11px] max-420:tracking-[0.04em]'

export const systemNodeRow2Class =
  'mt-[11px] flex list-none flex-wrap gap-[8px_16px] p-0'

export const systemNodeItemClass =
  'flex items-center gap-2 whitespace-nowrap text-[14px] leading-[1.2] text-ink max-420:gap-[6px] max-420:text-[13px]'

export const systemNodeSubItemClass =
  'flex items-center gap-2 whitespace-nowrap text-[13px] leading-[1.2] text-ink-3 max-420:gap-[6px]'

export const systemGlyphIconClass =
  'size-4 flex-none text-ink-2 transition-[color] duration-300 max-420:size-[14px]'

export const systemNodeTitleIconClass = 'size-[18px] text-ink'

export const systemSplitClass =
  'grid min-w-0 grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-x-[10px]'

export const systemWireClass = 'relative mx-auto block h-[34px] w-px bg-line-2'

export const systemWireLaneClass = 'relative block h-[34px] w-px bg-line-2'

export const systemWireDotClass =
  'absolute top-0 left-0 size-[10px] border border-white/70 bg-card [animation:system-ride_2.6s_linear_infinite] [transform:scaleY(0.58)_rotate(45deg)] motion-reduce:hidden data-[k=down]:size-[6px] data-[k=out]:size-[6px] data-[k=up]:size-[6px] data-[k=out]:[animation-delay:-0.6s] data-[k=down]:[animation-duration:3.4s] data-[k=up]:border-ink data-[k=up]:bg-ink data-[k=up]:[animation-delay:-1.7s] data-[k=up]:[animation-direction:reverse] data-[k=up]:[animation-duration:3.4s]'

export const systemLanesClass = 'flex items-center justify-center gap-[7px]'

export const systemLaneTextClass =
  'ml-[6px] font-mono text-[12px] leading-[1.5] tracking-[0.06em] uppercase text-ink-3'

export const systemDotClass =
  'size-[7px] flex-none rounded-full bg-live shadow-[0_0_0_3px_rgba(74,222,128,0.14)]'

export const privacyFigureClass = `${systemFigureClass} h-full`

export const privacyMapClass = 'privacy-map'

export const privacyBoundaryClass =
  'fill-[#ffffff03] stroke-[#fff3] [stroke-dasharray:4_7]'

export const privacyTraceClass = 'fill-none stroke-[#ffffff24] transition-[stroke] duration-300'

export const privacyCloudClass = 'fill-[var(--top)]'

export const privacyCloudSideClass = 'fill-[var(--iso-side)]'

export const privacyCloudSlashCaseClass = 'fill-none stroke-[#0b0b0b] [stroke-width:7px]'

export const privacyCloudSlashClass = 'fill-none stroke-[#ffffff8c] [stroke-width:1.5px]'

export const privacyRuleClass = 'stroke-[#ffffff17]'

export const privacyShieldClass = 'fill-none'

export const regressionDiagramClass = 'block h-auto w-full'

export const diagramLabelClass =
  'fill-[#ededed] font-mono text-[12px] font-medium uppercase tracking-[0.12em]'

export const diagramSmallClass = 'fill-[#8a8a8a] font-mono text-[11px] tracking-[0.03em]'

export const diagramSmallHotClass = 'fill-[#d8d8d8] font-mono text-[11px] tracking-[0.03em]'

export const diagramSmallLiveClass = 'fill-live font-mono text-[11px] tracking-[0.03em]'

export const diagramPanelClass =
  'fill-[#0c0c0cb8] stroke-[#ffffff1a] [vector-effect:non-scaling-stroke]'

export const diagramPanelVerifiedClass =
  'fill-[#0c100de6] stroke-[#4ade8047] [vector-effect:non-scaling-stroke]'

export const diagramChipClass =
  'fill-[rgba(255,255,255,0.04)] stroke-[rgba(255,255,255,0.1)] [vector-effect:non-scaling-stroke]'

export const diagramFlowPathClass =
  'fill-none stroke-[#fff3] [stroke-width:1px] [vector-effect:non-scaling-stroke]'

export const diagramArrowheadClass =
  'fill-none stroke-[#ffffff59] [stroke-width:1px] [vector-effect:non-scaling-stroke]'

export const diagramLineFaintClass =
  'fill-none stroke-[#ffffff14] [stroke-width:1px] [vector-effect:non-scaling-stroke]'

export const diagramDotClass = 'fill-[#3d3d3d]'

export const diagramDotLiveClass = 'fill-live'

export const diagramCheckClass =
  'fill-[#4ade801f] stroke-[#4ade8073] [vector-effect:non-scaling-stroke]'
