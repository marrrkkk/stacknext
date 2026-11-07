/**
 * Extract one version section from CHANGELOG.md.
 *
 * Headings inside fenced code blocks are examples, not section boundaries.
 * Returns a short fallback when the section is missing or empty.
 */
export function extractReleaseNotes(changelog, version) {
  const lines = changelog.split(/\r?\n/)
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const heading = new RegExp(`^## \\[${escaped}\\](?:\\s|$)`)
  const start = lines.findIndex((line) => heading.test(line))
  if (start < 0) return `Release ${version}.`

  const body = []
  let fence = null
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index]
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1] ?? null
    if (marker) {
      if (fence === null) {
        fence = { character: marker[0], length: marker.length }
      } else if (marker[0] === fence.character && marker.length >= fence.length) {
        fence = null
      }
      body.push(line)
      continue
    }
    if (fence === null && /^## /.test(line)) break
    body.push(line)
  }

  const notes = body.join('\n').trim()
  return notes || `Release ${version}.`
}
