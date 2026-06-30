"use client";

import { fmtUsdc, pct } from "@/lib/format";
import { USDCX_SYMBOL } from "@/lib/constants";

export function ProgressGauge({
  pooledMicro,
  goalMicro,
}: {
  pooledMicro: number;
  goalMicro: number;
}) {
  const percent = pct(pooledMicro, goalMicro);
  const radius = 84;
  const circ = 2 * Math.PI * radius;
  const offset = circ * (1 - percent / 100);
  const reached = percent >= 99.95;

  return (
    <div className="gauge">
      <svg width="218" height="218" viewBox="0 0 218 218">
        <defs>
          <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor={reached ? "#34d399" : "#22d3ee"} />
          </linearGradient>
        </defs>
        <circle cx="109" cy="109" r={radius} className="gauge-track" />
        <circle
          cx="109"
          cy="109"
          r={radius}
          className="gauge-fill"
          stroke="url(#gaugeGrad)"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform="rotate(-90 109 109)"
        />
      </svg>
      <div className="gauge-center">
        <div className="gauge-pct">
          {reached ? "100" : percent.toFixed(percent < 1 ? 1 : 0)}%
        </div>
        <div className="gauge-frac">
          {fmtUsdc(pooledMicro)} <span>/ {fmtUsdc(goalMicro)}</span>
        </div>
        <div className="gauge-label">{USDCX_SYMBOL} pooled</div>
      </div>
    </div>
  );
}
