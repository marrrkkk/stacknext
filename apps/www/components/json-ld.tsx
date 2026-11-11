/**
 * Renders structured data as a native script tag. JSON-LD is not executable
 * code, so it does not use next/script. `<` is escaped to `\u003c` so values
 * derived from content cannot close the script element.
 */
export function JsonLd({
  data,
}: {
  data: Record<string, unknown> | null
}): React.ReactElement | null {
  if (!data) return null

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  )
}
