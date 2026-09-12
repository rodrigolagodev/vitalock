import { cn } from '../../lib/utils';

export interface BrandLogo {
  /** Logo shown on light backgrounds (theme = light). */
  lightSrc: string;
  /** Logo shown on dark backgrounds (theme = dark). */
  darkSrc: string;
  /** Accessible name of the brand. Defaults to `"Vitalock"`. */
  alt?: string;
}

export interface BrandLogoImagesProps {
  logo: BrandLogo;
  /** Extra classes for both images (typically the height, e.g. `h-8`). */
  className?: string;
}

/**
 * Theme-aware brand logo: renders the light variant (hidden in dark mode)
 * and the dark variant (hidden in light mode). Only the light image carries
 * the accessible name; the dark one is decorative so AT reads the brand once.
 */
export function BrandLogoImages({ logo, className }: BrandLogoImagesProps) {
  return (
    <>
      <img
        src={logo.lightSrc}
        alt={logo.alt ?? 'Vitalock'}
        className={cn('block w-auto dark:hidden', className)}
      />
      <img
        src={logo.darkSrc}
        alt=""
        aria-hidden="true"
        className={cn('hidden w-auto dark:block', className)}
      />
    </>
  );
}
