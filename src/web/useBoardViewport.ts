import { useRef, useState, type PointerEvent } from 'react';

type Point = { x: number; y: number };
type Camera = Point & { zoom: number };
const initial: Camera = { x: 0, y: 0, zoom: 1 };
export function clampCamera(camera: Camera,width=940,height=680): Camera {
  const zoom = Math.max(1, Math.min(3, camera.zoom));
  const limitX = width/2 * (zoom - 1), limitY = height/2 * (zoom - 1);
  return { zoom, x: Math.max(-limitX, Math.min(limitX, camera.x)), y: Math.max(-limitY, Math.min(limitY, camera.y)) };
}

// Camera coordinates are SVG units. They never enter a gameplay request.
export function useBoardViewport(onTap: (cell: string) => void, width=940,height=680) {
  const [camera, setCamera] = useState(initial);
  const current = useRef(initial);
  const fingers = useRef(new Map<number, Point>());
  const gesture = useRef<{ origin: Point; previous: Point; span: number; dragged: boolean } | null>(null);
  const update = (value: Camera) => { current.current = clampCamera(value,width,height); setCamera(current.current); };
  const centroid = () => {
    const points = [...fingers.current.values()];
    return { x: points.reduce((n, p) => n + p.x, 0) / points.length, y: points.reduce((n, p) => n + p.y, 0) / points.length };
  };
  const span = () => { const [a, b] = [...fingers.current.values()]; return b ? Math.hypot(a.x - b.x, a.y - b.y) : 0; };
  const down = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    fingers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture(event.pointerId);
    const middle = centroid();
    gesture.current = { origin: middle, previous: middle, span: span(), dragged: fingers.current.size > 1 || !!gesture.current?.dragged };
  };
  const move = (event: PointerEvent<SVGSVGElement>) => {
    if (!fingers.current.has(event.pointerId) || !gesture.current) return;
    fingers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const g = gesture.current, middle = centroid();
    if (Math.hypot(middle.x - g.origin.x, middle.y - g.origin.y) > 6) g.dragged = true;
    if (!g.dragged) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const unit = Math.max(width / rect.width,height / rect.height);
    const c = current.current, nextSpan = span();
    const zoom = Math.max(1, Math.min(3, g.span && nextSpan ? c.zoom * nextSpan / g.span : c.zoom));
    const ratio = zoom / c.zoom;
    const anchor = { x: (g.previous.x - rect.left) * unit - width/2, y: (g.previous.y - rect.top) * unit - height/2 };
    update({ zoom, x: anchor.x - (anchor.x - c.x) * ratio + (middle.x - g.previous.x) * unit, y: anchor.y - (anchor.y - c.y) * ratio + (middle.y - g.previous.y) * unit });
    g.previous = middle; g.span = nextSpan;
  };
  const end = (event: PointerEvent<SVGSVGElement>) => {
    if (!fingers.current.has(event.pointerId)) return;
    const tapped = event.type === 'pointerup' && !gesture.current?.dragged && fingers.current.size === 1;
    fingers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (fingers.current.size && gesture.current) { gesture.current.previous = centroid(); gesture.current.span = span(); gesture.current.dragged = true; }
    else gesture.current = null;
    if (tapped) {
      const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-cell]');
      if (hit && event.currentTarget.contains(hit)) onTap(hit.getAttribute('data-cell')!);
    }
  };
  return {
    camera, transform: `translate(${470 + camera.x} ${340 + camera.y}) scale(${camera.zoom}) translate(-470 -340)`,
    reset: () => update(initial), zoomOut: () => update({ ...current.current, zoom: current.current.zoom - .5 }), zoomIn: () => update({ ...current.current, zoom: current.current.zoom + .5 }),
    handlers: { onPointerDown: down, onPointerMove: move, onPointerUp: end, onPointerCancel: end, onLostPointerCapture: end },
  };
}
