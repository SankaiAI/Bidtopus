'use client'

/**
 * Skeleton primitives. Animate via the `.skeleton-pulse` class defined in
 * globals.css (1.5s opacity cycle). Use `<SkeletonBlock w h />` for sized
 * rectangles, or compose into card/row layouts that mirror the eventual
 * content so the transition to real data doesn't shift the layout.
 */

const PILL_BG = 'var(--c-bar-track)'

export function SkeletonBlock({ w = '100%', h = '12px', radius = '4px', style }) {
  return (
    <div
      className="skeleton-pulse"
      style={{
        width: w,
        height: h,
        borderRadius: radius,
        background: PILL_BG,
        ...style,
      }}
    />
  )
}

/**
 * Row that mirrors the contract list row shape:
 *   [dot] [name + sub]                       [right value] [badge] [chevron]
 */
export function ContractRowSkeleton() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '14px 20px',
      background: 'var(--c-surface)',
      border: '1px solid var(--c-border)',
      borderRadius: '12px',
    }}>
      <SkeletonBlock w="7px" h="7px" radius="50%" />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <SkeletonBlock w="55%" h="14px" />
        <SkeletonBlock w="35%" h="11px" />
      </div>
      <SkeletonBlock w="64px" h="12px" />
      <SkeletonBlock w="58px" h="20px" radius="20px" />
    </div>
  )
}

/**
 * Compact row for dashboard "Recent Contracts" table — slimmer than the full
 * My Contracts row.
 */
export function CompactContractRowSkeleton() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '16px',
      padding: '12px 16px',
      borderBottom: '1px solid var(--c-border)',
    }}>
      <div style={{ flex: 2, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <SkeletonBlock w="55%" h="13px" />
        <SkeletonBlock w="40%" h="11px" />
      </div>
      <SkeletonBlock w="64px" h="13px" />
      <SkeletonBlock w="58px" h="20px" radius="20px" />
    </div>
  )
}

/**
 * Sidebar workspace row skeleton — dot + two text lines.
 */
export function SidebarRowSkeleton() {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '7px 8px' }}>
      <SkeletonBlock w="6px" h="6px" radius="50%" style={{ marginTop: '5px' }} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <SkeletonBlock w="80%" h="13px" />
        <SkeletonBlock w="40%" h="10px" />
      </div>
    </div>
  )
}

export function SkeletonList({ count, render }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {Array.from({ length: count }, (_, i) => <div key={i}>{render(i)}</div>)}
    </div>
  )
}
