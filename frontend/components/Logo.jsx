export default function Logo({ color = '#0e0d1a', size = 20, style = {} }) {
  // viewBox: 126 wide × 26 tall (tuned to Plus Jakarta Sans 800 at fontSize=21)
  // "Outcome" ends ≈ x=98, "X" spans x=99–119, accent line beneath X.
  const h = Math.round(size * 1.45)
  const w = Math.round(h * (126 / 26))
  const gid = `ox-wm-${size}`

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 126 26"
      style={{ display: 'inline-block', flexShrink: 0, overflow: 'visible', ...style }}
    >
      <defs>
        {/* Gradient: stays dark through "Outcome", flips to indigo on "X" */}
        <linearGradient id={gid} x1="0" y1="0" x2="126" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor={color} />
          <stop offset="78%"  stopColor={color} />
          <stop offset="100%" stopColor="#4F46E5" />
        </linearGradient>
      </defs>

      {/* Wordmark — "Outcome" + "X" as tspan so baseline is shared */}
      <text
        x="0"
        y="21"
        fontFamily="Plus Jakarta Sans, sans-serif"
        fontWeight="800"
        fontSize="21"
        letterSpacing="-0.7"
        fill={`url(#${gid})`}
      >
        Outcome<tspan fontSize="23" dy="-0.5" fill="#4F46E5">X</tspan>
      </text>

      {/* Thin indigo underline accent beneath the X only */}
      <rect x="99" y="23.5" width="22" height="2" rx="1" fill="#4F46E5" />
    </svg>
  )
}
