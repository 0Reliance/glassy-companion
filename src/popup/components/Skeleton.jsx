import React from 'react'

/**
 * Skeleton loading UI — mimics the popup layout during data loading.
 */
export default function Skeleton({ variant = 'save' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '12px 0' }}>
      {/* OG image placeholder */}
      <SkeletonBlock width="100%" height={110} borderRadius={14} />

      {/* Title field */}
      <SkeletonBlock width="100%" height={42} borderRadius={10} />

      {/* Collection + Tags */}
      <div style={{ display: 'flex', gap: 12 }}>
        <SkeletonBlock width="48%" height={38} borderRadius={8} />
        <SkeletonBlock width="48%" height={38} borderRadius={8} />
      </div>

      {/* Note field */}
      <SkeletonBlock width="100%" height={80} borderRadius={10} />

      {/* Toggles */}
      <div style={{ display: 'flex', gap: 20 }}>
        <SkeletonBlock width={120} height={20} borderRadius={4} />
        <SkeletonBlock width={100} height={20} borderRadius={4} />
        <SkeletonBlock width={90} height={20} borderRadius={4} />
      </div>

      {/* Save button */}
      <SkeletonBlock width="100%" height={48} borderRadius={12} />
    </div>
  )
}

function SkeletonBlock({ width, height, borderRadius = 8 }) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius,
        background: 'linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite',
      }}
    />
  )
}
