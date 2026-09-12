import type { BrandLogo } from '@vitalock/ui';

/** Installer brand logo URLs, resolved against Vite's base path. */
export const installerLogo: BrandLogo = {
  lightSrc: `${import.meta.env.BASE_URL}Vitalock_logo_vector_black.svg`,
  darkSrc: `${import.meta.env.BASE_URL}Vitalock_logo_vector_white.svg`,
  alt: 'Vitalock',
};
