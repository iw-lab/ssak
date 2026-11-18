// ============================================
// 경량 차트 컴포넌트 - recharts 대체
// 번들 크기: recharts 524KB → 이 파일 ~5KB
// SVG 기반 직접 렌더링
// ============================================

import { useMemo } from "react";

// ============================================
// 유틸리티 함수
// ============================================

// 숫자를 지정된 범위로 매핑
function mapRange(value, inMin, inMax, outMin, outMax) {
  if (inMax === inMin) return outMin;
  return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
}

// 데이터에서 최소/최대값 추출
function getMinMax(data, key) {
  if (!data || data.length === 0) return { min: 0, max: 100 };
  const values = data
    .map((d) => d[key])
    .filter((v) => v !== undefined && v !== null);
  if (values.length === 0) return { min: 0, max: 100 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  // 여유 공간 추가
  const padding = (max - min) * 0.1 || 10;
  return { min: Math.max(0, min - padding), max: max + padding };
}

// Y축 틱 생성
function generateYTicks(min, max, count = 5) {
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(min + step * i));
}

// ============================================
// LineChart - 꺾은선 그래프
// ============================================
export function SimpleLineChart({
  data,
  dataKey,
  xAxisKey = "name",
  width = "100%",
  height = 200,
  strokeColor = "#3b82f6",
  fillColor = "rgba(59, 130, 246, 0.1)",
  showGrid = true,
  showDots = true,
  showArea = false,
  showTooltip = true,
  className = "",
}) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return null;

    const { min, max } = getMinMax(data, dataKey);
    const yTicks = generateYTicks(min, max);

    const padding = { top: 20, right: 20, bottom: 40, left: 50 };
    const chartWidth = 400;
    const chartHeight = height;
    const innerWidth = chartWidth - padding.left - padding.right;
    const innerHeight = chartHeight - padding.top - padding.bottom;

    const points = data.map((d, i) => ({
      x: padding.left + (i / (data.length - 1 || 1)) * innerWidth,
      y:
        padding.top +
        innerHeight -
        mapRange(d[dataKey] || 0, min, max, 0, innerHeight),
      value: d[dataKey],
      label: d[xAxisKey],
    }));

    const linePath = points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
      .join(" ");

    const areaPath = showArea
      ? `${linePath} L ${points[points.length - 1]?.x || 0} ${padding.top + innerHeight} L ${padding.left} ${padding.top + innerHeight} Z`
      : "";

    return {
      points,
      linePath,
      areaPath,
      yTicks,
      padding,
      chartWidth,
      chartHeight,
      innerWidth,
      innerHeight,
      min,
      max,
    };
  }, [data, dataKey, height, showArea]);

  if (!chartData) {
    return (
      <div
        className={`flex items-center justify-center bg-gray-50 rounded-lg ${className}`}
        style={{ height }}
      >
        <span className="text-gray-400">데이터 없음</span>
      </div>
    );
  }

  const {
    points,
    linePath,
    areaPath,
    yTicks,
    padding,
    chartWidth,
    chartHeight,
    innerWidth,
    innerHeight,
    min,
    max,
  } = chartData;

  return (
    <div className={`relative ${className}`} style={{ width, height }}>
      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="w-full h-full"
      >
        {/* 그리드 */}
        {showGrid && (
          <g className="grid">
            {yTicks.map((tick, i) => {
              const y =
                padding.top +
                innerHeight -
                mapRange(tick, min, max, 0, innerHeight);
              return (
                <line
                  key={i}
                  x1={padding.left}
                  y1={y}
                  x2={padding.left + innerWidth}
                  y2={y}
                  stroke="#e5e7eb"
                  strokeDasharray="4 4"
                />
              );
            })}
          </g>
        )}

        {/* Y축 레이블 */}
        <g className="y-axis">
          {yTicks.map((tick, i) => {
            const y =
              padding.top +
              innerHeight -
              mapRange(tick, min, max, 0, innerHeight);
            return (
              <text
                key={i}
                x={padding.left - 10}
                y={y + 4}
                textAnchor="end"
                className="text-xs fill-gray-500"
              >
                {tick}
              </text>
            );
          })}
        </g>

        {/* X축 레이블 - 데이터 많으면 간격 조절 */}
        <g className="x-axis">
          {points.map((p, i) => {
            const total = points.length;
            const maxLabels = 10;
            const step = total <= maxLabels ? 1 : Math.ceil(total / maxLabels);
            const isFirst = i === 0;
            const isLast = i === total - 1;
            const isStep = i % step === 0;
            // 마지막 레이블이 직전 step 레이블과 너무 가까우면 skip
            if (isLast && step > 1) {
              const prevStepIdx = Math.floor((total - 2) / step) * step;
              if (total - 1 - prevStepIdx < step * 0.6) return null;
            }
            if (!isFirst && !isLast && !isStep) return null;
            return (
              <text
                key={i}
                x={p.x}
                y={chartHeight - 10}
                textAnchor="middle"
                className="text-xs fill-gray-500"
              >
                {total > maxLabels ? i + 1 : p.label}
              </text>
            );
          })}
        </g>

        {/* 영역 채우기 */}
        {showArea && <path d={areaPath} fill={fillColor} />}

        {/* 선 */}
        <path
          d={linePath}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* 점 */}
        {showDots &&
          points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r="4"
              fill="white"
              stroke={strokeColor}
              strokeWidth="2"
              className="hover:r-6 transition-all cursor-pointer"
            >
              {showTooltip && <title>{`${p.label}: ${p.value}`}</title>}
            </circle>
          ))}
      </svg>
    </div>
  );
}

// ============================================
// BarChart - 막대 그래프
// ============================================
export function SimpleBarChart({
  data,
  dataKey,
  xAxisKey = "name",
  width = "100%",
  height = 200,
  barColor = "#3b82f6",
  showGrid = true,
  showTooltip = true,
  className = "",
}) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return null;

    const { min, max } = getMinMax(data, dataKey);
    const yTicks = generateYTicks(0, max); // 막대는 0부터 시작

    const padding = { top: 20, right: 20, bottom: 40, left: 50 };
    const chartWidth = 400;
    const chartHeight = height;
    const innerWidth = chartWidth - padding.left - padding.right;
    const innerHeight = chartHeight - padding.top - padding.bottom;

    const barWidth = (innerWidth / data.length) * 0.7;
    const barGap = (innerWidth / data.length) * 0.3;

    const bars = data.map((d, i) => ({
      x: padding.left + i * (barWidth + barGap) + barGap / 2,
      y:
        padding.top +
        innerHeight -
        mapRange(d[dataKey] || 0, 0, max, 0, innerHeight),
      width: barWidth,
      height: mapRange(d[dataKey] || 0, 0, max, 0, innerHeight),
      value: d[dataKey],
      label: d[xAxisKey],
    }));

    return {
      bars,
      yTicks,
      padding,
      chartWidth,
      chartHeight,
      innerWidth,
      innerHeight,
      max,
    };
  }, [data, dataKey, height]);

  if (!chartData) {
    return (
      <div
        className={`flex items-center justify-center bg-gray-50 rounded-lg ${className}`}
        style={{ height }}
      >
        <span className="text-gray-400">데이터 없음</span>
      </div>
    );
  }

  const {
    bars,
    yTicks,
    padding,
    chartWidth,
    chartHeight,
    innerWidth,
    innerHeight,
    max,
  } = chartData;

  return (
    <div className={`relative ${className}`} style={{ width, height }}>
      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="w-full h-full"
      >
        {/* 그리드 */}
        {showGrid && (
          <g className="grid">
            {yTicks.map((tick, i) => {
              const y =
                padding.top +
                innerHeight -
                mapRange(tick, 0, max, 0, innerHeight);
              return (
                <line
                  key={i}
                  x1={padding.left}
                  y1={y}
                  x2={padding.left + innerWidth}
                  y2={y}
                  stroke="#e5e7eb"
                  strokeDasharray="4 4"
                />
              );
            })}
          </g>
        )}

        {/* Y축 레이블 */}
        <g className="y-axis">
          {yTicks.map((tick, i) => {
            const y =
              padding.top +
              innerHeight -
              mapRange(tick, 0, max, 0, innerHeight);
            return (
              <text
                key={i}
                x={padding.left - 10}
                y={y + 4}
                textAnchor="end"
                className="text-xs fill-gray-500"
              >
                {tick}
              </text>
            );
          })}
        </g>

        {/* 막대 */}
        {bars.map((bar, i) => (
          <g key={i}>
            <rect
              x={bar.x}
              y={bar.y}
              width={bar.width}
              height={bar.height}
              fill={barColor}
              rx="4"
              className="hover:opacity-80 transition-opacity cursor-pointer"
            >
              {showTooltip && <title>{`${bar.label}: ${bar.value}`}</title>}
            </rect>
            {/* X축 레이블 */}
            <text
              x={bar.x + bar.width / 2}
              y={chartHeight - 10}
              textAnchor="middle"
              className="text-xs fill-gray-500"
            >
              {bar.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ============================================
// RadarChart - 레이더 차트 (능력치 표시용)
// ============================================
export function SimpleRadarChart({
  data,
  width = "100%",
  height = 200,
  fillColor = "rgba(59, 130, 246, 0.3)",
  strokeColor = "#3b82f6",
  maxValue = 100,
  className = "",
}) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return null;

    const centerX = 150;
    const centerY = 100;
    const radius = 70;
    const angleStep = (2 * Math.PI) / data.length;

    // 축 그리기 포인트
    const axes = data.map((d, i) => {
      const angle = angleStep * i - Math.PI / 2;
      return {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
        labelX: centerX + (radius + 20) * Math.cos(angle),
        labelY: centerY + (radius + 20) * Math.sin(angle),
        name: d.name,
      };
    });

    // 데이터 포인트
    const points = data.map((d, i) => {
      const angle = angleStep * i - Math.PI / 2;
      const valueRadius = (d.value / maxValue) * radius;
      return {
        x: centerX + valueRadius * Math.cos(angle),
        y: centerY + valueRadius * Math.sin(angle),
      };
    });

    const dataPath =
      points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") +
      " Z";

    // 그리드 원
    const gridCircles = [0.25, 0.5, 0.75, 1].map((scale) => ({
      r: radius * scale,
      label: Math.round(maxValue * scale),
    }));

    return { axes, points, dataPath, gridCircles, centerX, centerY, radius };
  }, [data, maxValue]);

  if (!chartData) {
    return (
      <div
        className={`flex items-center justify-center bg-gray-50 rounded-lg ${className}`}
        style={{ height }}
      >
        <span className="text-gray-400">데이터 없음</span>
      </div>
    );
  }

  const { axes, dataPath, gridCircles, centerX, centerY } = chartData;

  return (
    <div className={`relative ${className}`} style={{ width, height }}>
      <svg viewBox="0 0 300 200" className="w-full h-full">
        {/* 그리드 원 */}
        {gridCircles.map((circle, i) => (
          <circle
            key={i}
            cx={centerX}
            cy={centerY}
            r={circle.r}
            fill="none"
            stroke="#e5e7eb"
            strokeDasharray="4 4"
          />
        ))}

        {/* 축 선 */}
        {axes.map((axis, i) => (
          <line
            key={i}
            x1={centerX}
            y1={centerY}
            x2={axis.x}
            y2={axis.y}
            stroke="#e5e7eb"
          />
        ))}

        {/* 데이터 영역 */}
        <path
          d={dataPath}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth="2"
        />

        {/* 축 레이블 */}
        {axes.map((axis, i) => (
          <text
            key={i}
            x={axis.labelX}
            y={axis.labelY}
            textAnchor="middle"
            dominantBaseline="middle"
            className="text-xs fill-gray-600 font-medium"
          >
            {axis.name}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ============================================
// ProgressBar - 진행률 바
// ============================================
export function ProgressBar({
  value,
  max = 100,
  height = 8,
  color = "#3b82f6",
  backgroundColor = "#e5e7eb",
  showLabel = false,
  label = "",
  className = "",
}) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={`w-full ${className}`}>
      {showLabel && (
        <div className="flex justify-between text-sm mb-1">
          <span className="text-gray-600">{label}</span>
          <span className="text-gray-500">
            {value}/{max}
          </span>
        </div>
      )}
      <div
        className="w-full rounded-full overflow-hidden"
        style={{ height, backgroundColor }}
      >
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{ width: `${percentage}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// ============================================
// DonutChart - 도넛 차트
// ============================================
export function DonutChart({
  value,
  max = 100,
  size = 100,
  strokeWidth = 10,
  color = "#3b82f6",
  backgroundColor = "#e5e7eb",
  showLabel = true,
  className = "",
}) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="transform -rotate-90">
        {/* 배경 원 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={backgroundColor}
          strokeWidth={strokeWidth}
        />
        {/* 진행률 원 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-500 ease-out"
        />
      </svg>
      {showLabel && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold text-gray-700">
            {Math.round(percentage)}%
          </span>
        </div>
      )}
    </div>
  );
}

export default {
  SimpleLineChart,
  SimpleBarChart,
  SimpleRadarChart,
  ProgressBar,
  DonutChart,
};
