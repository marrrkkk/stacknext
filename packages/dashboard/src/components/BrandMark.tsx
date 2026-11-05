type BrandMarkProps = {
  size?: number
}

/**
 * StackNext "Open Span" mark. Inherits the surrounding text colour so it works
 * in both dashboard themes without a second asset.
 */
export function BrandMark({ size = 20 }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 256 256"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M168 34H68A34 34 0 0 0 34 68V188A34 34 0 0 0 68 222H188A34 34 0 0 0 222 188V88H194V188A6 6 0 0 1 188 194H68A6 6 0 0 1 62 188V68A6 6 0 0 1 68 62H168Z" />
      <rect x="88" y="128" width="40" height="40" rx="6" />
    </svg>
  )
}
