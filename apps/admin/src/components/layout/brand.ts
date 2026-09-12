import type { BrandLogo } from '@vitalock/ui';

/** Admin brand logo URLs, resolved against Vite's base path. */
export const adminLogo: BrandLogo = {
  lightSrc: `${import.meta.env.BASE_URL}Vitalock_logo_vector_black.svg`,
  darkSrc: `${import.meta.env.BASE_URL}Vitalock_logo_vector_white.svg`,
  alt: 'Vitalock',
};
