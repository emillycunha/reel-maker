export type Grade = {
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
};
export function captionSlides(project: {
  style?: { maxWords?: number; allCaps?: boolean };
  shots: { in: number; out: number; caption: string }[];
  captions?: {
    start: number;
    end: number;
    text: string;
    words?: { start: number }[];
  }[];
}): { start: number; end: number; text: string }[];
export const neutralColor: Grade;
export const colorPresets: Record<string, Grade>;
export function colorSettings(color?: Partial<Grade>): Grade;
export function colorFilter(color?: Partial<Grade>): string;
