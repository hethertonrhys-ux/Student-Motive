// The map's grey background straight away while the page loads.
export default function Loading() {
  return <div role="status" aria-label="Loading map" className="h-[calc(100dvh-57px-var(--banner-h,0px)-var(--tabbar-h))] w-full animate-pulse bg-[#e9ebf0]" />;
}
