import { useId } from 'react'

type LogoProps = {
  size?: 'sm' | 'md' | 'lg'
  label?: string
}

const DIM = { sm: 28, md: 38, lg: 56 }

// Duotone split "PH" mark — sky half + violet half, bold lettermark.
// Midnight palette (#3679c5 → #88c0ff sky / #a78bfa → #7c5ee8 violet).
// Multiple instances on one page each get unique gradient IDs so the
// clip-path / fills never collide with a prior Logo render.
export function Logo({ size = 'md', label = 'Phantom' }: LogoProps) {
  const className = size === 'md' ? 'ph-logo' : `ph-logo ${size}`
  const d = DIM[size]
  const uid = useId().replace(/:/g, '')
  const clipId = `ph-clip-${uid}`
  const indId  = `ph-ind-${uid}`
  const vioId  = `ph-vio-${uid}`
  const shId   = `ph-sh-${uid}`

  return (
    <span className={className} role="img" aria-label={label}>
      <svg
        width={d}
        height={d}
        viewBox="0 0 56 56"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <clipPath id={clipId}>
            <rect x="2" y="2" width="52" height="52" rx="14" />
          </clipPath>
          <linearGradient id={indId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#3679c5" />
            <stop offset="1" stopColor="#88c0ff" />
          </linearGradient>
          <linearGradient id={vioId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#a78bfa" />
            <stop offset="1" stopColor="#7c5ee8" />
          </linearGradient>
          <linearGradient id={shId} x1="0" y1="0" x2="0" y2="56" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="rgba(255,255,255,0.2)" />
            <stop offset="1" stopColor="rgba(0,0,0,0.22)" />
          </linearGradient>
        </defs>

        <g clipPath={`url(#${clipId})`}>
          <rect x="2" y="2" width="52" height="52" fill={`url(#${indId})`} />
          <polygon points="56,2 56,56 2,56" fill={`url(#${vioId})`} />
          <rect x="2" y="2" width="52" height="52" fill={`url(#${shId})`} />
        </g>

        <rect
          x="2.5"
          y="2.5"
          width="51"
          height="51"
          rx="13.5"
          fill="none"
          stroke="rgba(255,255,255,0.2)"
        />

        <text
          x="28"
          y="39"
          textAnchor="middle"
          fontFamily="'Outfit', ui-sans-serif, system-ui, sans-serif"
          fontSize="28"
          fontWeight="800"
          fill="#ffffff"
          letterSpacing="-1"
        >
          PH
        </text>
      </svg>
    </span>
  )
}
