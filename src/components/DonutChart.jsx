// 甜甜圈圖：segments 是 [{ key, color, pct }]（pct 為 0–100，依序排列）；以 pathLength=100 讓 dasharray 直接使用百分比
const DonutChart = ({ segments, size = 160 }) => {
  const starts = segments.map((_, i) => segments.slice(0, i).reduce((sum, s) => sum + s.pct, 0))
  return (
    <svg width={size} height={size} viewBox="0 0 42 42" style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
      <circle cx="21" cy="21" r="15.915" fill="none" stroke="var(--cs-soft)" strokeWidth="6" />
      {segments.map((s, i) => (
          <circle
            key={s.key}
            cx="21" cy="21" r="15.915" fill="none"
            stroke={s.color} strokeWidth="6" pathLength="100"
            strokeDasharray={`${s.pct} ${100 - s.pct}`}
            strokeDashoffset={-starts[i]}
          />
      ))}
    </svg>
  )
}

export default DonutChart
