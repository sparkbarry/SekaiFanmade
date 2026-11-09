/**
 * The faint triangles and rings behind every page, after Moesekai's background. Painted once, fixed to the
 * viewport, never animated.
 */
export function Shards() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 size-full opacity-100 dark:opacity-60"
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
    >
      <polygon points="1180,40 1260,90 1170,130" fill="var(--shard-a)" fillOpacity="0.14" />
      <polygon points="980,170 1100,110 1060,250" fill="var(--shard-b)" fillOpacity="0.07" />
      <polygon points="380,210 420,190 410,240" fill="none" stroke="var(--shard-b)" strokeOpacity="0.35" strokeWidth="2" />
      <circle cx="620" cy="60" r="9" fill="none" stroke="var(--shard-c)" strokeOpacity="0.35" strokeWidth="2" />
      <polygon points="1320,300 1380,330 1330,370" fill="none" stroke="var(--shard-a)" strokeOpacity="0.45" strokeWidth="2" />
      <circle cx="1400" cy="640" r="6" fill="var(--shard-a)" fillOpacity="0.35" />
      <polygon points="300,700 360,740 290,780" fill="var(--shard-a)" fillOpacity="0.1" />
      <polygon points="1240,800 1300,780 1290,850" fill="none" stroke="var(--shard-b)" strokeOpacity="0.3" strokeWidth="2" />
      <circle cx="760" cy="860" r="11" fill="none" stroke="var(--shard-a)" strokeOpacity="0.4" strokeWidth="2" />
      <polygon points="40,420 90,450 30,480" fill="none" stroke="var(--shard-a)" strokeOpacity="0.35" strokeWidth="2" />
    </svg>
  );
}
