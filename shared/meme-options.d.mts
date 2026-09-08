export type MemeOptions = {
  freeText: string;
  freeX: number;
  freeY: number;
  freeSize: number;
  freeColor: string;
  freeFont: string;
  freeOutline: number;
  sourceVolume: number;
  soundtrackId: string;
  soundtrackVolume: number;
  fadeIn: number;
  fadeOut: number;
  overlayMode: "cutout" | "original";
  layout: "v1" | "v2";
  boxX: number;
  boxY: number;
  boxWidth: number;
  boxHeight: number;
};
export const MEME_MAX_TRIM_SECONDS: 15;
export const memeOptions: MemeOptions;
export function normalizeMeme<T>(m: T): T & MemeOptions;
export function maskBox(
  m: Partial<MemeOptions>,
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number };
export function audioEnvelope(
  t: number,
  duration: number,
  fadeIn: number,
  fadeOut: number,
): number;
