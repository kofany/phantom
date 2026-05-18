type SparklineProps = {
  data: number[]
  width?: number
  height?: number
  color?: string
  fill?: boolean
}

export function Sparkline({
  data,
  width = 70,
  height = 24,
  color = 'currentColor',
  fill = true,
}: SparklineProps) {
  if (data.length === 0) {
    return (
      <svg className="spark" width={width} height={height} aria-hidden />
    )
  }

  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const stepX = data.length > 1 ? width / (data.length - 1) : 0

  const points = data.map((v, i) => {
    const x = i * stepX
    const y = height - ((v - min) / range) * (height - 2) - 1
    return [x, y] as const
  })

  const pathD = points
    .map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`))
    .join(' ')

  const fillD = `${pathD} L${width},${height} L0,${height} Z`

  return (
    <svg
      className="spark"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
    >
      {fill && (
        <path
          d={fillD}
          fill={color}
          fillOpacity={0.15}
        />
      )}
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
