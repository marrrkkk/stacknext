/**
 * Shared 1200x630 social card. Rendered by next/og (satori), which supports a
 * subset of CSS: flex layout, solid colors, linear gradients, borders and
 * letter spacing. Every element with children declares `display: flex`.
 */
export const OG_SIZE = { width: 1200, height: 630 } as const

export const OG_CONTENT_TYPE = 'image/png'

export function OgImage({
  label,
  title,
  description,
}: {
  label: string
  title: string
  description: string
}): React.ReactElement {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: '#050505',
        backgroundImage: 'linear-gradient(180deg, #151515 0%, #050505 64%)',
        padding: '62px 68px',
        color: '#ededed',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 46,
              height: 46,
              marginRight: 16,
              borderRadius: 12,
              border: '1px solid #3a3a3a',
              background: '#0d0d0d',
              fontSize: 22,
              color: '#ededed',
            }}
          >
            S
          </div>
          <div style={{ display: 'flex', fontSize: 27, letterSpacing: -0.4 }}>StackNext</div>
        </div>
        <div style={{ display: 'flex', fontSize: 17, letterSpacing: 3, color: '#8a8a8a' }}>
          {label}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'flex',
            fontSize: 18,
            letterSpacing: 4,
            color: '#8a8a8a',
            marginBottom: 24,
          }}
        >
          LOCAL-FIRST DEBUGGING
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 60,
            lineHeight: 1.06,
            letterSpacing: -2.2,
            width: 990,
          }}
        >
          {title}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 25,
            lineHeight: 1.45,
            color: '#9f9f9f',
            marginTop: 26,
            width: 930,
          }}
        >
          {description}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '1px solid #262626',
          paddingTop: 24,
          fontSize: 17,
          color: '#767676',
        }}
      >
        <div style={{ display: 'flex' }}>Open source · MIT · No account</div>
        <div style={{ display: 'flex' }}>127.0.0.1:4400</div>
      </div>
    </div>
  )
}
