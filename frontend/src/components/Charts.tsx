interface LineChartProps {
  data: { label: string; value: number }[];
  color?: string;
  height?: number;
}

export function LineChart({ data, color = "#FF6B35", height = 220 }: LineChartProps) {
  if (data.length === 0) {
    return (
      <div
        style={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-faint)",
          fontSize: 13,
        }}
      >
        No data
      </div>
    );
  }

  const W = 700;
  const H = height;
  const padT = 20;
  const padB = 40;
  const padL = 60;
  const padR = 20;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const max = Math.max(...data.map((d) => d.value), 1);
  const min = 0;

  const points = data.map((d, i) => {
    const x = padL + (i / Math.max(data.length - 1, 1)) * chartW;
    const y = padT + chartH - ((d.value - min) / (max - min || 1)) * chartH;
    return { x, y, ...d };
  });

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaD = `${pathD} L ${points[points.length - 1].x} ${padT + chartH} L ${padL} ${padT + chartH} Z`;

  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      <defs>
        <linearGradient id="lineGradient" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {gridLines.map((g) => {
        const y = padT + chartH * g;
        const val = max - (max - min) * g;
        return (
          <g key={g}>
            <line
              x1={padL}
              y1={y}
              x2={W - padR}
              y2={y}
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="1"
            />
            <text
              x={padL - 8}
              y={y + 4}
              fill="rgba(245,245,247,0.4)"
              fontSize="10"
              textAnchor="end"
              fontFamily="JetBrains Mono, monospace"
            >
              {val >= 1000 ? `${Math.round(val / 1000)}K` : Math.round(val).toString()}
            </text>
          </g>
        );
      })}

      <path d={areaD} fill="url(#lineGradient)" />
      <path d={pathD} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="4" fill={color} stroke="var(--bg)" strokeWidth="2" />
          <text
            x={p.x}
            y={padT + chartH + 20}
            fill="rgba(245,245,247,0.6)"
            fontSize="11"
            textAnchor="middle"
            fontFamily="JetBrains Mono, monospace"
          >
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

interface BarChartProps {
  data: { label: string; value: number; valueLabel?: string; color?: string }[];
  height?: number;
}

export function BarChart({ data, height = 240 }: BarChartProps) {
  if (data.length === 0) {
    return (
      <div
        style={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-faint)",
          fontSize: 13,
        }}
      >
        No data
      </div>
    );
  }

  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div style={{ padding: "12px 0" }}>
      {data.map((d, i) => {
        const pct = (d.value / max) * 100;
        const color = d.color ?? "#FF6B35";
        return (
          <div key={i} style={{ marginBottom: 14 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 6,
                fontSize: 12,
              }}
            >
              <span style={{ color: "var(--text)" }}>{d.label}</span>
              <span
                className="mono"
                style={{ color: "var(--text-dim)", fontSize: 11 }}
              >
                {d.valueLabel ?? d.value.toString()}
              </span>
            </div>
            <div
              style={{
                height: 10,
                background: "rgba(255,255,255,0.04)",
                borderRadius: 999,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${color}, ${color}aa)`,
                  borderRadius: 999,
                  transition: "width 0.3s",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
