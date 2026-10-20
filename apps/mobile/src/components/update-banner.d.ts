// Types for the per-platform files: update-banner.native.tsx (phones: the
// "A new version of Function is ready" banner for over-the-air updates) and
// update-banner.web.tsx (the website: shows nothing). Metro picks the right
// one at build time.
import type { ReactElement } from "react";
export declare function UpdateBanner(): ReactElement | null;
