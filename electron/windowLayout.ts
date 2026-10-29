export type Bounds = { x: number; y: number; width: number; height: number };
export function centeredLayout(
  current: Bounds,
  work: Bounds,
  width: number,
  height: number,
): Bounds {
  const w = Math.min(work.width, Math.max(200, Math.round(width)));
  const h = Math.min(work.height, Math.max(100, Math.round(height)));
  return {
    width: w,
    height: h,
    x: Math.round(
      Math.max(
        work.x,
        Math.min(
          work.x + work.width - w,
          current.x + current.width / 2 - w / 2,
        ),
      ),
    ),
    y: Math.round(
      Math.max(
        work.y,
        Math.min(
          work.y + work.height - h,
          current.y + current.height / 2 - h / 2,
        ),
      ),
    ),
  };
}
