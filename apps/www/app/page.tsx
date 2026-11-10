import type { Metadata } from 'next'
import { HOME_TITLE, SITE_DESCRIPTION, pageMetadata } from '@/content/metadata'
import { ProductTour } from '@/components/product-tour'
import { RevealProvider } from '@/components/reveal'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { SectionHead } from '@/components/primitives'
import { Hero } from '@/components/sections/hero'
import { frameClass, sectionClass, skipLinkClass } from '@/components/styles'
import {
  Access,
  Compatibility,
  Cta,
  Faq,
  Masthead,
  Privacy,
  Product,
  Setup,
} from '@/components/sections/landing-sections'

export const metadata: Metadata = pageMetadata({
  title: { absolute: HOME_TITLE },
  socialTitle: HOME_TITLE,
  description: SITE_DESCRIPTION,
  path: '/',
})

export default function Page(): React.ReactElement {
  return (
    <>
      <a className={skipLinkClass} href="#main">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main">
        <div className={frameClass}>
          <Hero />
          <Compatibility />
          <Product />
          <Masthead />
          <Access />
          <section className={sectionClass} id="tour" aria-labelledby="tour-title">
            <SectionHead
              label="04 / Dashboard"
              id="tour-title"
              title={
                <>
                  A tour of the
                  <br />
                  dashboard.
                </>
              }
              lede="Every screenshot here is a real capture from the example app."
            />
            <ProductTour />
          </section>
          <Setup />
          <Privacy />
          <Faq />
          <Cta />
        </div>
      </main>
      <SiteFooter />
      <RevealProvider />
    </>
  )
}
