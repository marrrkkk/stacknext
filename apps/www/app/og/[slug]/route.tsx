import { ImageResponse } from 'next/og'
import { OG_SIZE, OgImage } from '@/components/og-image'
import { OG_CARDS } from '@/content/og'

// Every slug is generated at build time; unknown slugs return 404.
export const dynamicParams = false

export function generateStaticParams(): { slug: string }[] {
  return Object.keys(OG_CARDS).map((slug) => ({ slug }))
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params

  if (!Object.hasOwn(OG_CARDS, slug)) {
    return new Response('Unknown social card', { status: 404 })
  }

  const card = OG_CARDS[slug as keyof typeof OG_CARDS]

  return new ImageResponse(
    <OgImage label={card.label} title={card.title} description={card.description} />,
    OG_SIZE,
  )
}
