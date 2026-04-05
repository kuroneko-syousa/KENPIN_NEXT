/* 注釈ツール共通型 — konva-annotator と workspace-studio が共有 */

export type BoxRegion   = { type: "box";     id: string; cls?: string; x: number; y: number; w: number; h: number };
export type PolyRegion  = { type: "polygon"; id: string; cls?: string; points: Array<[number, number]> };
export type PointRegion = { type: "point";   id: string; cls?: string; x: number; y: number };
export type AnyRegion = BoxRegion | PolyRegion | PointRegion;

export type AnnotateImage = {
  src: string;
  name: string;
  regions: AnyRegion[];
};

export type DrawTool = "select" | "box" | "polygon" | "point";
