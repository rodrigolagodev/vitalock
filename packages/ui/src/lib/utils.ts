import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Teach tailwind-merge the design-token class names. Without this,
// `text-title-1` is treated as a text colour and dropped next to
// `text-foreground`, and `shadow-elevation-2` as a shadow colour.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      spacing: ['control-sm', 'control-md', 'control-lg'],
      borderRadius: ['control', 'container', 'sheet'],
    },
    classGroups: {
      'font-size': [
        {
          text: [
            'large-title',
            'title-1',
            'title-2',
            'title-3',
            'headline',
            'body',
            'callout',
            'footnote',
            'caption',
          ],
        },
      ],
      shadow: [{ shadow: ['elevation-0', 'elevation-1', 'elevation-2', 'elevation-3'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
