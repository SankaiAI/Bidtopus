export default function Logo({ color = '#0e0d1a', size = 20, style = {} }) {
  const h = Math.round(size * 1.45)
  const w = Math.round(h * (126 / 26))
  const gid = `bt-wm-${size}`

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 126 26"
      style={{ display: 'inline-block', flexShrink: 0, overflow: 'visible', ...style }}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="126" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor={color} />
          <stop offset="38%"  stopColor={color} />
          <stop offset="100%" stopColor="#2563EB" />
        </linearGradient>
      </defs>

      <text
        x="0"
        y="21"
        fontFamily="Plus Jakarta Sans, sans-serif"
        fontWeight="800"
        fontSize="21"
        letterSpacing="-0.7"
        fill={`url(#${gid})`}
      >
        Bid<tspan fill="#2563EB">topus</tspan>
      </text>
    </svg>
  )
}
