import type { Metadata } from 'next'
import { ContentPage } from '@/components/content-page'
import {
  contentCopyrightClass,
  contentLicenseClass,
  contentTableClass,
  contentTableWrapClass,
} from '@/components/styles'
import { pageMetadata } from '@/content/metadata'
import { LINKS } from '@/content/site'
import { POLICY_UPDATED, formatUpdatedDate } from '@/content/updates'

export const metadata: Metadata = pageMetadata({
  title: 'License',
  description:
    'StackNext is released under the MIT License. Read the full license, what it allows and the licenses of key third-party dependencies.',
  path: '/license',
})

const MIT_LICENSE = `MIT License

Copyright (c) 2026 StackNext contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`

const SECTIONS = [
  { id: 'permissions', label: 'What you can do' },
  { id: 'conditions', label: 'What you keep' },
  { id: 'license', label: 'MIT License' },
  { id: 'third-party', label: 'Third-party software' },
  { id: 'trademarks', label: 'Trademarks' },
  { id: 'contributions', label: 'Contributions' },
  { id: 'questions', label: 'Questions' },
] as const

export default function LicensePage(): React.ReactElement {
  return (
    <ContentPage
      eyebrow="Legal / License"
      title="MIT licensed."
      lede="StackNext is free and open source. You can use it, modify it and ship it in commercial or private products under the MIT License. Keep the copyright and permission notice, and the software comes without warranty."
      updated={formatUpdatedDate(POLICY_UPDATED)}
      sections={SECTIONS}
      breadcrumb="License"
      path="/license"
    >
      <section id="permissions">
        <h2>What you can do</h2>
        <p>
          The MIT License is permissive. It allows you to use StackNext for almost any
          purpose, including in closed-source products, with no royalty or account
          requirement.
        </p>
        <ul>
          <li>Use StackNext for commercial, private or personal projects.</li>
          <li>Modify the source code and distribute your changes.</li>
          <li>Include StackNext in open-source or closed-source applications.</li>
          <li>Sublicense or sell copies of the software.</li>
        </ul>
      </section>

      <section id="conditions">
        <h2>What you keep</h2>
        <p>
          If you copy, modify or distribute StackNext, include the copyright notice and
          permission notice in all copies or substantial portions of the software. The
          software is provided &quot;as is&quot;, without warranty of any kind.
        </p>
        <p>
          The authors are not liable for claims, damages or other liability arising from
          the software or its use. The full text below is the authoritative license.
        </p>
      </section>

      <section id="license">
        <h2>MIT License</h2>
        <p className={contentCopyrightClass}>Copyright (c) 2026 StackNext contributors</p>
        <pre className={contentLicenseClass}>
          <code>{MIT_LICENSE}</code>
        </pre>
        <p>
          The canonical copy lives in the repository&apos;s{' '}
          <a href={LINKS.licenseFile} target="_blank" rel="noreferrer">
            LICENSE file
          </a>
          . If this page and that file ever differ, the repository file wins.
        </p>
      </section>

      <section id="third-party">
        <h2>Third-party software</h2>
        <p>
          StackNext is built with other open-source projects. These key dependencies keep
          their own licenses:
        </p>
        <div className={contentTableWrapClass}>
          <table className={contentTableClass}>
            <thead>
              <tr>
                <th scope="col">Project</th>
                <th scope="col">License</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Next.js</td>
                <td>MIT</td>
              </tr>
              <tr>
                <td>React</td>
                <td>MIT</td>
              </tr>
              <tr>
                <td>Geist</td>
                <td>SIL Open Font License 1.1</td>
              </tr>
              <tr>
                <td>Playwright</td>
                <td>Apache-2.0</td>
              </tr>
              <tr>
                <td>better-sqlite3</td>
                <td>MIT</td>
              </tr>
              <tr>
                <td>Zod</td>
                <td>MIT</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          This table is a summary, not a complete dependency inventory. Full license texts
          ship with each package, and the repository manifests and lockfile are the source
          of truth.
        </p>
      </section>

      <section id="trademarks">
        <h2>Trademarks and attribution</h2>
        <p>
          The MIT License covers the source code and documentation. It does not grant
          trademark rights or permission to imply that a modified version is an official
          StackNext release or is endorsed by the project.
        </p>
        <p>
          You may describe your product as built with or compatible with StackNext, but do
          not use the StackNext name or brand assets in a way that suggests endorsement.
        </p>
      </section>

      <section id="contributions">
        <h2>Contributions</h2>
        <p>
          Contributions are welcome and are accepted under the same MIT terms. Read the{' '}
          <a href={LINKS.contributing} target="_blank" rel="noreferrer">
            contributing guide
          </a>{' '}
          before opening a pull request.
        </p>
      </section>

      <section id="questions">
        <h2>Questions</h2>
        <p>
          For licensing questions, open an issue in the{' '}
          <a href={LINKS.github} target="_blank" rel="noreferrer">
            StackNext repository
          </a>
          . Report security concerns through the{' '}
          <a href={LINKS.security} target="_blank" rel="noreferrer">
            security policy
          </a>
          .
        </p>
      </section>
    </ContentPage>
  )
}
