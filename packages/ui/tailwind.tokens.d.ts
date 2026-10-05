export type TypeName =
  | 'large-title'
  | 'title-1'
  | 'title-2'
  | 'title-3'
  | 'headline'
  | 'body'
  | 'callout'
  | 'footnote'
  | 'caption';
export type TypeEntry = [string, { lineHeight: string; fontWeight: string }];
export const fontFamily: { sans: string[] };
export const typeScale: Record<TypeName, TypeEntry>;
export const touchTypeScale: Record<TypeName, TypeEntry>;
export const radius: { control: string; container: string; sheet: string };
export const controlHeight: Record<'control-sm' | 'control-md' | 'control-lg', string>;
export const safeArea: Record<'safe-t' | 'safe-b', string>;
export const tabBar: { height: string };
export const elevation: Record<
  'elevation-0' | 'elevation-1' | 'elevation-2' | 'elevation-3',
  string
>;
export const motion: {
  duration: { state: string; overlay: string };
  timing: { standard: string };
};
