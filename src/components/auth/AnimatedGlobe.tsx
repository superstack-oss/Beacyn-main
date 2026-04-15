export function AnimatedGlobe() {
  const continentSeeds = [
    { x: -0.55, y: -0.08, w: 0.24, h: 0.2 }, // North America
    { x: -0.44, y: 0.35, w: 0.16, h: 0.22 }, // South America
    { x: 0.04, y: -0.14, w: 0.11, h: 0.09 }, // Europe
    { x: 0.12, y: 0.18, w: 0.16, h: 0.23 }, // Africa
    { x: 0.4, y: -0.05, w: 0.3, h: 0.23 }, // Asia
    { x: 0.58, y: 0.39, w: 0.14, h: 0.1 }, // Oceania
  ];

  const dots: Array<{ x: number; y: number; r: number; opacity: number; key: string }> = [];
  const radiusX = 420;
  const radiusY = 280;

  for (let lat = -40; lat <= 40; lat += 2) {
    const latNorm = lat / 40;
    const rowFactor = Math.sqrt(Math.max(0, 1 - latNorm * latNorm));

    for (let lon = -180; lon <= 180; lon += 3) {
      const lonRad = (lon * Math.PI) / 180;
      const xNorm = Math.sin(lonRad) * rowFactor;
      const yNorm = latNorm;

      if (xNorm * xNorm + yNorm * yNorm > 1) continue;

      let landSignal = 0;
      for (const seed of continentSeeds) {
        const dx = (xNorm - seed.x) / seed.w;
        const dy = (yNorm - seed.y) / seed.h;
        const score = Math.exp(-(dx * dx + dy * dy));
        landSignal = Math.max(landSignal, score);
      }

      const oceanSignal = 0.15 + 0.25 * rowFactor;
      const visibility = Math.max(landSignal, oceanSignal * 0.7);
      if (visibility < 0.2) continue;

      const jitterX = Math.sin((lat + lon) * 0.73) * 1.8;
      const jitterY = Math.cos((lat - lon) * 0.41) * 1.2;
      const x = 860 + xNorm * radiusX + jitterX;
      const y = 650 + yNorm * radiusY + jitterY;
      const isLand = landSignal > 0.35;

      dots.push({
        x,
        y,
        r: isLand ? 1.8 + landSignal * 1.8 : 1.1,
        opacity: isLand ? 0.45 + landSignal * 0.45 : 0.18 + visibility * 0.18,
        key: `${lat}-${lon}`,
      });
    }
  }

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <svg
        viewBox="0 0 1920 1080"
        className="absolute inset-0 w-full h-full opacity-80 dark:opacity-95"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <radialGradient id="bgWash" cx="55%" cy="65%" r="70%">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.22" />
            <stop offset="60%" stopColor="#10b981" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#059669" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="planetGlow" cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor="#6ee7b7" stopOpacity="0.25" />
            <stop offset="70%" stopColor="#10b981" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </radialGradient>

          <linearGradient id="scanLine" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a7f3d0" stopOpacity="0" />
            <stop offset="45%" stopColor="#6ee7b7" stopOpacity="0.18" />
            <stop offset="55%" stopColor="#34d399" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#a7f3d0" stopOpacity="0" />
          </linearGradient>

          <style>{`
            @keyframes rotate-globe {
              from {
                transform: rotate(0deg);
              }
              to {
                transform: rotate(360deg);
              }
            }

            @keyframes sweep-y {
              0% { transform: translateY(-180px); opacity: 0; }
              15% { opacity: 1; }
              85% { opacity: 1; }
              100% { transform: translateY(1180px); opacity: 0; }
            }

            @keyframes pulse-network {
              0%, 100% { opacity: 0.2; }
              50% { opacity: 0.55; }
            }

            .rotating-globe {
              transform-origin: 860px 650px;
              animation: rotate-globe 85s linear infinite;
            }

            .scan {
              animation: sweep-y 9s ease-in-out infinite;
            }

            .network-pulse {
              animation: pulse-network 6s ease-in-out infinite;
            }
          `}</style>
        </defs>

        <rect x="0" y="0" width="1920" height="1080" fill="url(#bgWash)" />

        {/* Network links flowing across the entire page */}
        <g className="network-pulse" stroke="#6ee7b7" strokeWidth="1.1" fill="none" opacity="0.28">
          <path d="M 0 220 C 340 130, 700 350, 1120 230 C 1450 145, 1700 200, 1920 120" />
          <path d="M 0 600 C 360 500, 760 760, 1220 580 C 1500 470, 1730 590, 1920 520" />
          <path d="M 120 1080 C 540 760, 860 560, 1260 780 C 1550 940, 1750 920, 1920 860" />
          <path d="M 0 980 C 440 780, 760 840, 1080 710 C 1400 580, 1640 690, 1920 640" />
        </g>

        {/* Sweeping monitor line */}
        <rect className="scan" x="0" y="0" width="1920" height="180" fill="url(#scanLine)" />

        {/* Planet glow */}
        <ellipse cx="860" cy="650" rx="520" ry="330" fill="url(#planetGlow)" />

        {/* Animated rotating globe cluster */}
        <g className="rotating-globe">
          <ellipse cx="860" cy="650" rx="430" ry="286" fill="none" stroke="#34d399" strokeWidth="1.8" opacity="0.42" />
          <ellipse cx="860" cy="650" rx="380" ry="248" fill="none" stroke="#6ee7b7" strokeWidth="1" opacity="0.24" />

          {dots.map((dot) => (
            <circle
              key={dot.key}
              cx={dot.x}
              cy={dot.y}
              r={dot.r}
              fill="#10b981"
              opacity={dot.opacity}
            />
          ))}

          {/* Highlighted active probe points */}
          {[
            { x: 640, y: 552 },
            { x: 782, y: 604 },
            { x: 900, y: 520 },
            { x: 1020, y: 630 },
            { x: 1124, y: 578 },
          ].map((probe, idx) => (
            <g key={`probe-${idx}`}>
              <circle cx={probe.x} cy={probe.y} r="3.6" fill="#34d399" opacity="0.92" />
              <circle cx={probe.x} cy={probe.y} r="9" fill="none" stroke="#6ee7b7" strokeWidth="1" opacity="0.45" />
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
