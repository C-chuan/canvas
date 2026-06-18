import React from "react";
import { createRoot } from "react-dom/client";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Brush,
  Check,
  ChevronLeft,
  ChevronRight,
  Eraser,
  Circle,
  Copy,
  Crop,
  CircleDashed,
  Diamond,
  Droplet,
  Eye,
  EyeOff,
  FlipHorizontal,
  FlipVertical,
  Image,
  Italic,
  Lightbulb,
  LineChart,
  Maximize2,
  Menu,
  Minus,
  MousePointer2,
  MoveDown,
  MoveUp,
  Pentagon,
  PenLine,
  Plus,
  Redo2,
  RotateCcw,
  Scissors,
  Settings,
  Shapes,
  Slash,
  SlidersHorizontal,
  Square,
  Sun,
  Trash2,
  Triangle,
  Type,
  Underline,
  Undo2,
  Upload,
  WandSparkles,
  Waves,
  X
} from "lucide-react";
import "./styles.css";

type Tool = "select" | "brush" | "shape" | "line" | "text" | "upload";
type Ratio = "custom" | "16:9" | "9:16" | "4:3" | "3:4" | "1:1";
type LayerType = "image" | "text" | "shape" | "line" | "curve" | "brush";
type ShapeKind = "rect" | "rounded" | "circle" | "triangle" | "invertedTriangle" | "diamond" | "pentagon";
type StrokeStyle = "none" | "solid" | "dashed" | "dotted";

type BaseLayer = {
  id: string;
  type: LayerType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  opacity: number;
  rotation?: number;
  flipX?: boolean;
  flipY?: boolean;
};

type ShapeLayer = BaseLayer & {
  type: "shape";
  shape: ShapeKind;
  fill: string;
  noFill?: boolean;
  stroke: string;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  radius: number;
};

type TextLayer = BaseLayer & {
  type: "text";
  text: string;
  color: string;
  fontFamily: string;
  fontSize: number;
  letterSpacing?: number;
  lineHeight?: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  align: "left" | "center" | "right";
};

type ImageAdjust = {
  // 白平衡
  temperature: number; // -100..100，正=暖（偏黄），负=冷（偏蓝）
  tint: number;        // -100..100，正=品红，负=绿
  // 光线
  brightness: number;  // -100..100
  contrast: number;    // -100..100
  highlights: number;  // -100..100，正=提亮高光，负=压暗高光
  shadows: number;     // -100..100，正=提亮阴影，负=压暗阴影
  whites: number;      // -100..100，最亮端
  blacks: number;      // -100..100，最暗端
  // 颜色
  invert: boolean;
  vibrance: number;    // -100..100
  saturation: number;  // -100..100
  // 纹理
  sharpen: number;     // 0..100
  clarity: number;     // -100..100
  vignette: number;    // -100..100，负=四角变暗，正=四角变亮
};

const DEFAULT_IMAGE_ADJUST: ImageAdjust = {
  temperature: 0, tint: 0,
  brightness: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0,
  invert: false, vibrance: 0, saturation: 0,
  sharpen: 0, clarity: 0, vignette: 0,
};

// 裁剪：crop 表示当前图层（layer.width × layer.height）对应到原图的"显示窗口"，0..1 相对原图。
// 例如 {x:0.1, y:0.1, w:0.5, h:0.5} 表示图层显示原图中央往内 10% 起、50% 大小的区域。
// 图层尺寸已经是裁剪后的尺寸（裁剪会同时缩小 layer.width/height）。
type ImageCrop = { x: number; y: number; w: number; h: number };

type ImageLayer = BaseLayer & {
  type: "image";
  src: string;
  crop?: ImageCrop;            // undefined 表示未裁剪（= 显示整张图）
  adjust?: ImageAdjust;
  cornerRadius?: number;       // 圆角，0..50（百分比，0 不裁切，50=圆形）
};

type CutoutCandidate = {
  id: string;
  bbox: { x: number; y: number; width: number; height: number };
  maskSrc: string;
  mask: Uint8Array;
  maskWidth: number;
  maskHeight: number;
  naturalWidth: number;
  naturalHeight: number;
};

type CutoutSession = {
  layerId: string;
  status: "processing" | "ready";
  candidates: CutoutCandidate[];
  hoverId: string | null;
  activeIds: string[];
};

type LineCap = "none" | "arrow" | "circle" | "square" | "diamond" | "bar" | "arrow-filled" | "circle-filled" | "square-filled" | "diamond-filled";

type LineLayer = BaseLayer & {
  type: "line" | "curve";
  color: string;
  strokeWidth: number;
  strokeStyle: "solid" | "dashed" | "dotted";
  points: { x: number; y: number }[];
  startCap?: LineCap;
  endCap?: LineCap;
};

// 画笔笔迹点：可选 m=true 表示「这是一段新子路径的起点」（SVG M 指令）
// 没有 m 的点视为 L（折线连接前一点）。橡皮擦在数组中部剔除点后，
// 给紧跟其后的下一个保留点设 m=true，让两段不被连成一条直线。
type BrushPoint = { x: number; y: number; m?: boolean };

type BrushLayer = BaseLayer & {
  type: "brush";
  color: string;
  strokeWidth: number;
  points: BrushPoint[];
};

type Layer = ShapeLayer | TextLayer | ImageLayer | LineLayer | BrushLayer;

type EditorState = {
  canvas: { width: number; height: number; background: string; ratio: Ratio };
  layers: Layer[];
};

const normalizeAngle = (angle: number) => ((Math.round(angle) % 360) + 360) % 360;

const ratioSizes: Record<Ratio, { width: number; height: number }> = {
  custom: { width: 600, height: 400 },
  "16:9": { width: 800, height: 450 },
  "9:16": { width: 360, height: 640 },
  "4:3": { width: 640, height: 480 },
  "3:4": { width: 480, height: 640 },
  "1:1": { width: 560, height: 560 }
};

const ratioLabels: Record<Ratio, string> = {
  custom: "自定义",
  "16:9": "16:9",
  "9:16": "9:16",
  "4:3": "4:3",
  "3:4": "3:4",
  "1:1": "1:1"
};

const initialState: EditorState = {
  canvas: { ...ratioSizes["16:9"], background: "#ffffff", ratio: "16:9" },
  layers: []
};

const cloneLayer = (layer: Layer, patch: Partial<Layer> = {}) => ({ ...layer, ...patch }) as Layer;

// ===== 图片调整：把 ImageAdjust 序列化为 SVG <filter> 子节点列表与 CSS filter 字符串 =====
const isAdjustActive = (a: ImageAdjust) =>
  a.invert ||
  a.temperature || a.tint ||
  a.brightness || a.contrast || a.highlights || a.shadows || a.whites || a.blacks ||
  a.vibrance || a.saturation ||
  a.sharpen || a.clarity || a.vignette;

// 生成对应的 SVG filter 节点（React 元素）。返回 null 时表示无需 filter。
function buildImageAdjustFilter(id: string, a: ImageAdjust): React.ReactElement | null {
  if (!isAdjustActive(a)) return null;
  const nodes: React.ReactElement[] = [];

  // 1) 白平衡：色温（R↔B）+ 色调（G↔M）
  // 用 feColorMatrix 矩阵在 0 处保持中性，幅度 ±100 → 偏移 ±0.15
  const tempK = a.temperature / 100 * 0.15;
  const tintK = a.tint / 100 * 0.15;
  if (tempK || tintK) {
    // R += temp; B -= temp;  G -= tint; B/R 微调以保持亮度
    const m = [
      1, 0, 0, 0, tempK,
      0, 1, 0, 0, -tintK,
      0, 0, 1, 0, -tempK,
      0, 0, 0, 1, 0,
    ];
    nodes.push(<feColorMatrix key="wb" type="matrix" values={m.join(" ")} />);
  }

  // 2) 饱和度（saturation）
  if (a.saturation) {
    const s = 1 + a.saturation / 100; // -100→0, 0→1, 100→2
    nodes.push(<feColorMatrix key="sat" type="saturate" values={String(Math.max(0, s))} />);
  }

  // 3) 自然饱和度：用较弱的 saturate（0.5×），并在已经接近灰阶时降低影响——
  //    在 SVG filter 里无法做"按饱和度自适应"，简化为 0.5× 强度的整体饱和度。
  if (a.vibrance) {
    const s = 1 + (a.vibrance / 100) * 0.5;
    nodes.push(<feColorMatrix key="vib" type="saturate" values={String(Math.max(0, s))} />);
  }

  // 4) 亮度 / 对比度（feComponentTransfer 线性变换）
  // 对每个通道：y = slope*x + intercept
  const brightnessOffset = a.brightness / 100 * 0.5;
  const contrastSlope = 1 + a.contrast / 100;
  const contrastIntercept = (1 - contrastSlope) / 2;
  if (a.brightness || a.contrast) {
    const slope = contrastSlope;
    const intercept = contrastIntercept + brightnessOffset;
    const tf = (
      <feComponentTransfer key="bc">
        <feFuncR type="linear" slope={String(slope)} intercept={String(intercept)} />
        <feFuncG type="linear" slope={String(slope)} intercept={String(intercept)} />
        <feFuncB type="linear" slope={String(slope)} intercept={String(intercept)} />
      </feComponentTransfer>
    );
    nodes.push(tf);
  }

  // 5) 高光 / 阴影 / 白色 / 黑色 —— 通过 tableValues 分别在亮端/暗端做提升或压低
  if (a.highlights || a.shadows || a.whites || a.blacks) {
    // 把 0..1 离散成 9 个采样点，按各自影响曲线调整
    const N = 9;
    const table: number[] = [];
    for (let i = 0; i < N; i++) {
      const x = i / (N - 1); // 0..1
      // 影响权重（高斯样钟形 / 线性边端）
      const wShadow = Math.max(0, 1 - x * 2);          // 暗端权重，0 处=1，0.5 处=0
      const wHighlight = Math.max(0, x * 2 - 1);       // 亮端权重，1 处=1，0.5 处=0
      const wBlack = Math.max(0, 1 - x * 4);           // 最暗端
      const wWhite = Math.max(0, x * 4 - 3);           // 最亮端
      const delta =
        wShadow * (a.shadows / 100) * 0.35 +
        wHighlight * (a.highlights / 100) * 0.35 +
        wBlack * (a.blacks / 100) * 0.35 +
        wWhite * (a.whites / 100) * 0.35;
      table.push(Math.max(0, Math.min(1, x + delta)));
    }
    const t = table.join(" ");
    nodes.push(
      <feComponentTransfer key="tone">
        <feFuncR type="table" tableValues={t} />
        <feFuncG type="table" tableValues={t} />
        <feFuncB type="table" tableValues={t} />
      </feComponentTransfer>
    );
  }

  // 6) 反色
  if (a.invert) {
    nodes.push(
      <feComponentTransfer key="inv">
        <feFuncR type="table" tableValues="1 0" />
        <feFuncG type="table" tableValues="1 0" />
        <feFuncB type="table" tableValues="1 0" />
      </feComponentTransfer>
    );
  }

  // 7) 锐化 / 清晰度 —— feConvolveMatrix
  // 锐化用 3x3 拉普拉斯核；负值改用高斯模糊达到"反锐化"效果
  if (a.sharpen > 0) {
    const k = a.sharpen / 100;
    const c = 1 + 4 * k;
    const e = -k;
    nodes.push(
      <feConvolveMatrix
        key="sharpen"
        order="3"
        preserveAlpha="true"
        kernelMatrix={`0 ${e} 0 ${e} ${c} ${e} 0 ${e} 0`}
      />
    );
  } else if (a.sharpen < 0) {
    // -100..0 → 模糊半径 0..3px
    const r = (-a.sharpen / 100) * 3;
    nodes.push(<feGaussianBlur key="sharpen" stdDeviation={String(r)} edgeMode="duplicate" />);
  }
  if (a.clarity) {
    const k = (a.clarity / 100) * 0.6;
    const c = 1 + 4 * k;
    const e = -k;
    nodes.push(
      <feConvolveMatrix
        key="clarity"
        order="3"
        preserveAlpha="true"
        kernelMatrix={`0 ${e} 0 ${e} ${c} ${e} 0 ${e} 0`}
      />
    );
  }

  if (!nodes.length) return null;
  return (
    <filter id={id} colorInterpolationFilters="sRGB">
      {nodes}
    </filter>
  );
}

// 点 (px, py) 到线段 (ax, ay)-(bx, by) 的最短距离平方
const distSqToSegment = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  const ex = px - cx;
  const ey = py - cy;
  return ex * ex + ey * ey;
};

// 判断画板坐标 (x, y) 是否命中画笔图层（橡皮擦半径 eraserRadius）
// b.m=true 表示从 b 开始新子路径，跨过断点的相邻两点不视为线段（避免连线）
const brushLayerHit = (layer: BrushLayer, x: number, y: number, eraserRadius: number) => {
  const localX = x - layer.x;
  const localY = y - layer.y;
  const threshold = layer.strokeWidth / 2 + eraserRadius;
  const thresholdSq = threshold * threshold;
  if (layer.points.length === 0) return false;
  // 孤立点（含两端不连接的点）也用半径命中：找出每个"段"的单点情况
  // 但实现上更简单：对每个相邻 (a, b)，若 b.m → 跳过该段，但 a 自身做点命中
  for (let i = 0; i < layer.points.length; i++) {
    const a = layer.points[i];
    const b = layer.points[i + 1];
    // a 自身的点命中（覆盖孤立点 / 子路径起点）
    const dxa = a.x - localX;
    const dya = a.y - localY;
    if (dxa * dxa + dya * dya <= thresholdSq) return true;
    if (!b) break;
    if (b.m) continue; // 跨断点，不算线段
    if (distSqToSegment(localX, localY, a.x, a.y, b.x, b.y) <= thresholdSq) return true;
  }
  return false;
};

// 用橡皮擦中心 (x, y) 和半径擦除画笔图层笔迹：
// 返回新的 points 数组（落在圆内的点剔除，被擦点后的下一个保留点设 m=true 作为新子路径起点）。
// 若 points 没有变化返回 null，调用方可据此跳过 setState。
const eraseBrushPoints = (
  layer: BrushLayer,
  x: number,
  y: number,
  eraserRadius: number
): BrushPoint[] | null => {
  const localX = x - layer.x;
  const localY = y - layer.y;
  // 擦除阈值：橡皮擦半径 + 笔迹半描边，使得"擦过描边外缘"也能擦掉那一段
  const threshold = layer.strokeWidth / 2 + eraserRadius;
  const thresholdSq = threshold * threshold;
  const next: BrushPoint[] = [];
  let removedAny = false;
  let needNewSubpath = false;
  for (let i = 0; i < layer.points.length; i++) {
    const p = layer.points[i];
    const dx = p.x - localX;
    const dy = p.y - localY;
    const hit = dx * dx + dy * dy <= thresholdSq;
    if (hit) {
      removedAny = true;
      needNewSubpath = true; // 下一个保留点要变成新子路径的起点
      continue;
    }
    if (needNewSubpath) {
      next.push({ x: p.x, y: p.y, m: true });
      needNewSubpath = false;
    } else {
      // 保持原来的 m 标记（不丢失原来的子路径结构）
      next.push(p.m ? { x: p.x, y: p.y, m: true } : { x: p.x, y: p.y });
    }
  }
  if (!removedAny) return null;
  // 首点永远是 M（SVG 起点），把首点的 m 字段去掉以保持简洁
  if (next.length && next[0].m) {
    next[0] = { x: next[0].x, y: next[0].y };
  }
  return next;
};

// 计算画笔图层的实际笔迹包围盒（局部坐标系，已含描边半径）
const brushBoundingBox = (layer: BrushLayer) => {
  if (!layer.points.length) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of layer.points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const r = layer.strokeWidth / 2;
  return { x: minX - r, y: minY - r, width: (maxX - minX) + r * 2, height: (maxY - minY) + r * 2 };
};
const uid = () => Math.random().toString(36).slice(2, 10);
const clampColor = (value: number) => Math.max(0, Math.min(255, Number.isFinite(value) ? value : 0));
const componentToHex = (value: number) => clampColor(value).toString(16).padStart(2, "0");
const rgbToHex = (r: number, g: number, b: number) => `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;
const hexToRgb = (hex: string) => {
  const clean = hex.replace("#", "").trim();
  const normalized = clean.length === 3 ? clean.split("").map((char) => char + char).join("") : clean;
  const safe = /^[0-9a-fA-F]{6}$/.test(normalized) ? normalized : "ffffff";
  return {
    r: parseInt(safe.slice(0, 2), 16),
    g: parseInt(safe.slice(2, 4), 16),
    b: parseInt(safe.slice(4, 6), 16)
  };
};

const rgbToHsv = (r: number, g: number, b: number) => {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h = h * 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
};

const hsvToRgb = (h: number, s: number, v: number) => {
  const c = v * s;
  const hp = (h % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if (hp >= 0 && hp < 1) { r1 = c; g1 = x; }
  else if (hp < 2) { r1 = x; g1 = c; }
  else if (hp < 3) { g1 = c; b1 = x; }
  else if (hp < 4) { g1 = x; b1 = c; }
  else if (hp < 5) { r1 = x; b1 = c; }
  else { r1 = c; b1 = x; }
  const m = v - c;
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255)
  };
};

const loadImageElement = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("blob read failed"));
    reader.readAsDataURL(blob);
  });

const createAiCutoutSource = async (src: string): Promise<string> => {
  const { removeBackground } = await import("@imgly/background-removal");
  const blob = await removeBackground(src, {
    model: "isnet_quint8",
    output: { format: "image/png", quality: 0.92 },
  });
  return blobToDataUrl(blob);
};

const colorDistanceSq = (
  data: Uint8ClampedArray,
  index: number,
  color: { r: number; g: number; b: number }
) => {
  const dr = data[index] - color.r;
  const dg = data[index + 1] - color.g;
  const db = data[index + 2] - color.b;
  return dr * dr + dg * dg + db * db;
};

const createAlphaSubjectCandidate = async (src: string): Promise<CutoutCandidate | null> => {
  const img = await loadImageElement(src);
  const naturalWidth = img.naturalWidth || img.width;
  const naturalHeight = img.naturalHeight || img.height;
  const maxSide = 480;
  const scale = Math.min(1, maxSide / Math.max(naturalWidth, naturalHeight));
  const w = Math.max(1, Math.round(naturalWidth * scale));
  const h = Math.max(1, Math.round(naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  const image = ctx.getImageData(0, 0, w, h);
  const data = image.data;
  const total = w * h;
  const mask = new Uint8Array(total);
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let p = 0; p < total; p++) {
    const alpha = data[p * 4 + 3];
    if (alpha < 16) continue;
    const x = p % w;
    const y = Math.floor(p / w);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    mask[p] = alpha;
  }
  if (maxX < minX || maxY < minY) return null;

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = w;
  maskCanvas.height = h;
  const maskCtx = maskCanvas.getContext("2d");
  if (!maskCtx) return null;
  const maskImage = maskCtx.createImageData(w, h);
  for (let p = 0; p < total; p++) {
    const alpha = mask[p];
    if (!alpha) continue;
    const i = p * 4;
    maskImage.data[i] = 255;
    maskImage.data[i + 1] = 255;
    maskImage.data[i + 2] = 255;
    maskImage.data[i + 3] = alpha;
  }
  maskCtx.putImageData(maskImage, 0, 0);

  return {
    id: uid(),
    bbox: {
      x: Math.round(minX / w * naturalWidth),
      y: Math.round(minY / h * naturalHeight),
      width: Math.round((maxX - minX + 1) / w * naturalWidth),
      height: Math.round((maxY - minY + 1) / h * naturalHeight),
    },
    maskSrc: maskCanvas.toDataURL("image/png"),
    mask,
    maskWidth: w,
    maskHeight: h,
    naturalWidth,
    naturalHeight,
  };
};

const createCutoutCandidates = async (src: string): Promise<CutoutCandidate[]> => {
  const img = await loadImageElement(src);
  const naturalWidth = img.naturalWidth || img.width;
  const naturalHeight = img.naturalHeight || img.height;
  const maxSide = 360;
  const scale = Math.min(1, maxSide / Math.max(naturalWidth, naturalHeight));
  const w = Math.max(1, Math.round(naturalWidth * scale));
  const h = Math.max(1, Math.round(naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, w, h);
  const image = ctx.getImageData(0, 0, w, h);
  const data = image.data;
  const total = w * h;
  let hasTransparentPixels = false;
  for (let p = 0; p < total; p++) {
    if (data[p * 4 + 3] < 12) {
      hasTransparentPixels = true;
      break;
    }
  }
  const borderSamples: { r: number; g: number; b: number }[] = [];
  const sampleStep = Math.max(1, Math.floor(Math.max(w, h) / 80));
  const pushSample = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    if (data[i + 3] < 12) return;
    borderSamples.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
  };
  for (let x = 0; x < w; x += sampleStep) {
    pushSample(x, 0);
    pushSample(x, h - 1);
  }
  for (let y = 0; y < h; y += sampleStep) {
    pushSample(0, y);
    pushSample(w - 1, y);
  }

  const bgThresholdSq = 46 * 46;
  const isLikelyBackground = (pixel: number) => {
    const i = pixel * 4;
    if (data[i + 3] < 12) return true;
    if (!borderSamples.length) return false;
    let best = Infinity;
    for (const color of borderSamples) {
      best = Math.min(best, colorDistanceSq(data, i, color));
      if (best <= bgThresholdSq) return true;
    }
    return false;
  };

  const background = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  const enqueue = (pixel: number) => {
    if (background[pixel] || !isLikelyBackground(pixel)) return;
    background[pixel] = 1;
    queue[tail++] = pixel;
  };
  for (let x = 0; x < w; x++) {
    enqueue(x);
    enqueue((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    enqueue(y * w);
    enqueue(y * w + w - 1);
  }
  while (head < tail) {
    const pixel = queue[head++];
    const x = pixel % w;
    const y = Math.floor(pixel / w);
    if (x > 0) enqueue(pixel - 1);
    if (x < w - 1) enqueue(pixel + 1);
    if (y > 0) enqueue(pixel - w);
    if (y < h - 1) enqueue(pixel + w);
  }

  const foreground = new Uint8Array(total);
  for (let p = 0; p < total; p++) {
    foreground[p] = !background[p] && data[p * 4 + 3] > 12 ? 1 : 0;
  }

  const visited = new Uint8Array(total);
  const minArea = Math.max(80, Math.floor(total * 0.006));
  const candidates: CutoutCandidate[] = [];
  const componentQueue = new Int32Array(total);
  for (let start = 0; start < total; start++) {
    if (!foreground[start] || visited[start]) continue;
    let ch = 0;
    let ct = 0;
    let area = 0;
    let minX = w;
    let minY = h;
    let maxX = 0;
    let maxY = 0;
    const pixels: number[] = [];
    visited[start] = 1;
    componentQueue[ct++] = start;
    while (ch < ct) {
      const pixel = componentQueue[ch++];
      pixels.push(pixel);
      area++;
      const x = pixel % w;
      const y = Math.floor(pixel / w);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      const visit = (next: number) => {
        if (visited[next] || !foreground[next]) return;
        visited[next] = 1;
        componentQueue[ct++] = next;
      };
      if (x > 0) visit(pixel - 1);
      if (x < w - 1) visit(pixel + 1);
      if (y > 0) visit(pixel - w);
      if (y < h - 1) visit(pixel + w);
    }
    const boxW = maxX - minX + 1;
    const boxH = maxY - minY + 1;
    if (area < minArea || boxW < 12 || boxH < 12) continue;
    const mask = new Uint8Array(total);
    for (const pixel of pixels) mask[pixel] = 255;
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = w;
    maskCanvas.height = h;
    const maskCtx = maskCanvas.getContext("2d");
    if (!maskCtx) continue;
    const maskImage = maskCtx.createImageData(w, h);
    for (let p = 0; p < total; p++) {
      const a = mask[p];
      if (!a) continue;
      const i = p * 4;
      maskImage.data[i] = 255;
      maskImage.data[i + 1] = 255;
      maskImage.data[i + 2] = 255;
      maskImage.data[i + 3] = a;
    }
    maskCtx.putImageData(maskImage, 0, 0);
    candidates.push({
      id: uid(),
      bbox: {
        x: Math.round(minX / w * naturalWidth),
        y: Math.round(minY / h * naturalHeight),
        width: Math.round(boxW / w * naturalWidth),
        height: Math.round(boxH / h * naturalHeight),
      },
      maskSrc: maskCanvas.toDataURL("image/png"),
      mask,
      maskWidth: w,
      maskHeight: h,
      naturalWidth,
      naturalHeight,
    });
  }
  if (!candidates.length && hasTransparentPixels) {
    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;
    const mask = new Uint8Array(total);
    for (let p = 0; p < total; p++) {
      const alpha = data[p * 4 + 3];
      if (alpha < 12) continue;
      const x = p % w;
      const y = Math.floor(p / w);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      mask[p] = alpha;
    }
    if (maxX >= minX && maxY >= minY) {
      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = w;
      maskCanvas.height = h;
      const maskCtx = maskCanvas.getContext("2d");
      if (maskCtx) {
        const maskImage = maskCtx.createImageData(w, h);
        for (let p = 0; p < total; p++) {
          const a = mask[p];
          if (!a) continue;
          const i = p * 4;
          maskImage.data[i] = 255;
          maskImage.data[i + 1] = 255;
          maskImage.data[i + 2] = 255;
          maskImage.data[i + 3] = a;
        }
        maskCtx.putImageData(maskImage, 0, 0);
        candidates.push({
          id: uid(),
          bbox: {
            x: Math.round(minX / w * naturalWidth),
            y: Math.round(minY / h * naturalHeight),
            width: Math.round((maxX - minX + 1) / w * naturalWidth),
            height: Math.round((maxY - minY + 1) / h * naturalHeight),
          },
          maskSrc: maskCanvas.toDataURL("image/png"),
          mask,
          maskWidth: w,
          maskHeight: h,
          naturalWidth,
          naturalHeight,
        });
      }
    }
  }

  return candidates
    .sort((a, b) => b.bbox.width * b.bbox.height - a.bbox.width * a.bbox.height)
    .slice(0, 8);
};

const getCutoutBounds = (candidates: CutoutCandidate[]) => {
  const left = Math.min(...candidates.map((candidate) => candidate.bbox.x));
  const top = Math.min(...candidates.map((candidate) => candidate.bbox.y));
  const right = Math.max(...candidates.map((candidate) => candidate.bbox.x + candidate.bbox.width));
  const bottom = Math.max(...candidates.map((candidate) => candidate.bbox.y + candidate.bbox.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
};

const createCutoutImage = async (src: string, candidates: CutoutCandidate[]): Promise<string> => {
  const img = await loadImageElement(src);
  const first = candidates[0];
  if (!first) return src;
  const bbox = getCutoutBounds(candidates);
  const { naturalWidth, naturalHeight } = first;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, bbox.width);
  canvas.height = Math.max(1, bbox.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return src;
  ctx.drawImage(img, -bbox.x, -bbox.y, naturalWidth, naturalHeight);
  const out = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const sourceX = bbox.x + x;
      const sourceY = bbox.y + y;
      let alpha = 0;
      for (const candidate of candidates) {
        const mx = Math.max(0, Math.min(candidate.maskWidth - 1, Math.floor(sourceX / candidate.naturalWidth * candidate.maskWidth)));
        const my = Math.max(0, Math.min(candidate.maskHeight - 1, Math.floor(sourceY / candidate.naturalHeight * candidate.maskHeight)));
        alpha = Math.max(alpha, candidate.mask[my * candidate.maskWidth + mx]);
        if (alpha === 255) break;
      }
      out.data[(y * canvas.width + x) * 4 + 3] = alpha;
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvas.toDataURL("image/png");
};

// 点击 refs 之外的任意位置时调用 onOutside。enabled 为 false 时不挂载监听。
function useClickOutside(refs: React.RefObject<HTMLElement | null>[], enabled: boolean, onOutside: () => void) {
  React.useEffect(() => {
    if (!enabled) return;
    const handler = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      for (const ref of refs) {
        if (ref.current && ref.current.contains(target)) return;
      }
      onOutside();
    };
    window.addEventListener("pointerdown", handler);
    return () => window.removeEventListener("pointerdown", handler);
  }, [enabled, onOutside, ...refs]);
}

function App() {
  const [state, setState] = React.useState<EditorState>(initialState);
  const [past, setPast] = React.useState<EditorState[]>([]);
  const [future, setFuture] = React.useState<EditorState[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [tool, setTool] = React.useState<Tool>("select");
  const [toast, setToast] = React.useState("");
  const [shapeMenu, setShapeMenu] = React.useState(false);
  const [lineMenu, setLineMenu] = React.useState(false);
  const [brushMode, setBrushMode] = React.useState<"brush" | "eraser" | null>("brush");
  const [brushColor, setBrushColor] = React.useState("#f97316");
  const [brushSize, setBrushSize] = React.useState(12);
  const [brushOpacity, setBrushOpacity] = React.useState(1);
  // 橡皮擦粗细独立于钢笔粗细 —— 两者互不干扰
  const [eraserSize, setEraserSize] = React.useState(20);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [openMenuId, setOpenMenuId] = React.useState<string | null>(null);
  const [editingNameId, setEditingNameId] = React.useState<string | null>(null);
  // 裁剪模式：cropping=null 表示未在裁剪
  const [cropping, setCropping] = React.useState<{
    layerId: string;
    aspect: number | null;            // null = 自由
    rect: { x: number; y: number; w: number; h: number }; // 0..1 相对当前图层显示区
    backup: { x: number; y: number; width: number; height: number; crop?: ImageCrop; rotation?: number };
  } | null>(null);
  const [editingTextId, setEditingTextId] = React.useState<string | null>(null);
  const [canvasZoom, setCanvasZoom] = React.useState(1);
  const [canvasPan, setCanvasPan] = React.useState({ x: 0, y: 0 });
  const [panDrag, setPanDrag] = React.useState<null | { startX: number; startY: number; baseX: number; baseY: number }>(null);
  const [backgroundPickerOpen, setBackgroundPickerOpen] = React.useState(false);
  const [brushColorPickerOpen, setBrushColorPickerOpen] = React.useState(false);
  const [cutout, setCutout] = React.useState<CutoutSession | null>(null);
  const [layerDrag, setLayerDrag] = React.useState<null | { id: string; overId: string | null; position: "before" | "after" | null }>(null);
  const [marquee, setMarquee] = React.useState<null | { startX: number; startY: number; currentX: number; currentY: number }>(null);
  const [activeDrag, setActiveDrag] = React.useState<null | {
    type: "move" | "groupMove" | "groupScale" | "scale" | "imageScale" | "imageBox" | "rotate" | "canvas" | "linePoint" | "draw" | "erase";
    id?: string;
    ids?: string[];
    corner?: string;
    groupBounds?: { left: number; top: number; right: number; bottom: number };
    pointIndex?: number;
    startX: number;
    startY: number;
    centerX?: number;
    centerY?: number;
    startAngle?: number;
    baseRotation?: number;
    zoom: number;
    base: EditorState;
  }>(null);
  const canvasShellRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLDivElement>(null);
  const textEditBaseRef = React.useRef<EditorState | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const brushToolRef = React.useRef<HTMLDivElement>(null);
  const brushSettingsRef = React.useRef<HTMLDivElement>(null);
  const brushSettingsTriggerRef = React.useRef<HTMLButtonElement>(null);
  const backgroundPickerRef = React.useRef<HTMLDivElement>(null);
  const brushColorPickerRef = React.useRef<HTMLDivElement>(null);
  const shapeMenuRef = React.useRef<HTMLDivElement>(null);
  const lineMenuRef = React.useRef<HTMLDivElement>(null);
  const layerMenuRef = React.useRef<HTMLDivElement>(null);
  const layerMenuTriggerRef = React.useRef<HTMLButtonElement>(null);
  // 内部图层剪贴板：Ctrl+C 把"被选中图层的完整快照"放这里；Ctrl+V 取出生成新图层
  // —— 保证粘贴出来与原图层在画布上完全一致（含 width/height/rotation/crop 等所有缩放/变换后的字段），
  //    避免走 onPaste 系统剪贴板路径时被当成"新建图片"按原图尺寸重新计算
  const layerClipboardRef = React.useRef<Layer[] | null>(null);

  const selected = state.layers.find((layer) => layer.id === selectedId) ?? null;

  const rectsIntersect = (
    a: { left: number; top: number; right: number; bottom: number },
    b: { left: number; top: number; right: number; bottom: number }
  ) => a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;

  const layerVisualBounds = (layer: Layer) => {
    const box = layer.type === "brush" ? brushBoundingBox(layer) : { x: 0, y: 0, width: layer.width, height: layer.height };
    const left = layer.x + box.x;
    const top = layer.y + box.y;
    const right = left + box.width;
    const bottom = top + box.height;
    if (layer.type === "brush" || !(layer.rotation)) return { left, top, right, bottom };
    const cx = layer.x + layer.width / 2;
    const cy = layer.y + layer.height / 2;
    const rad = (layer.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const points = [
      [left, top], [right, top], [right, bottom], [left, bottom],
    ].map(([x, y]) => ({
      x: cx + (x - cx) * cos - (y - cy) * sin,
      y: cy + (x - cx) * sin + (y - cy) * cos,
    }));
    return {
      left: Math.min(...points.map((p) => p.x)),
      top: Math.min(...points.map((p) => p.y)),
      right: Math.max(...points.map((p) => p.x)),
      bottom: Math.max(...points.map((p) => p.y)),
    };
  };

  const selectedGroupBounds = () => {
    const selectedLayers = state.layers.filter((layer) => selectedIds.includes(layer.id) && layer.visible);
    if (!selectedLayers.length) return null;
    const bounds = selectedLayers.map(layerVisualBounds);
    return {
      left: Math.min(...bounds.map((box) => box.left)),
      top: Math.min(...bounds.map((box) => box.top)),
      right: Math.max(...bounds.map((box) => box.right)),
      bottom: Math.max(...bounds.map((box) => box.bottom)),
    };
  };

  // 画布平移：在画布外侧空白区按下后，移动鼠标拖动画布在工作区中的位置
  React.useEffect(() => {
    if (!panDrag) return;
    const onMove = (event: PointerEvent) => {
      setCanvasPan({
        x: panDrag.baseX + (event.clientX - panDrag.startX),
        y: panDrag.baseY + (event.clientY - panDrag.startY)
      });
    };
    const onUp = () => setPanDrag(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [panDrag]);

  React.useEffect(() => {
    if (!marquee) return;
    const onMove = (event: PointerEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMarquee((current) => current ? {
        ...current,
        currentX: (event.clientX - rect.left) / canvasZoom,
        currentY: (event.clientY - rect.top) / canvasZoom,
      } : current);
    };
    const onUp = () => {
      setMarquee((current) => {
        if (!current) return null;
        const left = Math.min(current.startX, current.currentX);
        const top = Math.min(current.startY, current.currentY);
        const right = Math.max(current.startX, current.currentX);
        const bottom = Math.max(current.startY, current.currentY);
        if (right - left < 4 || bottom - top < 4) {
          setSelectedId(null);
          setSelectedIds([]);
          return null;
        }
        const hitIds = state.layers
          .filter((layer) => layer.visible && rectsIntersect(layerVisualBounds(layer), { left, top, right, bottom }))
          .map((layer) => layer.id);
        setSelectedIds(hitIds);
        setSelectedId(hitIds.length === 1 ? hitIds[0] : null);
        return null;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [marquee, canvasZoom, state.layers]);

  // 各浮层的"点击外部关闭"
  useClickOutside([backgroundPickerRef], backgroundPickerOpen, React.useCallback(() => setBackgroundPickerOpen(false), []));
  useClickOutside([brushColorPickerRef], brushColorPickerOpen, React.useCallback(() => setBrushColorPickerOpen(false), []));
  useClickOutside([brushSettingsRef, brushSettingsTriggerRef], settingsOpen, React.useCallback(() => setSettingsOpen(false), []));
  useClickOutside([shapeMenuRef], shapeMenu, React.useCallback(() => setShapeMenu(false), []));
  useClickOutside([lineMenuRef], lineMenu, React.useCallback(() => setLineMenu(false), []));
  useClickOutside([layerMenuRef, layerMenuTriggerRef], !!openMenuId, React.useCallback(() => setOpenMenuId(null), []));

  const commit = React.useCallback((updater: (draft: EditorState) => EditorState, selectId?: string | null) => {
    setState((current) => {
      setPast((items) => [...items, current]);
      setFuture([]);
      const next = updater(current);
      if (selectId !== undefined) {
        setSelectedId(selectId);
        setSelectedIds(selectId ? [selectId] : []);
      }
      return next;
    });
  }, []);

  const updateSelected = (patch: Partial<Layer>) => {
    if (!selectedId) return;
    commit((current) => ({
      ...current,
      layers: current.layers.map((layer) => (layer.id === selectedId ? cloneLayer(layer, patch) : layer))
    }));
  };

  const beginCutout = async () => {
    if (!selected || selected.type !== "image" || cutout?.status === "processing") return;
    if (cropping) cancelCrop();
    const layerId = selected.id;
    setCutout({ layerId, status: "processing", candidates: [], hoverId: null, activeIds: [] });
    try {
      let candidates: CutoutCandidate[] = [];
      try {
        const aiCutoutSrc = await createAiCutoutSource(selected.src);
        const subject = await createAlphaSubjectCandidate(aiCutoutSrc);
        candidates = subject ? [subject] : await createCutoutCandidates(aiCutoutSrc);
      } catch (error) {
        console.warn("AI cutout candidates failed, falling back to local candidates.", error);
        candidates = await createCutoutCandidates(selected.src);
      }
      const stillExists = state.layers.some((layer) => layer.id === layerId);
      if (!stillExists) return;
      if (!candidates.length) {
        setCutout(null);
        showToast("未识别到可抠对象");
        return;
      }
      setTool("select");
      setSelectedId(layerId);
      setCutout({ layerId, status: "ready", candidates, hoverId: null, activeIds: [] });
    } catch {
      setCutout(null);
      showToast("未识别到可抠对象");
    }
  };

  const confirmCutoutCandidates = async (candidates: CutoutCandidate[]) => {
    const layer = state.layers.find((item) => item.id === cutout?.layerId);
    if (!layer || layer.type !== "image" || !candidates.length) return;
    const crop = layer.crop ?? { x: 0, y: 0, w: 1, h: 1 };
    const bounds = getCutoutBounds(candidates);
    const first = candidates[0];
    const resultSrc = await createCutoutImage(layer.src, candidates);
    const relX = (bounds.x / first.naturalWidth - crop.x) / crop.w;
    const relY = (bounds.y / first.naturalHeight - crop.y) / crop.h;
    const relW = (bounds.width / first.naturalWidth) / crop.w;
    const relH = (bounds.height / first.naturalHeight) / crop.h;
    const id = uid();
    const nextLayer: ImageLayer = {
      id,
      type: "image",
      name: "抠图",
      src: resultSrc,
      x: layer.x + relX * layer.width,
      y: layer.y + relY * layer.height,
      width: Math.max(12, relW * layer.width),
      height: Math.max(12, relH * layer.height),
      visible: true,
      opacity: layer.opacity,
      rotation: layer.rotation,
      flipX: layer.flipX,
      flipY: layer.flipY,
    };
    commit((current) => ({
      ...current,
      layers: [
        ...current.layers.map((item) => item.id === layer.id ? cloneLayer(item, { visible: false }) : item),
        nextLayer,
      ],
    }), id);
    setCutout(null);
    setTool("select");
  };

  // ========= 裁剪 =========
  const beginCrop = () => {
    if (!selected || selected.type !== "image") return;
    // 进入裁剪：默认"自由裁剪"（aspect=null），裁剪框 = 整张图片（rect={0,0,1,1}）。
    // 旋转情况下也保持 full —— 旋转时如果裁剪框越界，由旋转 drag 自行放大图片处理。
    setCropping({
      layerId: selected.id,
      aspect: null,
      rect: { x: 0, y: 0, w: 1, h: 1 },
      backup: { x: selected.x, y: selected.y, width: selected.width, height: selected.height, crop: selected.crop, rotation: selected.rotation },
    });
  };

  const setCropAspect = (aspect: number | null) => {
    setCropping((cur) => {
      if (!cur) return cur;
      if (aspect == null) return { ...cur, aspect: null };
      // 以当前 rect 中心为基准、按新 aspect 在 [0,1] 边界内适配最大尺寸
      const cx = cur.rect.x + cur.rect.w / 2;
      const cy = cur.rect.y + cur.rect.h / 2;
      // rect 是相对当前图层显示框（不是原图），其框的实际像素比例 = 图层尺寸 × rect。
      // 我们要保持裁剪后"图层"的显示比例为 aspect → 图层目前 size 是 layer.width × layer.height，
      // 裁剪后 width' = layer.width * rect.w，height' = layer.height * rect.h，
      // 比 = (layer.width * rect.w) / (layer.height * rect.h) = aspect
      // 即 rect.w / rect.h = aspect * (layer.height / layer.width) = aspect / layerAspect
      const layer = state.layers.find((l) => l.id === cur.layerId);
      if (!layer || layer.type !== "image") return cur;
      const layerAspect = layer.width / layer.height;
      const rectAspect = aspect / layerAspect;
      // 在 [0,1] 内、保持中心，找最大 (w, h) 满足 w/h = rectAspect 且 w<=1、h<=1、且不出界
      const maxW = Math.min(1, 2 * cx, 2 * (1 - cx));
      const maxH = Math.min(1, 2 * cy, 2 * (1 - cy));
      let w = Math.min(maxW, maxH * rectAspect);
      let h = w / rectAspect;
      if (h > maxH) { h = maxH; w = h * rectAspect; }
      const x = Math.max(0, Math.min(1 - w, cx - w / 2));
      const y = Math.max(0, Math.min(1 - h, cy - h / 2));
      let nextRect = { x, y, w, h };
      // 旋转下：收缩裁剪框到图片范围内（保比例、保中心），不放大图片
      if (layer.rotation) {
        const baseCrop = layer.crop ?? { x: 0, y: 0, w: 1, h: 1 };
        nextRect = constrainCropRectByImage(nextRect, layer.rotation, layerAspect, baseCrop);
      }
      return { ...cur, aspect, rect: nextRect };
    });
  };

  const applyCropRect = (rect: { x: number; y: number; w: number; h: number }) => {
    // 用户拖动裁剪框：如果带旋转，必要时收缩 rect 让它落在当前图片范围内（不放大图片）
    setCropping((cur) => {
      if (!cur) return cur;
      const layer = state.layers.find((l) => l.id === cur.layerId);
      let safe = rect;
      if (layer && layer.type === "image" && layer.rotation) {
        const baseCrop = layer.crop ?? { x: 0, y: 0, w: 1, h: 1 };
        safe = constrainCropRectByImage(rect, layer.rotation, layer.width / layer.height, baseCrop);
      }
      return { ...cur, rect: safe };
    });
  };

  const finishCrop = () => {
    if (!cropping) return;
    const { layerId, backup } = cropping;
    const layer = state.layers.find((l) => l.id === layerId);
    if (!layer || layer.type !== "image") { setCropping(null); return; }
    const r = cropping.rect;
    // 把"当前图层显示区上的 rect"换算到"原图坐标系"的 crop —— r=full 时等价不裁剪
    const prev = layer.crop ?? { x: 0, y: 0, w: 1, h: 1 };
    const newCrop: ImageCrop = {
      x: prev.x + r.x * prev.w,
      y: prev.y + r.y * prev.h,
      w: prev.w * r.w,
      h: prev.h * r.h,
    };
    const newWidth = layer.width * r.w;
    const newHeight = layer.height * r.h;
    const newX = layer.x + layer.width * r.x;
    const newY = layer.y + layer.height * r.y;
    // 把"裁剪前的 layer 状态"作为 undo 锚点（一次性提交整个裁剪事务）
    const baseSnapshot: EditorState = {
      ...state,
      layers: state.layers.map((l) =>
        l.id === layerId
          ? (cloneLayer(l, {
              x: backup.x,
              y: backup.y,
              width: backup.width,
              height: backup.height,
              crop: backup.crop,
              rotation: backup.rotation,
            }) as Layer)
          : l
      ),
    };
    setPast((items) => [...items, baseSnapshot]);
    setFuture([]);
    setState((cs) => ({
      ...cs,
      layers: cs.layers.map((l) =>
        l.id === layerId
          ? cloneLayer(l, { crop: newCrop, x: newX, y: newY, width: newWidth, height: newHeight })
          : l
      ),
    }));
    setCropping(null);
  };

  const cancelCrop = () => {
    // 取消：把裁剪期间对 layer.crop/rotation/位置/尺寸 的所有临时修改还原到进入裁剪前的 backup
    if (cropping) {
      const { layerId, backup } = cropping;
      setState((cs) => ({
        ...cs,
        layers: cs.layers.map((l) =>
          l.id === layerId
            ? (cloneLayer(l, {
                x: backup.x,
                y: backup.y,
                width: backup.width,
                height: backup.height,
                crop: backup.crop,
                rotation: backup.rotation,
              }) as Layer)
            : l
        ),
      }));
    }
    setCropping(null);
  };

  // 重置裁剪框：rect 还原到能落在图片内的最大整张（不放大图片）、解除比例锁定。
  const resetCropRect = () => {
    setCropping((cur) => {
      if (!cur) return cur;
      const layer = state.layers.find((l) => l.id === cur.layerId);
      let rect = { x: 0, y: 0, w: 1, h: 1 };
      if (layer && layer.type === "image" && layer.rotation) {
        const baseCrop = layer.crop ?? { x: 0, y: 0, w: 1, h: 1 };
        rect = constrainCropRectByImage(rect, layer.rotation, layer.width / layer.height, baseCrop);
      }
      return { ...cur, aspect: null, rect };
    });
  };

  // 根据旋转 θ + 当前 crop（图片在 wrap 中的实际大小）约束裁剪框 rect。
  // rect 4 角反向旋转 -θ 绕 rect 中心，然后过 crop 仿射映射到原图 [0,1]² 内 —— 用 dwx, dwy。
  //   ox_i = origCx + dwx · cw / s_box，其中 s_box 是 rect 整体缩放系数（保持比例）；ox_i ∈ [0,1]。
  // 求最大 s_box ∈ (0, 1]。s_box = 1 表示 rect 已经满足约束，无需收缩。
  const constrainCropRectByImage = React.useCallback((
    rect: { x: number; y: number; w: number; h: number },
    rotationDeg: number,
    layerAspect: number,
    crop: { x: number; y: number; w: number; h: number },
  ) => {
    const rad = (rotationDeg * Math.PI) / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    const A = layerAspect;
    const rcx = rect.x + rect.w / 2;
    const rcy = rect.y + rect.h / 2;
    // 半宽/半高（归一化 wrap）
    const hw = rect.w / 2;
    const hh = rect.h / 2;
    // 裁剪框中心对应的原图点
    const origCx = crop.x + rcx * crop.w;
    const origCy = crop.y + rcy * crop.h;
    const corners = [
      { dx: -hw, dy: -hh },
      { dx: +hw, dy: -hh },
      { dx: -hw, dy: +hh },
      { dx: +hw, dy: +hh },
    ];
    // 对每个角计算 rect 整体最大缩放系数 s_box ≤ 1（保持中心、保持比例）
    // 4 角相对 rect 中心的 wrap 偏移 (dwx, dwy)；4 角对应的原图坐标：
    //   ox = origCx + (dwx · s_box) · crop.w   注意：缩放 rect 时 dwx 跟着乘 s_box
    //   约束 ox ∈ [0,1] → s_box ≤ slack / (|dwx| · crop.w)
    let sMax = 1;
    for (const { dx, dy } of corners) {
      const dwx = dx * c + (dy * s) / A;
      const dwy = -dx * A * s + dy * c;
      if (dwx > 1e-9) {
        const slack = 1 - origCx;
        if (slack <= 0) { sMax = 0; break; }
        sMax = Math.min(sMax, slack / (dwx * crop.w));
      } else if (dwx < -1e-9) {
        if (origCx <= 0) { sMax = 0; break; }
        sMax = Math.min(sMax, origCx / (-dwx * crop.w));
      }
      if (dwy > 1e-9) {
        const slack = 1 - origCy;
        if (slack <= 0) { sMax = 0; break; }
        sMax = Math.min(sMax, slack / (dwy * crop.h));
      } else if (dwy < -1e-9) {
        if (origCy <= 0) { sMax = 0; break; }
        sMax = Math.min(sMax, origCy / (-dwy * crop.h));
      }
    }
    sMax = Math.max(0, Math.min(1, sMax));
    if (sMax >= 0.9999) return rect;
    return { x: rcx - hw * sMax, y: rcy - hh * sMax, w: rect.w * sMax, h: rect.h * sMax };
  }, []);

  // 计算"为了让旋转 θ 后的图片完全包住裁剪框 rect，相对当前 crop 还需要多放大几倍"。
  // 返回 cover 倍数 k_cover ≥ 1：用法是 layer.crop.w/h 各除以 k_cover、并平移 crop.x/y 保中心不变。
  //
  // 推导：rect 4 角绕 rect 中心反旋转 -θ（在以像素为单位的 wrap 坐标系中），得到归一化偏移
  //   dwx, dwy；要求 4 角对应的原图坐标 ∈ [0,1]²：
  //     ox = origCenter.x + dwx · cw0 / k ∈ [0,1]
  //     oy = origCenter.y + dwy · ch0 / k ∈ [0,1]
  //   反解每条约束的 k 下限，取最大。
  const coverScaleForRotation = React.useCallback((
    rect: { x: number; y: number; w: number; h: number },
    rotationDeg: number,
    layerAspect: number,
    baseCrop: { x: number; y: number; w: number; h: number },
  ) => {
    const rad = (rotationDeg * Math.PI) / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    const A = layerAspect; // W/H
    // rect 中心、半宽半高（归一化 wrap 单位）
    const rcx = rect.x + rect.w / 2;
    const rcy = rect.y + rect.h / 2;
    const hw = rect.w / 2;
    const hh = rect.h / 2;
    // 裁剪框中心对应的原图点（不变量）
    const origCx = baseCrop.x + rcx * baseCrop.w;
    const origCy = baseCrop.y + rcy * baseCrop.h;
    // 4 角的原始归一化偏移
    const corners = [
      { dx: -hw, dy: -hh },
      { dx: +hw, dy: -hh },
      { dx: -hw, dy: +hh },
      { dx: +hw, dy: +hh },
    ];
    let kMin = 1;
    for (const { dx, dy } of corners) {
      // 反旋转 -θ（rect 在像素 wrap 坐标系中旋转，再归一化回 wrap 单位）
      // (dx·A, dy·1) 旋转 -θ → (dx·A·c + dy·s, -dx·A·s + dy·c)，再 ÷ (A, 1)
      const dwx = dx * c + (dy * s) / A;
      const dwy = -dx * A * s + dy * c;
      // x 轴约束：origCx + dwx·cw0/k ∈ [0,1]
      if (dwx > 1e-9) {
        // 上界：1 - origCx ≥ dwx·cw0/k → k ≥ dwx·cw0 / (1 - origCx)
        const slack = 1 - origCx;
        if (slack <= 0) return Infinity;
        kMin = Math.max(kMin, (dwx * baseCrop.w) / slack);
      } else if (dwx < -1e-9) {
        // 下界：origCx + dwx·cw0/k ≥ 0 → k ≥ (-dwx)·cw0 / origCx
        if (origCx <= 0) return Infinity;
        kMin = Math.max(kMin, (-dwx * baseCrop.w) / origCx);
      }
      // y 轴
      if (dwy > 1e-9) {
        const slack = 1 - origCy;
        if (slack <= 0) return Infinity;
        kMin = Math.max(kMin, (dwy * baseCrop.h) / slack);
      } else if (dwy < -1e-9) {
        if (origCy <= 0) return Infinity;
        kMin = Math.max(kMin, (-dwy * baseCrop.h) / origCy);
      }
    }
    return kMin;
  }, []);

  // 应用 cover 缩放：把图片放大 k 倍，保持 rect 中心对应的原图点不变。
  const applyImageCover = (
    layer: ImageLayer,
    rect: { x: number; y: number; w: number; h: number },
    k: number,
  ): ImageLayer => {
    if (k <= 1.0001) return layer;
    const baseCrop = layer.crop ?? { x: 0, y: 0, w: 1, h: 1 };
    const rcx = rect.x + rect.w / 2;
    const rcy = rect.y + rect.h / 2;
    const origCx = baseCrop.x + rcx * baseCrop.w;
    const origCy = baseCrop.y + rcy * baseCrop.h;
    const newCw = baseCrop.w / k;
    const newCh = baseCrop.h / k;
    return cloneLayer(layer, {
      crop: {
        x: origCx - rcx * newCw,
        y: origCy - rcy * newCh,
        w: newCw,
        h: newCh,
      },
    }) as ImageLayer;
  };

  // 选中变更或退出选择工具时自动关闭裁剪 —— 走 cancelCrop 还原 backup（不保存）
  React.useEffect(() => {
    if (cropping && (tool !== "select" || selectedId !== cropping.layerId)) {
      cancelCrop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, selectedId]);

  const updateCanvasBackground = (background: string) => {
    commit((current) => ({ ...current, canvas: { ...current.canvas, background } }));
  };

  const layerCounts = React.useMemo(() => {
    return state.layers.reduce<Record<string, number>>((acc, layer) => {
      acc[layer.type] = (acc[layer.type] ?? 0) + 1;
      return acc;
    }, {});
  }, [state.layers]);

  const makeName = (type: LayerType) => {
    const label = { image: "图片", text: "文字", shape: "形状", line: "线条", curve: "线条", brush: "画笔" }[type];
    return `${label} ${(layerCounts[type] ?? 0) + 1}`;
  };

  const addLayer = (layer: Layer) => {
    // 创建图层后不自动选中：选中需要用户切到"选择"工具再点击图层
    commit((current) => ({ ...current, layers: [...current.layers, layer] }));
  };

  const addShape = (shape: ShapeKind) => {
    const id = uid();
    addLayer({
      id,
      type: "shape",
      name: makeName("shape"),
      shape,
      x: state.canvas.width / 2 - 60,
      y: state.canvas.height / 2 - 60,
      width: 120,
      height: 120,
      visible: true,
      opacity: 1,
      fill: "#111827",
      stroke: "#111827",
      strokeWidth: 0,
      strokeStyle: "none",
      radius: shape === "rounded" ? 18 : 0
    });
  };

  const addText = () => {
    const id = uid();
    const layer: TextLayer = {
      id,
      type: "text",
      name: makeName("text"),
      text: "点击编辑文字",
      x: state.canvas.width / 2 - 90,
      y: state.canvas.height / 2 - 30,
      width: 180,
      height: 60,
      visible: true,
      opacity: 1,
      color: "#111827",
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: 28,
      letterSpacing: 0,
      lineHeight: 1.1,
      bold: false,
      italic: false,
      underline: false,
      strike: false,
      align: "center"
    };
    commit((current) => ({ ...current, layers: [...current.layers, layer] }), id);
    setTool("select");
    setEditingTextId(id);
  };

  const addLine = (type: "line" | "curve") => {
    const id = uid();
    const points = type === "line"
      ? [{ x: 8, y: 60 }, { x: 212, y: 60 }]
      : [{ x: 8, y: 110 }, { x: 110, y: 8 }, { x: 212, y: 110 }];
    addLayer({
      id,
      type,
      name: makeName(type),
      x: state.canvas.width / 2 - 110,
      y: state.canvas.height / 2 - 60,
      width: 220,
      height: 120,
      visible: true,
      opacity: 1,
      color: "#2563eb",
      strokeWidth: 6,
      strokeStyle: "solid",
      points
    });
  };

  // 把图层深拷一份 —— cloneLayer 是浅拷贝，对包含可变嵌套结构的字段
  // （brush/line/curve 的 points、image 的 crop）单独拷贝，确保副本独立。
  // patch 用于覆盖（如 id / name / x / y）；不传则保持与原图层一致。
  const deepCloneLayer = (layer: Layer, patch: Partial<Layer> = {}): Layer => {
    const merged: Partial<Layer> = { ...patch };
    if (layer.type === "brush" || layer.type === "line" || layer.type === "curve") {
      if (!("points" in merged)) {
        (merged as { points?: unknown }).points = (layer as { points: unknown[] }).points.map((p) => ({ ...(p as object) }));
      }
    }
    if (layer.type === "image" && layer.crop && !("crop" in merged)) {
      (merged as { crop?: ImageCrop }).crop = { ...layer.crop };
    }
    return cloneLayer(layer, merged);
  };

  const duplicateLayer = (id: string) => {
    const layer = state.layers.find((item) => item.id === id);
    if (!layer) return;
    // 复制：副本与原图层在画布上严格一模一样 —— 位置/尺寸/旋转/裁剪/样式全部继承，仅换 id 与名称
    const copy = deepCloneLayer(layer, { id: uid(), name: `${layer.name} 副本`, x: layer.x + 18, y: layer.y + 18 } as Partial<Layer>);
    commit((current) => ({ ...current, layers: [...current.layers, copy] }), copy.id);
  };

  // 把图层快照写入内部剪贴板（Ctrl+C 用）—— 存的是当前那一刻的完整字段，原图层后续被改也不影响粘贴结果
  const copySelectedLayerToClipboard = (): boolean => {
    const ids = selectedIds.length ? selectedIds : (selectedId ? [selectedId] : []);
    if (!ids.length) return false;
    const layers = state.layers.filter((item) => ids.includes(item.id));
    if (!layers.length) return false;
    layerClipboardRef.current = layers.map((layer) => deepCloneLayer(layer));
    return true;
  };

  // 从内部剪贴板生成新图层（Ctrl+V 用）—— 与快照在画布上一模一样，仅换 id / name
  const pasteLayerFromClipboard = (): boolean => {
    const snapshots = layerClipboardRef.current;
    if (!snapshots?.length) return false;
    const offset = 18;
    const copies = snapshots.map((snapshot) => deepCloneLayer(snapshot, { id: uid(), name: `${snapshot.name} 副本`, x: snapshot.x + offset, y: snapshot.y + offset } as Partial<Layer>));
    if (copies.length === 1) {
      commit((current) => ({ ...current, layers: [...current.layers, ...copies] }), copies[0].id);
    } else {
      commit((current) => ({ ...current, layers: [...current.layers, ...copies] }));
      setSelectedId(null);
      setSelectedIds(copies.map((copy) => copy.id));
    }
    return true;
  };

  const deleteLayer = (id: string) => {
    commit((current) => ({ ...current, layers: current.layers.filter((layer) => layer.id !== id) }), selectedId === id ? null : selectedId);
  };

  const deleteSelectedLayers = () => {
    const ids = selectedIds.length ? selectedIds : (selectedId ? [selectedId] : []);
    if (!ids.length) return;
    commit((current) => ({ ...current, layers: current.layers.filter((layer) => !ids.includes(layer.id)) }), null);
  };

  const moveLayerOrder = (id: string, direction: "up" | "down" | "top" | "bottom") => {
    commit((current) => {
      const layers = [...current.layers];
      const index = layers.findIndex((layer) => layer.id === id);
      if (index < 0) return current;
      const [layer] = layers.splice(index, 1);
      const nextIndex = direction === "top" ? layers.length : direction === "bottom" ? 0 : direction === "up" ? Math.min(layers.length, index + 1) : Math.max(0, index - 1);
      layers.splice(nextIndex, 0, layer);
      return { ...current, layers };
    });
  };

  const reorderLayerByPanelDrop = (fromId: string, toId: string, position: "before" | "after") => {
    if (fromId === toId) return;
    commit((current) => {
      const displayLayers = [...current.layers].reverse();
      const fromIndex = displayLayers.findIndex((layer) => layer.id === fromId);
      if (fromIndex < 0) return current;
      const [moving] = displayLayers.splice(fromIndex, 1);
      const toIndex = displayLayers.findIndex((layer) => layer.id === toId);
      if (toIndex < 0) return current;
      const nextIndex = position === "before" ? toIndex : toIndex + 1;
      displayLayers.splice(nextIndex, 0, moving);
      return { ...current, layers: displayLayers.reverse() };
    }, selectedId);
  };

  const resetLayer = (id: string) => {
    const layer = state.layers.find((item) => item.id === id);
    if (!layer) return;
    updateSelected({ x: state.canvas.width / 2 - layer.width / 2, y: state.canvas.height / 2 - layer.height / 2 });
  };

  const undo = () => {
    setPast((items) => {
      if (!items.length) return items;
      const previous = items[items.length - 1];
      setFuture((next) => [state, ...next]);
      setState(previous);
      setSelectedId(null);
      setSelectedIds([]);
      return items.slice(0, -1);
    });
  };

  const redo = () => {
    setFuture((items) => {
      if (!items.length) return items;
      const next = items[0];
      setPast((previous) => [...previous, state]);
      setState(next);
      setSelectedId(null);
      setSelectedIds([]);
      return items.slice(1);
    });
  };

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      }
      if ((mod && event.key.toLowerCase() === "y") || (mod && event.shiftKey && event.key.toLowerCase() === "z")) {
        event.preventDefault();
        redo();
      }
      if (cropping && event.key === "Enter") {
        event.preventDefault();
        finishCrop();
      }
      if (cropping && event.key === "Escape") {
        event.preventDefault();
        cancelCrop();
      }
      // 复制：Ctrl/Cmd+C —— 把当前选中图层完整快照存入内部剪贴板
      // 阻止默认 copy 以避免后续 paste 时浏览器把"原图二进制"再灌进系统剪贴板路径
      if (mod && !event.shiftKey && event.key.toLowerCase() === "c" && (selectedId || selectedIds.length) && !cropping) {
        if (copySelectedLayerToClipboard()) {
          event.preventDefault();
        }
      }
      if ((event.key === "Delete" || event.key === "Backspace") && (selectedId || selectedIds.length)) deleteSelectedLayers();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  React.useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const image = Array.from(event.clipboardData?.items ?? []).find((item) => item.type.startsWith("image/"));
      if (image) {
        const file = image.getAsFile();
        if (file) {
          layerClipboardRef.current = null;
          addImageFile(file);
          return;
        }
      }
      if (layerClipboardRef.current && !cropping) {
        event.preventDefault();
        pasteLayerFromClipboard();
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  React.useEffect(() => {
    if (!activeDrag) return;
    const onMove = (event: PointerEvent) => {
      const dx = event.clientX - activeDrag.startX;
      const dy = event.clientY - activeDrag.startY;
      const scaledDx = dx / activeDrag.zoom;
      const scaledDy = dy / activeDrag.zoom;
      if (activeDrag.type === "canvas") {
        const dir = activeDrag.corner ?? "br";
        const baseW = activeDrag.base.canvas.width;
        const baseH = activeDrag.base.canvas.height;
        let width = baseW;
        let height = baseH;
        if (dir.includes("r")) width = baseW + scaledDx;
        if (dir.includes("l")) width = baseW - scaledDx;
        if (dir.includes("b")) height = baseH + scaledDy;
        if (dir.includes("t")) height = baseH - scaledDy;
        setState({
          ...activeDrag.base,
          canvas: {
            ...activeDrag.base.canvas,
            width: Math.max(280, width),
            height: Math.max(220, height),
            ratio: "custom"
          }
        });
        return;
      }
      if (activeDrag.type === "draw") {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect || !activeDrag.id) return;
        const x = (event.clientX - rect.left) / activeDrag.zoom;
        const y = (event.clientY - rect.top) / activeDrag.zoom;
        setState((current) => ({
          ...current,
          layers: current.layers.map((layer) => layer.id === activeDrag.id && layer.type === "brush" ? { ...layer, points: [...layer.points, { x: x - layer.x, y: y - layer.y }] } : layer)
        }));
        return;
      }
      if (activeDrag.type === "erase") {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = (event.clientX - rect.left) / activeDrag.zoom;
        const y = (event.clientY - rect.top) / activeDrag.zoom;
        // 按点擦除（dryRun=true：拖动过程中只改当前 state，不入 undo 栈；
        // pointerup 时由通用 onUp 把 activeDrag.base 推进 past，整次擦除作为一条历史记录）
        eraseBrushLayersAt(x, y, true);
        return;
      }
      if (activeDrag.type === "groupMove" && activeDrag.ids?.length) {
        setState({
          ...activeDrag.base,
          layers: activeDrag.base.layers.map((layer) => (
            activeDrag.ids?.includes(layer.id)
              ? cloneLayer(layer, { x: layer.x + scaledDx, y: layer.y + scaledDy })
              : layer
          ))
        });
        return;
      }
      if (activeDrag.type === "groupScale" && activeDrag.ids?.length && activeDrag.groupBounds) {
        const b = activeDrag.groupBounds;
        const minSize = 24;
        const dir = activeDrag.corner ?? "br";
        let left = b.left;
        let top = b.top;
        let right = b.right;
        let bottom = b.bottom;
        if (dir.includes("l")) left += scaledDx;
        if (dir.includes("r")) right += scaledDx;
        if (dir.includes("t")) top += scaledDy;
        if (dir.includes("b")) bottom += scaledDy;
        if (right - left < minSize) {
          if (dir.includes("l")) left = right - minSize;
          else right = left + minSize;
        }
        if (bottom - top < minSize) {
          if (dir.includes("t")) top = bottom - minSize;
          else bottom = top + minSize;
        }
        const sx = (right - left) / Math.max(1, b.right - b.left);
        const sy = (bottom - top) / Math.max(1, b.bottom - b.top);
        const mapX = (x: number) => left + (x - b.left) * sx;
        const mapY = (y: number) => top + (y - b.top) * sy;
        setState({
          ...activeDrag.base,
          layers: activeDrag.base.layers.map((layer) => {
            if (!activeDrag.ids?.includes(layer.id)) return layer;
            const nx = mapX(layer.x);
            const ny = mapY(layer.y);
            const nextWidth = Math.max(2, layer.width * sx);
            const nextHeight = Math.max(2, layer.height * sy);
            if (layer.type === "brush" || layer.type === "line" || layer.type === "curve") {
              return cloneLayer(layer, {
                x: nx,
                y: ny,
                width: nextWidth,
                height: nextHeight,
                points: layer.points.map((point) => ({
                  ...point,
                  x: point.x * sx,
                  y: point.y * sy,
                })),
              } as Partial<Layer>);
            }
            if (layer.type === "shape") {
              return cloneLayer(layer, {
                x: nx,
                y: ny,
                width: nextWidth,
                height: nextHeight,
                radius: layer.radius * Math.min(sx, sy),
                strokeWidth: layer.strokeWidth * Math.min(sx, sy),
              } as Partial<Layer>);
            }
            if (layer.type === "text") {
              return cloneLayer(layer, {
                x: nx,
                y: ny,
                width: nextWidth,
                height: nextHeight,
                fontSize: layer.fontSize * Math.min(sx, sy),
              } as Partial<Layer>);
            }
            return cloneLayer(layer, { x: nx, y: ny, width: nextWidth, height: nextHeight } as Partial<Layer>);
          })
        });
        return;
      }
      if (!activeDrag.id) return;
      setState({
        ...activeDrag.base,
        layers: activeDrag.base.layers.map((layer) => {
          if (layer.id !== activeDrag.id) return layer;
          if (activeDrag.type === "move") return cloneLayer(layer, { x: layer.x + scaledDx, y: layer.y + scaledDy });
          if (activeDrag.type === "rotate" && activeDrag.centerX !== undefined && activeDrag.centerY !== undefined && activeDrag.startAngle !== undefined && activeDrag.baseRotation !== undefined) {
            const angle = Math.atan2(event.clientY - activeDrag.centerY, event.clientX - activeDrag.centerX) * (180 / Math.PI);
            const newRotation = normalizeAngle(activeDrag.baseRotation + angle - activeDrag.startAngle);
            // 裁剪态下：旋转后保持裁剪框不动，自动放大图片以包住裁剪框 —— "裁剪框始终在图片内"
            // 用 base 的 crop 作为起点重新计算 cover 倍数，避免帧间累计误差。
            if (cropping && cropping.layerId === layer.id && layer.type === "image") {
              const baseImg = activeDrag.base.layers.find((l) => l.id === layer.id);
              if (baseImg && baseImg.type === "image") {
                const baseCrop = baseImg.crop ?? { x: 0, y: 0, w: 1, h: 1 };
                const layerAspect = layer.width / layer.height;
                const k = coverScaleForRotation(cropping.rect, newRotation, layerAspect, baseCrop);
                if (Number.isFinite(k)) {
                  const covered = applyImageCover(baseImg, cropping.rect, k);
                  return cloneLayer(covered, { rotation: newRotation });
                }
              }
            }
            return cloneLayer(layer, { rotation: newRotation });
          }
          if (activeDrag.type === "imageScale" && layer.type === "image" && activeDrag.centerX !== undefined && activeDrag.centerY !== undefined) {
            // 裁剪态下"缩放图片"：保持裁剪框中心对应的原图点不变，按"鼠标到锚点距离的比例"整体缩放图片。
            // 等价于让 layer.crop 的 w/h 变为原值 / k，并平移 crop.x/y 使中心点不变。
            const base = activeDrag.base.layers.find((l) => l.id === activeDrag.id);
            if (!base || base.type !== "image") return layer;
            const baseCrop = base.crop ?? { x: 0, y: 0, w: 1, h: 1 };
            const sxv = activeDrag.startX - activeDrag.centerX;
            const syv = activeDrag.startY - activeDrag.centerY;
            const mxv = event.clientX - activeDrag.centerX;
            const myv = event.clientY - activeDrag.centerY;
            const d0 = Math.sqrt(sxv * sxv + syv * syv);
            const d1 = Math.sqrt(mxv * mxv + myv * myv);
            if (d0 < 1) return layer; // 避免除零
            // 缩放因子原始值：拖远=放大，拖近=缩小
            let k = d1 / d0;
            // 下限：保证 cover —— 缩小图片不能突破"裁剪框 ⊆ 图片"
            //   无旋转：等价 baseCrop.w/k ≤ 1 且 baseCrop.h/k ≤ 1 → k ≥ max(baseCrop.w, baseCrop.h)
            //   有旋转：用 coverScaleForRotation 算出当前需要的最低 cover 倍数
            const rect = cropping?.layerId === layer.id ? cropping.rect : { x: 0, y: 0, w: 1, h: 1 };
            const layerAspect = layer.width / layer.height;
            const coverK = layer.rotation
              ? coverScaleForRotation(rect, layer.rotation, layerAspect, baseCrop)
              : Math.max(baseCrop.w, baseCrop.h);
            const minK = Number.isFinite(coverK) ? Math.max(coverK, 1e-6) : 1;
            k = Math.max(minK, Math.min(10, k));
            const rcx = rect.x + rect.w / 2;
            const rcy = rect.y + rect.h / 2;
            // 裁剪框中心对应的原图点（用 base 的 crop 算，保持不变量）
            const origPtX = baseCrop.x + rcx * baseCrop.w;
            const origPtY = baseCrop.y + rcy * baseCrop.h;
            // 新 crop 的 w/h（图片放大 = crop 缩小）
            const newCw = baseCrop.w / k;
            const newCh = baseCrop.h / k;
            // 新 crop 的 x/y 使中心点对应同一原图点
            const newCx = origPtX - rcx * newCw;
            const newCy = origPtY - rcy * newCh;
            return cloneLayer(layer, { crop: { x: newCx, y: newCy, w: newCw, h: newCh } });
          }
          if (activeDrag.type === "imageBox" && layer.type === "image" && activeDrag.centerX !== undefined && activeDrag.centerY !== undefined) {
            // 裁剪态下"调整图片图层大小"：传统拖角缩放，可变比例，锚点 = 对角。
            // 几何步骤：
            //   1) 把鼠标 wrap 位移反旋转 -θ 转到"图片局部坐标系"
            //   2) 在局部系按 corner 改变图片宽/高，锚点（对角）不动
            //   3) 约束：新图片宽/高 ≥ 裁剪框宽/高（保证裁剪框始终 ⊆ 图片）
            //   4) 把新图片 (lx, ly, iw, ih) 反算回 layer.crop
            const base = activeDrag.base.layers.find((l) => l.id === activeDrag.id);
            if (!base || base.type !== "image") return layer;
            const baseCrop = base.crop ?? { x: 0, y: 0, w: 1, h: 1 };
            const corner = activeDrag.corner ?? "br";
            const hasL = corner.includes("l");
            const hasR = corner.includes("r");
            const hasT = corner.includes("t");
            const hasB = corner.includes("b");
            // 鼠标位移（视口像素）→ 反 canvasZoom → wrap 像素位移
            const dxV = (event.clientX - activeDrag.startX) / activeDrag.zoom;
            const dyV = (event.clientY - activeDrag.startY) / activeDrag.zoom;
            // 反旋转 -θ 到图片局部坐标系
            const rad = -((layer.rotation ?? 0) * Math.PI) / 180;
            const c = Math.cos(rad);
            const s = Math.sin(rad);
            const dxL = dxV * c - dyV * s;
            const dyL = dxV * s + dyV * c;
            // base 图片在 wrap 中的尺寸（像素，未旋转）
            const W = base.width;
            const H = base.height;
            const iw0 = W / baseCrop.w;
            const ih0 = H / baseCrop.h;
            // base 图片在 wrap 中的左上（像素，未旋转）
            const lx0 = -baseCrop.x / baseCrop.w * W;
            const ly0 = -baseCrop.y / baseCrop.h * H;
            // 根据 corner 计算新宽/高 + 新左上
            // 拖右下：宽 += dxL，高 += dyL，左上不动 → lx = lx0, iw = iw0 + dxL
            // 拖左上：宽 -= dxL，高 -= dyL，右下不动 → iw = iw0 - dxL, lx = lx0 + dxL
            let iw = iw0;
            let ih = ih0;
            let lx = lx0;
            let ly = ly0;
            if (hasR) iw = iw0 + dxL;
            if (hasL) { iw = iw0 - dxL; lx = lx0 + dxL; }
            if (hasB) ih = ih0 + dyL;
            if (hasT) { ih = ih0 - dyL; ly = ly0 + dyL; }
            // 约束：图片 ≥ 裁剪框（wrap 像素）。裁剪框在 wrap 中是 rect × (W, H)。
            const rect = cropping?.layerId === layer.id ? cropping.rect : { x: 0, y: 0, w: 1, h: 1 };
            const minIw = rect.w * W;
            const minIh = rect.h * H;
            // 同时约束：裁剪框（视觉左上 = (rect.x · W, rect.y · H)）必须 ⊆ 新图片矩形 (lx, ly, lx+iw, ly+ih)
            //   裁剪框左 ≥ lx → lx ≤ rect.x · W
            //   裁剪框右 ≤ lx + iw → lx + iw ≥ (rect.x + rect.w) · W
            //   类似 y
            const rectLpx = rect.x * W;
            const rectTpx = rect.y * H;
            const rectRpx = (rect.x + rect.w) * W;
            const rectBpx = (rect.y + rect.h) * H;
            // 应用尺寸下限
            if (iw < minIw) {
              if (hasL) lx = lx0 + (iw0 - minIw); // 左侧拖动时锚定右侧
              iw = minIw;
            }
            if (ih < minIh) {
              if (hasT) ly = ly0 + (ih0 - minIh);
              ih = minIh;
            }
            // 应用位置约束（图片必须覆盖裁剪框）
            if (lx > rectLpx) lx = rectLpx;
            if (ly > rectTpx) ly = rectTpx;
            if (lx + iw < rectRpx) {
              if (hasL) lx = rectRpx - iw; // 左拖时调左
              else iw = rectRpx - lx;       // 右拖时调宽
            }
            if (ly + ih < rectBpx) {
              if (hasT) ly = rectBpx - ih;
              else ih = rectBpx - ly;
            }
            // 反算回 crop
            const newCw = W / iw;
            const newCh = H / ih;
            const newCx = -lx / iw;
            const newCy = -ly / ih;
            const candidateCrop = { x: newCx, y: newCy, w: newCw, h: newCh };
            // 旋转下额外验证：rect 4 角反旋转后必须落在新图片矩形内（精细约束）
            // 用 constrainCropRectByImage 看 rect 是否会被强制收缩 —— 若是，说明 crop 不够，拒绝更新
            if (layer.rotation) {
              const fitted = constrainCropRectByImage(rect, layer.rotation, W / H, candidateCrop);
              const shrunk = fitted.w < rect.w * 0.999 || fitted.h < rect.h * 0.999;
              if (shrunk) return layer; // 拒绝：保持上一帧 crop
            }
            return cloneLayer(layer, { crop: candidateCrop });
          }
          if (activeDrag.type === "scale") {
            const dir = activeDrag.corner ?? "";
            const hasL = dir.includes("l");
            const hasR = dir.includes("r");
            const hasT = dir.includes("t");
            const hasB = dir.includes("b");
            let width = layer.width;
            let height = layer.height;
            let nx = layer.x;
            let ny = layer.y;
            if (hasR) width = Math.max(20, layer.width + scaledDx);
            if (hasL) { width = Math.max(20, layer.width - scaledDx); nx = layer.x + (layer.width - width); }
            if (hasB) height = Math.max(20, layer.height + scaledDy);
            if (hasT) { height = Math.max(20, layer.height - scaledDy); ny = layer.y + (layer.height - height); }
            // 画笔图层需要把笔迹点按比例变换，否则改 width/height 视觉上没变化
            if (layer.type === "brush") {
              const base = activeDrag.base.layers.find((l) => l.id === layer.id) as BrushLayer | undefined;
              if (base) {
                const bbox = brushBoundingBox(base);
                if (bbox.width > 0 && bbox.height > 0) {
                  const newBboxW = Math.max(2, bbox.width + (hasR ? scaledDx : 0) + (hasL ? -scaledDx : 0));
                  const newBboxH = Math.max(2, bbox.height + (hasB ? scaledDy : 0) + (hasT ? -scaledDy : 0));
                  const sx = newBboxW / bbox.width;
                  const sy = newBboxH / bbox.height;
                  // 缩放锚点：拖右/下边时锚定左/上，拖左/上边时锚定右/下
                  const anchorX = hasL ? bbox.x + bbox.width : bbox.x;
                  const anchorY = hasT ? bbox.y + bbox.height : bbox.y;
                  const points = base.points.map((p) => {
                    // 保留 m 字段以维持擦除后的多子路径结构
                    const np: BrushPoint = {
                      x: anchorX + (p.x - anchorX) * sx,
                      y: anchorY + (p.y - anchorY) * sy
                    };
                    if (p.m) np.m = true;
                    return np;
                  });
                  return cloneLayer(layer, { points } as Partial<Layer>);
                }
              }
            }
            return cloneLayer(layer, { width, height, x: nx, y: ny });
          }
          if (activeDrag.type === "linePoint" && ("points" in layer) && activeDrag.pointIndex !== undefined) {
            // 更新点坐标（绝对坐标 = layer.x + point.x）
            const absPoints = layer.points.map((point, index) => index === activeDrag.pointIndex
              ? { x: layer.x + point.x + scaledDx, y: layer.y + point.y + scaledDy }
              : { x: layer.x + point.x, y: layer.y + point.y }
            );
            // 重新计算 bounding box
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const p of absPoints) {
              if (p.x < minX) minX = p.x;
              if (p.y < minY) minY = p.y;
              if (p.x > maxX) maxX = p.x;
              if (p.y > maxY) maxY = p.y;
            }
            const padding = 10; // 留一点余量
            const newX = minX - padding;
            const newY = minY - padding;
            const newW = Math.max(20, maxX - minX + padding * 2);
            const newH = Math.max(20, maxY - minY + padding * 2);
            // 归一化点坐标为相对新 bounding box 的局部坐标
            const newPoints = absPoints.map((p) => ({ x: p.x - newX, y: p.y - newY }));
            return cloneLayer(layer, { x: newX, y: newY, width: newW, height: newH, points: newPoints } as Partial<Layer>);
          }
          return layer;
        })
      });
    };
    const onUp = () => {
      // 裁剪态下的 drag（rotate/imageScale）是裁剪事务的一部分，不入 undo 栈 ——
      // 由 finishCrop 统一一次性提交，cancelCrop 还原 backup
      const isCropTransaction = !!cropping && (activeDrag.type === "rotate" || activeDrag.type === "imageScale" || activeDrag.type === "imageBox");
      if (!isCropTransaction) {
        setPast((items) => [...items, activeDrag.base]);
        setFuture([]);
      }
      setActiveDrag(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [activeDrag]);

  const addImageFile = (file: File) => {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      showToast("仅支持 PNG、JPG、JPEG、WEBP");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        const maxWidth = state.canvas.width * 0.8;
        const scale = Math.min(1, maxWidth / img.width);
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);
        const id = uid();
        addLayer({
          id,
          type: "image",
          name: makeName("image"),
          src: String(reader.result),
          x: state.canvas.width / 2 - width / 2,
          y: state.canvas.height / 2 - height / 2,
          width,
          height,
          visible: true,
          opacity: 1
        });
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 1800);
  };

  const saveAndReturn = () => {
    showToast("已保存");
  };

  const setCanvasZoomClamped = (next: number) => {
    setCanvasZoom(Math.min(2.5, Math.max(0.35, Number(next.toFixed(2)))));
  };

  const zoomCanvasBy = (delta: number) => {
    setCanvasZoom((zoom) => Math.min(2.5, Math.max(0.35, Number((zoom + delta).toFixed(2)))));
  };

  const resetCanvasViewport = () => {
    const rect = canvasShellRef.current?.getBoundingClientRect();
    const availableWidth = Math.max(1, (rect?.width ?? window.innerWidth) - 88);
    const availableHeight = Math.max(1, (rect?.height ?? window.innerHeight) - 88);
    const fitZoom = Math.min(1, availableWidth / state.canvas.width, availableHeight / state.canvas.height);
    setCanvasZoomClamped(fitZoom);
    setCanvasPan({ x: 0, y: 0 });
  };

  const copyCanvasToClipboard = async () => {
    const canvas = document.createElement("canvas");
    canvas.width = state.canvas.width;
    canvas.height = state.canvas.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = state.canvas.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const drawInLayerSpace = (layer: Layer, draw: () => void) => {
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      ctx.translate(layer.x + layer.width / 2, layer.y + layer.height / 2);
      ctx.rotate(((layer.rotation ?? 0) * Math.PI) / 180);
      ctx.scale(layer.flipX ? -1 : 1, layer.flipY ? -1 : 1);
      ctx.translate(-layer.width / 2, -layer.height / 2);
      draw();
      ctx.restore();
    };

    const applyStroke = (layer: ShapeLayer | LineLayer) => {
      ctx.lineWidth = layer.strokeWidth;
      ctx.strokeStyle = layer.type === "shape" ? layer.stroke : layer.color;
      ctx.setLineDash(layer.strokeStyle === "dashed" ? [10, 8] : layer.strokeStyle === "dotted" ? [2, 8] : []);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    };

    for (const layer of state.layers) {
      if (!layer.visible) continue;
      if (layer.type === "image") {
        const img = await loadImageElement(layer.src);
        drawInLayerSpace(layer, () => {
          const crop = layer.crop ?? { x: 0, y: 0, w: 1, h: 1 };
          const sx = crop.x * img.naturalWidth;
          const sy = crop.y * img.naturalHeight;
          const sw = crop.w * img.naturalWidth;
          const sh = crop.h * img.naturalHeight;
          const radius = layer.cornerRadius ? Math.min(layer.width, layer.height) * layer.cornerRadius / 100 : 0;
          if (radius) {
            ctx.beginPath();
            ctx.roundRect(0, 0, layer.width, layer.height, radius);
            ctx.clip();
          }
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, layer.width, layer.height);
        });
      } else if (layer.type === "shape") {
        drawInLayerSpace(layer, () => {
          const sw = layer.strokeStyle === "none" ? 0 : layer.strokeWidth;
          const half = sw / 2;
          const w = layer.width - sw;
          const h = layer.height - sw;
          ctx.beginPath();
          if (layer.shape === "rect" || layer.shape === "rounded") ctx.roundRect(half, half, w, h, layer.shape === "rounded" ? layer.radius : 0);
          else if (layer.shape === "circle") ctx.ellipse(layer.width / 2, layer.height / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
          else {
            const ix = half, iy = half, iw = w, ih = h;
            const points: Record<ShapeKind, [number, number][]> = {
              rect: [], rounded: [], circle: [],
              triangle: [[layer.width / 2, iy], [ix + iw, iy + ih], [ix, iy + ih]],
              invertedTriangle: [[ix, iy], [ix + iw, iy], [layer.width / 2, iy + ih]],
              diamond: [[layer.width / 2, iy], [ix + iw, layer.height / 2], [layer.width / 2, iy + ih], [ix, layer.height / 2]],
              pentagon: [[layer.width / 2, iy], [ix + iw, iy + ih * 0.38], [ix + iw * 0.8, iy + ih], [ix + iw * 0.2, iy + ih], [ix, iy + ih * 0.38]],
            };
            points[layer.shape].forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
            ctx.closePath();
          }
          if (!layer.noFill) {
            ctx.fillStyle = layer.fill;
            ctx.fill();
          }
          if (layer.strokeStyle !== "none") {
            applyStroke(layer);
            ctx.stroke();
          }
        });
      } else if (layer.type === "line" || layer.type === "curve") {
        drawInLayerSpace(layer, () => {
          applyStroke(layer);
          ctx.beginPath();
          ctx.moveTo(layer.points[0].x, layer.points[0].y);
          if (layer.type === "line") ctx.lineTo(layer.points[1].x, layer.points[1].y);
          else ctx.quadraticCurveTo(layer.points[1].x, layer.points[1].y, layer.points[2].x, layer.points[2].y);
          ctx.stroke();
        });
      } else if (layer.type === "brush") {
        drawInLayerSpace(layer, () => {
          ctx.strokeStyle = layer.color;
          ctx.lineWidth = layer.strokeWidth;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.setLineDash([]);
          ctx.beginPath();
          layer.points.forEach((point, index) => {
            if (index === 0 || point.m) ctx.moveTo(point.x, point.y);
            else ctx.lineTo(point.x, point.y);
          });
          ctx.stroke();
        });
      } else if (layer.type === "text") {
        drawInLayerSpace(layer, () => {
          const lines = layer.text.split("\n");
          const fontStyle = `${layer.italic ? "italic " : ""}${layer.bold ? "700 " : "400 "}${layer.fontSize}px ${layer.fontFamily}`;
          const lineHeight = layer.fontSize * (layer.lineHeight ?? 1.1);
          ctx.font = fontStyle;
          ctx.fillStyle = layer.color;
          ctx.textBaseline = "top";
          ctx.textAlign = layer.align;
          const x = layer.align === "center" ? layer.width / 2 : layer.align === "right" ? layer.width : 0;
          lines.forEach((line, index) => ctx.fillText(line, x, index * lineHeight));
        });
      }
    }

    if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
      showToast("当前浏览器不支持复制图片");
      return;
    }
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) {
      showToast("复制失败");
      return;
    }
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    showToast("已复制图片到剪切板");
  };

  const updateTextLayer = (id: string, text: string) => {
    setState((current) => ({
      ...current,
      layers: current.layers.map((layer) => layer.id === id && layer.type === "text" ? cloneLayer(layer, { text }) : layer)
    }));
  };

  const finishTextEditing = (id: string) => {
    const base = textEditBaseRef.current;
    textEditBaseRef.current = null;
    setEditingTextId(null);
    if (!base) return;
    const before = base.layers.find((layer) => layer.id === id);
    const after = state.layers.find((layer) => layer.id === id);
    if (before?.type === "text" && after?.type === "text" && before.text !== after.text) {
      setPast((items) => [...items, base]);
      setFuture([]);
    }
  };

  const beginLayerDrag = (event: React.PointerEvent, id: string) => {
    event.stopPropagation();
    // 切换到其他图层时立即取消裁剪（同步执行，避免 useEffect 异步触发的时序窗口）
    if (cropping && cropping.layerId !== id) cancelCrop();
    setTool("select");
    setSelectedId(id);
    setSelectedIds([id]);
    setEditingTextId(null);
    setActiveDrag({ type: "move", id, startX: event.clientX, startY: event.clientY, zoom: canvasZoom, base: state });
  };

  const beginTextEditing = (id: string) => {
    textEditBaseRef.current = state;
    setTool("select");
    setSelectedId(id);
    setSelectedIds([id]);
    setEditingTextId(id);
    setActiveDrag(null);
  };

  const beginBrush = (event: React.PointerEvent) => {
    if (tool !== "brush" || !brushMode) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (event.clientX - rect.left) / canvasZoom;
    const y = (event.clientY - rect.top) / canvasZoom;

    if (brushMode === "eraser") {
      // 橡皮擦：按点擦除画笔图层笔迹，全部擦完才删图层
      // 起手第一下也走 dryRun，整次擦除事务由 pointerup 通过 activeDrag.base 一次性入 undo 栈
      setActiveDrag({ type: "erase", startX: event.clientX, startY: event.clientY, zoom: canvasZoom, base: state });
      eraseBrushLayersAt(x, y, true);
      return;
    }

    const id = uid();
    const layer: BrushLayer = {
      id,
      type: "brush",
      name: makeName("brush"),
      x: 0,
      y: 0,
      width: state.canvas.width,
      height: state.canvas.height,
      visible: true,
      opacity: brushOpacity,
      color: brushColor,
      strokeWidth: brushSize,
      points: [{ x, y }]
    };
    setState((current) => ({ ...current, layers: [...current.layers, layer] }));
    // 画的过程中不显示蓝色选中框；切回选择工具后点击图层才会显示
    setActiveDrag({ type: "draw", id, startX: event.clientX, startY: event.clientY, zoom: canvasZoom, base: state });
  };

  // 通用图层 hit-test（canvas 坐标系）—— brush 用更精确的 brushLayerHit，
  // 其它图层一律按"反旋转后 AABB 包含"判定（图片/文字/形状/线条统一）
  const hitTestLayer = (layer: Layer, x: number, y: number): boolean => {
    if (!layer.visible) return false;
    if (layer.type === "brush") return brushLayerHit(layer as BrushLayer, x, y, 0);
    const cx = layer.x + layer.width / 2;
    const cy = layer.y + layer.height / 2;
    const rot = ((layer as { rotation?: number }).rotation ?? 0) * Math.PI / 180;
    const cos = Math.cos(-rot);
    const sin = Math.sin(-rot);
    const lx = cos * (x - cx) - sin * (y - cy) + cx;
    const ly = sin * (x - cx) + cos * (y - cy) + cy;
    return lx >= layer.x && lx <= layer.x + layer.width && ly >= layer.y && ly <= layer.y + layer.height;
  };

  // 点是否在某图层的"视觉覆盖多边形"内 —— 取旋转后 4 顶点的凸多边形（用于裁剪图层）
  const pointInLayerVisualBox = (layer: Layer, x: number, y: number): boolean => {
    // 等价于 hitTestLayer 的非 brush 分支：旋转矩形包含 ⇔ 反旋转 AABB 包含
    if (layer.type === "brush") return false;
    return hitTestLayer(layer, x, y);
  };

  // 橡皮擦：按点擦除每个画笔图层的笔迹，points 数为 0 才删图层。
  // dryRun=true 时只对当前 state 做一次 setState（拖动过程中调用，不入 undo 栈，由 pointerup 一次性 commit base→当前）；
  // dryRun=false 时走 commit（手动单击擦除场景）。
  const eraseBrushLayersAt = (x: number, y: number, dryRun = false) => {
    const radius = eraserSize / 2;
    const apply = (current: EditorState): EditorState => {
      let changed = false;
      const layers: Layer[] = [];
      for (const layer of current.layers) {
        if (layer.type !== "brush") { layers.push(layer); continue; }
        const next = eraseBrushPoints(layer as BrushLayer, x, y, radius);
        if (next === null) { layers.push(layer); continue; }
        changed = true;
        if (next.length === 0) {
          // 笔迹全部被擦完 → 删除图层
          continue;
        }
        layers.push({ ...(layer as BrushLayer), points: next });
      }
      return changed ? { ...current, layers } : current;
    };
    if (dryRun) {
      setState(apply);
    } else {
      commit(apply);
    }
  };

  const renderLayer = (layer: Layer) => {
    if (!layer.visible) return null;
    const brushBox = layer.type === "brush" ? brushBoundingBox(layer) : null;
    // 裁剪态下：外层容器不旋转（让裁剪框、旋转手柄都保持正向），
    // 旋转改为应用到内部图片元素上 —— 实现"旋转图片但不旋转裁剪框"。
    const isCroppingThis = !!(cropping && cropping.layerId === layer.id && layer.type === "image");
    const outerRotation = isCroppingThis ? 0 : (layer.rotation ?? 0);
    const transform = `rotate(${outerRotation}deg) scale(${layer.flipX ? -1 : 1}, ${layer.flipY ? -1 : 1})`;
    const transformOrigin = brushBox && brushBox.width > 0 && brushBox.height > 0
      ? `${brushBox.x + brushBox.width / 2}px ${brushBox.y + brushBox.height / 2}px`
      : "center";
    const isSelected = selectedId === layer.id || selectedIds.includes(layer.id);
    const isSingleSelected = selectedId === layer.id && selectedIds.length <= 1;
    const isRotating = activeDrag?.type === "rotate" && activeDrag.id === layer.id;
    const textStyle = layer.type === "text" ? {
      color: layer.color,
      fontFamily: layer.fontFamily,
      fontSize: layer.fontSize,
      fontWeight: layer.bold ? 800 : 500,
      fontStyle: layer.italic ? "italic" : "normal",
      textAlign: layer.align,
      textDecoration: `${layer.underline ? "underline" : ""} ${layer.strike ? "line-through" : ""}`.trim(),
      letterSpacing: `${layer.letterSpacing ?? 0}px`,
      lineHeight: layer.lineHeight ?? 1.1
    } : undefined;
    // 画笔图层占满画布，但选中框要贴合实际笔迹，所以不在外层挂 is-selected
    // 裁剪态下：外层 layer 不旋转（让裁剪框保持正向），蓝框改由内部"跟随图片旋转"的覆盖层提供
    const showLayerOutline = isSingleSelected && layer.type !== "brush" && layer.type !== "line" && layer.type !== "curve" && !isCroppingThis;
    return (
      <div
        key={layer.id}
        className={`layer ${showLayerOutline ? "is-selected" : ""} ${layer.type === "brush" ? "layer-brush" : ""}`}
        style={{ left: layer.x, top: layer.y, width: layer.width, height: layer.height, transform, transformOrigin }}
        onPointerDown={(event) => beginLayerDrag(event, layer.id)}
        onDoubleClick={(event) => {
          event.stopPropagation();
          if (layer.type === "text") beginTextEditing(layer.id);
        }}
      >
        <div className="layer-content" style={{ opacity: layer.opacity }}>
        {layer.type === "image" && (() => {
          const adjust = layer.adjust ?? DEFAULT_IMAGE_ADJUST;
          const filterId = `img-adjust-${layer.id}`;
          const filterEl = buildImageAdjustFilter(filterId, adjust);
          const vignette = adjust.vignette;
          const vignetteOverlay = vignette
            ? (vignette < 0
                ? `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${Math.min(0.85, -vignette / 100 * 0.85)}) 100%)`
                : `radial-gradient(ellipse at center, rgba(255,255,255,${Math.min(0.85, vignette / 100 * 0.85)}) -20%, transparent 70%)`)
            : null;
          // 圆角：0..50 → border-radius 0..50%（50% 时呈圆/椭圆）
          const radius = layer.cornerRadius ?? 0;
          const borderRadius = radius ? `${radius}%` : undefined;
          // 裁剪：把图片放大并位移，使图层框正好对应 crop 区域
          const crop = layer.crop;
          // 非裁剪态：图片按 crop 缩放定位到图层框内（保持原本展示行为）
          // 裁剪态：显示"整张原图"（含 crop 外的内容），允许溢出 layer 框 ——
          //         旋转作用在原图上，裁剪框保持正向不动，框外区域由 CropOverlay 的 shade 暗化
          const imgPositionStyle: React.CSSProperties = crop
            ? {
                position: "absolute",
                left: `${-crop.x / crop.w * 100}%`,
                top: `${-crop.y / crop.h * 100}%`,
                width: `${100 / crop.w}%`,
                height: `${100 / crop.h}%`,
              }
            : {};
          const imgStyle: React.CSSProperties = {
            ...(filterEl ? { filter: `url(#${filterId})` } : null),
            ...(borderRadius ? { borderRadius } : null),
            ...imgPositionStyle,
          };
          const wrapStyle: React.CSSProperties = crop
            ? { overflow: "hidden", borderRadius }
            : {};
          const cutoutSession = cutout?.layerId === layer.id ? cutout : null;
          if (isCroppingThis) {
            // 裁剪态下取消 overflow:hidden，让原图整张可见
            wrapStyle.overflow = "visible";
            // 把旋转应用到图片自身，以"用户当前的裁剪框中心"为旋转中心 ——
            // 裁剪框在 wrap 坐标系中是 cropping!.rect（0..1 相对 W×H），其中心 (rx, ry)：
            //   rx = rect.x + rect.w/2, ry = rect.y + rect.h/2
            // 在 img 自身坐标系（img 是 wrap 的 1/crop.w × 1/crop.h 倍放大、偏移 -crop.x/crop.w, -crop.y/crop.h）：
            //   originX% = (rx · crop.w + crop.x) × 100
            //   originY% = (ry · crop.h + crop.y) × 100
            const rect = cropping!.rect;
            const cw = crop ? crop.w : 1;
            const ch = crop ? crop.h : 1;
            const cx = crop ? crop.x : 0;
            const cy = crop ? crop.y : 0;
            const originX = ((rect.x + rect.w / 2) * cw + cx) * 100;
            const originY = ((rect.y + rect.h / 2) * ch + cy) * 100;
            imgStyle.transform = `rotate(${layer.rotation ?? 0}deg)`;
            imgStyle.transformOrigin = `${originX}% ${originY}%`;
          }
          return (
            <div style={{ position: "relative", width: "100%", height: "100%", ...wrapStyle }}>
              {filterEl && (
                <svg className="layer-filter-defs" aria-hidden="true" focusable="false">
                  <defs>{filterEl}</defs>
                </svg>
              )}
              <img src={layer.src} draggable={false} style={imgStyle} />
              {vignetteOverlay && !isCroppingThis && (
                <span
                  className="image-vignette-overlay"
                  style={{ background: vignetteOverlay, borderRadius }}
                />
              )}
              {cutoutSession?.status === "processing" && (
                <span className="cutout-processing" />
              )}
              {cutoutSession?.status === "ready" && cutoutSession.candidates.map((candidate) => {
                const cropForCandidate = crop ?? { x: 0, y: 0, w: 1, h: 1 };
                const isActiveCandidate = cutoutSession.activeIds.includes(candidate.id);
                const isHoverCandidate = cutoutSession.hoverId === candidate.id;
                const isLit = isActiveCandidate || isHoverCandidate;
                const selectedCandidates = cutoutSession.candidates.filter((item) => cutoutSession.activeIds.includes(item.id));
                const actionBounds = selectedCandidates.length ? getCutoutBounds(selectedCandidates) : null;
                const maskStyle: React.CSSProperties = {
                  ...imgPositionStyle,
                  WebkitMaskImage: `url(${candidate.maskSrc})`,
                  maskImage: `url(${candidate.maskSrc})`,
                };
                const bboxStyle: React.CSSProperties = {
                  left: `${((candidate.bbox.x / candidate.naturalWidth - cropForCandidate.x) / cropForCandidate.w) * 100}%`,
                  top: `${((candidate.bbox.y / candidate.naturalHeight - cropForCandidate.y) / cropForCandidate.h) * 100}%`,
                  width: `${(candidate.bbox.width / candidate.naturalWidth / cropForCandidate.w) * 100}%`,
                  height: `${(candidate.bbox.height / candidate.naturalHeight / cropForCandidate.h) * 100}%`,
                };
                const actionStyle: React.CSSProperties = actionBounds ? {
                  left: `${((actionBounds.x / candidate.naturalWidth - cropForCandidate.x) / cropForCandidate.w) * 100}%`,
                  top: `${((actionBounds.y / candidate.naturalHeight - cropForCandidate.y) / cropForCandidate.h) * 100}%`,
                } : bboxStyle;
                const showActions = isActiveCandidate && cutoutSession.activeIds[0] === candidate.id;
                return (
                  <React.Fragment key={candidate.id}>
                    <span
                      className={`cutout-candidate ${isLit ? "lit" : ""} ${isActiveCandidate ? "active" : ""}`}
                      style={maskStyle}
                    />
                    <button
                      type="button"
                      aria-label="候选对象"
                      className="cutout-hitbox"
                      style={bboxStyle}
                      onPointerEnter={() => setCutout((current) => current?.layerId === layer.id ? { ...current, hoverId: candidate.id } : current)}
                      onPointerLeave={() => setCutout((current) => current?.layerId === layer.id ? { ...current, hoverId: current.hoverId === candidate.id ? null : current.hoverId } : current)}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        setCutout((current) => {
                          if (current?.layerId !== layer.id) return current;
                          if (!event.shiftKey) return { ...current, activeIds: [candidate.id], hoverId: candidate.id };
                          const alreadySelected = current.activeIds.includes(candidate.id);
                          const activeIds = alreadySelected
                            ? current.activeIds.filter((id) => id !== candidate.id)
                            : [...current.activeIds, candidate.id];
                          return { ...current, activeIds, hoverId: candidate.id };
                        });
                      }}
                    />
                    {showActions && (
                      <span className="cutout-actions" style={actionStyle} onPointerDown={(event) => event.stopPropagation()}>
                        <button
                          type="button"
                          aria-label="取消选择"
                          className="cutout-action"
                          onPointerDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setCutout((current) => current?.layerId === layer.id ? { ...current, activeIds: [] } : current);
                          }}
                        >
                          <X size={16} />
                        </button>
                        <button
                          type="button"
                          aria-label="确认抠图"
                          className="cutout-action primary"
                          onPointerDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            confirmCutoutCandidates(selectedCandidates);
                          }}
                        >
                          <Check size={16} />
                        </button>
                      </span>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          );
        })()}
        {layer.type === "text" && (
          editingTextId === layer.id ? (
            <textarea
              className="text-layer text-editor"
              value={layer.text}
              autoFocus
              onFocus={(event) => {
                if (!textEditBaseRef.current) textEditBaseRef.current = state;
                const target = event.currentTarget;
                window.requestAnimationFrame(() => {
                  const end = target.value.length;
                  target.setSelectionRange(end, end);
                });
              }}
              onPointerDown={(event) => event.stopPropagation()}
              onChange={(event) => updateTextLayer(layer.id, event.target.value)}
              onBlur={() => finishTextEditing(layer.id)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.currentTarget.blur();
                }
              }}
              style={textStyle}
            />
          ) : (
            <div
              className="text-layer"
              style={textStyle}
            >
              {layer.text}
            </div>
          )
        )}
        {layer.type === "shape" && <ShapeView layer={layer} />}
        {(layer.type === "line" || layer.type === "curve") && <LineView layer={layer} />}
        {layer.type === "brush" && <BrushView layer={layer} />}
        </div>
        {isSingleSelected && layer.type === "brush" && <BrushSelectionOverlay layer={layer} state={state} zoom={canvasZoom} setActiveDrag={setActiveDrag} isRotating={isRotating} />}
        {isSingleSelected && (layer.type === "line" || layer.type === "curve") && (
          <>
            <LinePointHandles layer={layer} state={state} zoom={canvasZoom} setActiveDrag={setActiveDrag} />
            <RotateHandle layer={layer} state={state} zoom={canvasZoom} setActiveDrag={setActiveDrag} isRotating={isRotating} />
          </>
        )}
        {isSingleSelected && layer.type !== "brush" && layer.type !== "line" && layer.type !== "curve" && !isCroppingThis && (
          <SelectionHandles
            layer={layer}
            state={state}
            zoom={canvasZoom}
            setActiveDrag={setActiveDrag}
            isRotating={isRotating}
          />
        )}
        {isSingleSelected && isCroppingThis && cropping && layer.type === "image" && (() => {
          // 裁剪态下的"旋转选中框" —— 必须严格贴合"图片在 wrap 中的实际矩形"，不是裁剪框/W×H。
          // 当 cover 放大了图片，图片其实溢出 wrap：
          //   图片左 = -crop.x / crop.w × W （相对 layer 容器，可为负）
          //   图片上 = -crop.y / crop.h × H
          //   图片宽 = W / crop.w
          //   图片高 = H / crop.h
          // 旋转中心 = 裁剪框中心（在原图 0..1 坐标系的位置 × 100 = transformOrigin%）
          const rect = cropping.rect;
          const crop = layer.crop ?? { x: 0, y: 0, w: 1, h: 1 };
          const W = layer.width;
          const H = layer.height;
          const imgLeft = -crop.x / crop.w * W;
          const imgTop = -crop.y / crop.h * H;
          const imgW = W / crop.w;
          const imgH = H / crop.h;
          // 裁剪框中心在 img 自身坐标系（百分比）= ((rect.cx · crop.w + crop.x), 同 y) × 100
          const originX = ((rect.x + rect.w / 2) * crop.w + crop.x) * 100;
          const originY = ((rect.y + rect.h / 2) * crop.h + crop.y) * 100;
          return (
            <div
              className="rotated-selection"
              style={{
                left: imgLeft,
                top: imgTop,
                width: imgW,
                height: imgH,
                transform: `rotate(${layer.rotation ?? 0}deg)`,
                transformOrigin: `${originX}% ${originY}%`,
              }}
            >
              <SelectionHandles
                layer={layer}
                state={state}
                zoom={canvasZoom}
                setActiveDrag={setActiveDrag}
                isRotating={isRotating}
                scaleType="imageBox"
                getScaleAnchor={() => {
                  // 锚点 = 裁剪框中心在视口的像素坐标（旋转中心、反旋转鼠标位移用的参照点）
                  const canvasRect = canvasRef.current?.getBoundingClientRect();
                  if (!canvasRect) return null;
                  const cx = (rect.x + rect.w / 2) * layer.width;
                  const cy = (rect.y + rect.h / 2) * layer.height;
                  return {
                    x: canvasRect.left + (layer.x + cx) * canvasZoom,
                    y: canvasRect.top + (layer.y + cy) * canvasZoom,
                  };
                }}
                getRotateCenter={() => {
                  // 旋转中心同样是裁剪框中心
                  const canvasRect = canvasRef.current?.getBoundingClientRect();
                  if (!canvasRect) return null;
                  const cx = (rect.x + rect.w / 2) * layer.width;
                  const cy = (rect.y + rect.h / 2) * layer.height;
                  return {
                    x: canvasRect.left + (layer.x + cx) * canvasZoom,
                    y: canvasRect.top + (layer.y + cy) * canvasZoom,
                  };
                }}
              />
            </div>
          );
        })()}
        {cropping && cropping.layerId === layer.id && layer.type === "image" && (
          <CropOverlay
            layer={layer}
            rect={cropping.rect}
            aspect={cropping.aspect}
            zoom={canvasZoom}
            onChange={applyCropRect}
            onShadePointerDown={(event) => {
              // 把点击位置换算到 canvas 坐标系
              const canvasRect = canvasRef.current?.getBoundingClientRect();
              if (!canvasRect) { cancelCrop(); setSelectedId(null); return; }
              const x = (event.clientX - canvasRect.left) / canvasZoom;
              const y = (event.clientY - canvasRect.top) / canvasZoom;
              // 规则：若点击落在「正在裁剪的图片图层」视觉覆盖范围内（旋转后多边形）
              // —— 视为「点在裁剪图片上」，忽略其上方任何图层的命中，按空白处理：
              //    取消裁剪 + 清空 selectedId（属性栏隐藏）
              if (pointInLayerVisualBox(layer, x, y)) {
                event.stopPropagation();
                cancelCrop();
                setSelectedId(null);
                return;
              }
              // 否则在画布内做正常 hit-test —— 顶层优先
              for (let i = state.layers.length - 1; i >= 0; i--) {
                const hit = state.layers[i];
                if (hit.id === layer.id) continue; // 跳过裁剪图层自己（其外部命中也不算选自己）
                if (!hitTestLayer(hit, x, y)) continue;
                event.stopPropagation();
                cancelCrop();
                setTool("select");
                setSelectedId(hit.id);
                return;
              }
              // 都没命中：清空选中、隐藏属性栏
              event.stopPropagation();
              cancelCrop();
              setSelectedId(null);
            }}
          />
        )}
      </div>
    );
  };

  return (
    <main className="app">
      <header className="topbar">
        <div className="canvas-controls">
          <label className="field">
            <select
              value={state.canvas.ratio}
              onChange={(event) => {
                const ratio = event.target.value as Ratio;
                commit((current) => ({ ...current, canvas: { ...current.canvas, ...ratioSizes[ratio], ratio } }));
              }}
            >
              {(Object.keys(ratioSizes) as Ratio[]).map((ratio) => <option key={ratio} value={ratio}>{ratioLabels[ratio]}</option>)}
            </select>
          </label>
          <div className="background-picker" ref={backgroundPickerRef}>
            <button className="color-chip" title="画布背景色" aria-label="画布背景色" onClick={() => setBackgroundPickerOpen((open) => !open)}>
              <span style={{ background: state.canvas.background }} />
            </button>
            {backgroundPickerOpen && (
              <ColorPopover
                color={state.canvas.background}
                onChange={updateCanvasBackground}
              />
            )}
          </div>
        </div>
        <PropertyBar
          selected={tool === "select" ? selected : null}
          updateSelected={updateSelected}
          duplicateLayer={duplicateLayer}
          deleteLayer={deleteLayer}
          moveLayerOrder={moveLayerOrder}
          resetLayer={resetLayer}
          showToast={showToast}
          beginCutout={beginCutout}
          cutoutProcessing={cutout?.status === "processing"}
          cropping={cropping ? { layerId: cropping.layerId, aspect: cropping.aspect } : null}
          beginCrop={beginCrop}
          setCropAspect={setCropAspect}
          finishCrop={finishCrop}
          cancelCrop={cancelCrop}
          resetCrop={resetCropRect}
        />
        <div className="topbar-actions">
          <button
            type="button"
            className="topbar-icon-btn tooltip-host"
            data-tooltip="复制到剪贴板（PNG)"
            aria-label="复制画布为图片"
            onClick={() => copyCanvasToClipboard().catch(() => showToast("复制失败"))}
          >
            <Copy size={18} />
          </button>
          <button
            type="button"
            className="topbar-icon-btn canvas-close-btn tooltip-host"
            data-tooltip="保存并返回"
            aria-label="保存并返回"
            onClick={saveAndReturn}
          >
            <X size={18} />
          </button>
        </div>
      </header>

      <section className="workspace">
        <div className="stage">
          <div
            ref={canvasShellRef}
            className={`canvas-shell ${panDrag ? "is-panning" : "is-pannable"}`}
            onPointerDown={(event) => {
              if (event.target !== event.currentTarget) return;
              event.preventDefault();
              // 点击画布以外的空白区域：取消裁剪、取消选中、让属性栏隐藏
              if (cropping) cancelCrop();
              setSelectedId(null);
              setSelectedIds([]);
              setPanDrag({ startX: event.clientX, startY: event.clientY, baseX: canvasPan.x, baseY: canvasPan.y });
            }}
          >
            <div
              ref={canvasRef}
              className={`canvas ${state.canvas.ratio === "custom" ? "custom-canvas" : ""} ${tool === "brush" && brushMode === "brush" ? "cursor-brush" : ""} ${tool === "brush" && brushMode === "eraser" ? "cursor-eraser" : ""}`}
              style={{ width: state.canvas.width, height: state.canvas.height, background: state.canvas.background, transform: `translate(${canvasPan.x}px, ${canvasPan.y}px) scale(${canvasZoom})` }}
              onWheel={(event) => {
                if (!event.ctrlKey && !event.metaKey) return;
                event.preventDefault();
                const delta = -event.deltaY * 0.002;
                zoomCanvasBy(delta);
              }}
              onPointerDown={(event) => {
                if (tool === "brush") return beginBrush(event);
                // 任何工具下点击画布空白：检测画笔图层命中，命中则切到选择工具并选中
                const rect = canvasRef.current?.getBoundingClientRect();
                if (!rect) {
                  if (cropping) cancelCrop();
                  setSelectedId(null);
                  setSelectedIds([]);
                  return;
                }
                const x = (event.clientX - rect.left) / canvasZoom;
                const y = (event.clientY - rect.top) / canvasZoom;
                for (let i = state.layers.length - 1; i >= 0; i--) {
                  const layer = state.layers[i];
                  if (!layer.visible || layer.type !== "brush") continue;
                  if (brushLayerHit(layer as BrushLayer, x, y, 0)) {
                    event.stopPropagation();
                    if (cropping && cropping.layerId !== layer.id) cancelCrop();
                    setTool("select");
                    setSelectedId(layer.id);
                    setSelectedIds([layer.id]);
                    setActiveDrag({ type: "move", id: layer.id, startX: event.clientX, startY: event.clientY, zoom: canvasZoom, base: state });
                    return;
                  }
                }
                if (cropping) cancelCrop();
                setSelectedId(null);
                setSelectedIds([]);
                setMarquee({ startX: x, startY: y, currentX: x, currentY: y });
              }}
            >
              {state.layers.map(renderLayer)}
              {selectedIds.length > 1 && (() => {
                const bounds = selectedGroupBounds();
                if (!bounds) return null;
                return (
                  <span
                    className="group-selection-box"
                    style={{
                      left: bounds.left,
                      top: bounds.top,
                      width: bounds.right - bounds.left,
                      height: bounds.bottom - bounds.top,
                    }}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      setActiveDrag({
                        type: "groupMove",
                        ids: selectedIds,
                        startX: event.clientX,
                        startY: event.clientY,
                        zoom: canvasZoom,
                        base: state,
                      });
                    }}
                  >
                    {(["tl", "tr", "bl", "br", "t", "b", "l", "r"] as const).map((corner) => (
                      <span
                        key={corner}
                        className={`group-resize-handle ${corner}`}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          setActiveDrag({
                            type: "groupScale",
                            ids: selectedIds,
                            corner,
                            groupBounds: bounds,
                            startX: event.clientX,
                            startY: event.clientY,
                            zoom: canvasZoom,
                            base: state,
                          });
                        }}
                      />
                    ))}
                  </span>
                );
              })()}
              {selectedIds.length > 1 && state.layers.filter((layer) => selectedIds.includes(layer.id) && layer.visible).map((layer) => {
                const bounds = layerVisualBounds(layer);
                return (
                  <span
                    key={`multi-${layer.id}`}
                    className="multi-selection-box"
                    style={{
                      left: bounds.left,
                      top: bounds.top,
                      width: bounds.right - bounds.left,
                      height: bounds.bottom - bounds.top,
                    }}
                  />
                );
              })}
              {marquee && (() => {
                const left = Math.min(marquee.startX, marquee.currentX);
                const top = Math.min(marquee.startY, marquee.currentY);
                return (
                  <span
                    className="marquee-selection"
                    style={{
                      left,
                      top,
                      width: Math.abs(marquee.currentX - marquee.startX),
                      height: Math.abs(marquee.currentY - marquee.startY),
                    }}
                  />
                );
              })()}
              {state.canvas.ratio === "custom" && (
                <>
                  {(["t", "b", "l", "r", "tl", "tr", "bl", "br"] as const).map((dir) => (
                    <span
                      key={dir}
                      className={`canvas-edge canvas-edge-${dir}`}
                      title="拖拽调整自定义画布尺寸"
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        setActiveDrag({ type: "canvas", corner: dir, startX: event.clientX, startY: event.clientY, zoom: canvasZoom, base: state });
                      }}
                    />
                  ))}
                </>
              )}
            </div>
          </div>
        </div>

        <aside className="layers-panel">
          <div className="panel-title">图层</div>
          <div className="layer-list">
            {[...state.layers].reverse().map((layer) => (
              <div
                key={layer.id}
                className={`layer-row ${selectedId === layer.id || selectedIds.includes(layer.id) ? "active" : ""} ${layerDrag?.id === layer.id ? "dragging" : ""} ${layerDrag?.overId === layer.id && layerDrag.position ? `drop-${layerDrag.position}` : ""}`}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", layer.id);
                  setLayerDrag({ id: layer.id, overId: null, position: null });
                }}
                onDragEnd={() => setLayerDrag(null)}
                onDragOver={(event) => {
                  event.preventDefault();
                  const rect = event.currentTarget.getBoundingClientRect();
                  const position = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
                  setLayerDrag((current) => current?.id ? { ...current, overId: layer.id, position } : current);
                }}
                onDragLeave={(event) => {
                  if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                  setLayerDrag((current) => current?.overId === layer.id ? { ...current, overId: null, position: null } : current);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const from = event.dataTransfer.getData("text/plain") || layerDrag?.id;
                  const rect = event.currentTarget.getBoundingClientRect();
                  const position = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
                  if (from) reorderLayerByPanelDrop(from, layer.id, position);
                  setLayerDrag(null);
                }}
                onClick={() => {
                  if (cropping && cropping.layerId !== layer.id) cancelCrop();
                  setTool("select");
                  setSelectedId(layer.id);
                  setSelectedIds([layer.id]);
                }}
              >
                <button
                  className="icon-btn"
                  title={layer.visible ? "隐藏图层" : "显示图层"}
                  onClick={(event) => {
                    event.stopPropagation();
                    commit((current) => ({ ...current, layers: current.layers.map((item) => item.id === layer.id ? cloneLayer(item, { visible: !item.visible }) : item) }));
                  }}
                >
                  {layer.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
                <LayerThumb layer={layer} background={state.canvas.background} />
                {editingNameId === layer.id ? (
                  <input
                    autoFocus
                    defaultValue={layer.name}
                    onBlur={(event) => {
                      commit((current) => ({ ...current, layers: current.layers.map((item) => item.id === layer.id ? cloneLayer(item, { name: event.target.value || item.name }) : item) }));
                      setEditingNameId(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") (event.target as HTMLInputElement).blur();
                    }}
                  />
                ) : (
                  <span onDoubleClick={() => setEditingNameId(layer.id)}>{layer.name}</span>
                )}
                <button ref={openMenuId === layer.id ? layerMenuTriggerRef : null} className="icon-btn" title="更多" onClick={(event) => { event.stopPropagation(); setOpenMenuId(openMenuId === layer.id ? null : layer.id); }}><Menu size={16} /></button>
                {openMenuId === layer.id && (
                  <div className="more-menu" ref={layerMenuRef}>
                    <button onClick={() => duplicateLayer(layer.id)}><Copy size={14} />复制图层</button>
                    <button onClick={() => moveLayerOrder(layer.id, "up")}><MoveUp size={14} />上移图层</button>
                    <button onClick={() => moveLayerOrder(layer.id, "down")}><MoveDown size={14} />下移图层</button>
                    <button onClick={() => deleteLayer(layer.id)}><Trash2 size={14} />删除图层</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </aside>

        <div className="zoom-controls" aria-label="画布缩放">
          <button type="button" className="zoom-control-btn" aria-label="缩小画布" onClick={() => zoomCanvasBy(-0.1)} disabled={canvasZoom <= 0.35}>
            <Minus size={16} />
          </button>
          <span className="zoom-readout">{Math.round(canvasZoom * 100)}%</span>
          <button type="button" className="zoom-control-btn" aria-label="放大画布" onClick={() => zoomCanvasBy(0.1)} disabled={canvasZoom >= 2.5}>
            <Plus size={16} />
          </button>
          <span className="zoom-divider" />
          <button type="button" className="zoom-percent-btn" aria-label="缩放到 100%" onClick={() => { setCanvasZoomClamped(1); setCanvasPan({ x: 0, y: 0 }); }}>
            100%
          </button>
          <button type="button" className="zoom-control-btn tooltip-host" data-tooltip="适应屏幕" aria-label="重置画布位置和大小" onClick={resetCanvasViewport}>
            <Maximize2 size={16} />
          </button>
        </div>

        <footer className="toolbar">
          <ToolButton active={tool === "select"} label="选择" onClick={() => setTool("select")}><MousePointer2 size={20} /></ToolButton>
          <div className="tool-pop" ref={brushToolRef}>
            <ToolButton active={tool === "brush"} label="画笔" onClick={() => { setTool("brush"); setBrushMode("brush"); setSettingsOpen(false); setSelectedId(null); }}><Brush size={20} /></ToolButton>
            {tool === "brush" && (
              <div className="brush-options">
                <button className={`brush-options-btn tooltip-host ${brushMode === "brush" ? "active" : ""}`} data-tooltip="钢笔" aria-label="钢笔" onClick={() => setBrushMode("brush")}><Brush size={20} /></button>
                <button className={`brush-options-btn tooltip-host ${brushMode === "eraser" ? "active" : ""}`} data-tooltip="橡皮擦" aria-label="橡皮擦" onClick={() => setBrushMode("eraser")}><Eraser size={20} /></button>
                <div
                  className="brush-color-picker"
                  ref={brushColorPickerRef}
                >
                  <button
                    type="button"
                    className="color-chip"
                    aria-label={brushMode === "eraser" ? "橡皮擦设置" : "颜色"}
                    onClick={() => setBrushColorPickerOpen((open) => !open)}
                  >
                    <span style={{ background: brushMode === "eraser" ? "#8b8f98" : brushColor }} />
                  </button>
                  {brushColorPickerOpen && (
                    <div className="brush-all-popover">
                      <div className="brush-settings-group">
                        <div className="brush-settings-label">粗细</div>
                        <div className="brush-settings-row">
                          {brushMode === "eraser" ? (
                            // 橡皮擦粗细：1..200（橡皮通常需要比笔更粗）
                            <>
                              <input type="range" min="1" max="200" step="1" value={eraserSize} onChange={(e) => setEraserSize(Number(e.target.value))} />
                              <input type="text" inputMode="numeric" value={eraserSize} onChange={(e) => { const d = e.target.value.replace(/[^0-9]/g, ""); setEraserSize(d === "" ? 1 : Math.max(1, Math.min(200, Number(d)))); }} />
                            </>
                          ) : (
                            <>
                              <input type="range" min="1" max="100" step="1" value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} />
                              <input type="text" inputMode="numeric" value={brushSize} onChange={(e) => { const d = e.target.value.replace(/[^0-9]/g, ""); setBrushSize(d === "" ? 1 : Math.max(1, Math.min(100, Number(d)))); }} />
                            </>
                          )}
                        </div>
                      </div>
                      {brushMode !== "eraser" && (
                        <ColorPopover color={brushColor} onChange={setBrushColor} className="brush-inline-color" opacity={brushOpacity} onOpacityChange={setBrushOpacity} />
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="tool-pop" ref={shapeMenuRef}>
            <ToolButton active={tool === "shape"} label="形状" onClick={() => { setTool("shape"); setShapeMenu(!shapeMenu); setSelectedId(null); }}><Shapes size={20} /></ToolButton>
            {shapeMenu && (
              <div className="shape-picker">
                {([
                  ["rect", Square, "矩形"], ["rounded", Square, "圆角矩形"], ["circle", Circle, "圆形"], ["triangle", Triangle, "三角形"], ["invertedTriangle", Triangle, "倒三角形"], ["diamond", Diamond, "菱形"], ["pentagon", Pentagon, "五边形"]
                ] as [string, typeof Square, string][]).map(([kind, Icon, label]) => (
                  <button key={kind} className="tooltip-host" data-tooltip={label} aria-label={label} onClick={() => { addShape(kind as ShapeKind); }}><Icon size={18} /></button>
                ))}
              </div>
            )}
          </div>
          <div className="tool-pop" ref={lineMenuRef}>
            <ToolButton active={tool === "line"} label="线条" onClick={() => { setTool("line"); setLineMenu(!lineMenu); setSelectedId(null); }}><LineChart size={20} /></ToolButton>
            {lineMenu && (
              <div className="shape-picker">
                <button className="tooltip-host" data-tooltip="直线" aria-label="直线" onClick={() => addLine("line")}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="5" cy="5" r="2" fill="currentColor" stroke="none" />
                    <circle cx="19" cy="19" r="2" fill="currentColor" stroke="none" />
                    <line x1="5" y1="5" x2="19" y2="19" />
                  </svg>
                </button>
                <button className="tooltip-host" data-tooltip="曲线" aria-label="曲线" onClick={() => addLine("curve")}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="5" cy="19" r="2" fill="currentColor" stroke="none" />
                    <circle cx="19" cy="19" r="2" fill="currentColor" stroke="none" />
                    <path d="M5 19 C5 6, 19 6, 19 19" fill="none" />
                  </svg>
                </button>
              </div>
            )}
          </div>
          <ToolButton active={tool === "text"} label="文字" onClick={() => { setTool("text"); setSelectedId(null); addText(); }}><Type size={20} /></ToolButton>
          <ToolButton active={tool === "upload"} label="上传图片" onClick={() => fileRef.current?.click()}><Upload size={20} /></ToolButton>
          <ToolButton disabled={!past.length} label="撤销" onClick={undo}><Undo2 size={20} /></ToolButton>
          <ToolButton disabled={!future.length} label="重做" onClick={redo}><Redo2 size={20} /></ToolButton>
        </footer>
      </section>

      <input ref={fileRef} className="hidden-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => event.target.files?.[0] && addImageFile(event.target.files[0])} />
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

function PropertyOpacityButton({ opacity, onChange }: { opacity: number; onChange: (value: number) => void }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  useClickOutside([ref], open, React.useCallback(() => setOpen(false), []));
  return (
    <div className="opacity-picker" ref={ref}>
      <button
        type="button"
        className="icon-only tooltip-host"
        data-tooltip="透明度"
        aria-label="透明度"
        onClick={() => setOpen((o) => !o)}
      >
        <Droplet size={17} />
      </button>
      {open && (
        <div className="popover opacity-popover">
          <div className="brush-settings-group">
            <div className="brush-settings-label">透明度</div>
            <div className="brush-settings-row">
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={opacity}
                onChange={(e) => onChange(Number(e.target.value))}
              />
              <input
                type="text"
                inputMode="decimal"
                value={Number(opacity.toFixed(2))}
                onChange={(e) => {
                  const clean = e.target.value.replace(/[^0-9.]/g, "");
                  if (clean === "" || clean === ".") return onChange(0);
                  onChange(Math.max(0, Math.min(1, Number(clean))));
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ShapeFillButton({ color, noFill, onColorChange, onNoFill, opacity, onOpacityChange }: { color: string; noFill: boolean; onColorChange: (hex: string) => void; onNoFill: () => void; opacity: number; onOpacityChange: (value: number) => void }) {
  const [colorOpen, setColorOpen] = React.useState(false);
  const colorRef = React.useRef<HTMLDivElement>(null);
  useClickOutside([colorRef], colorOpen, React.useCallback(() => setColorOpen(false), []));
  return (
    <>
      {/* 颜色按钮 */}
      <div className="brush-color-picker property-color-picker" ref={colorRef}>
        <button
          type="button"
          className="color-chip"
          aria-label="颜色"
          onClick={() => setColorOpen((o) => !o)}
        >
          <span style={{ background: noFill ? "transparent" : color }} className={noFill ? "no-fill" : ""} />
        </button>
        {colorOpen && <ColorPopover color={noFill ? "#111827" : color} onChange={(hex) => { onColorChange(hex); }} opacity={opacity} onOpacityChange={onOpacityChange} />}
      </div>
      {/* 无色按钮 */}
      <button
        type="button"
        className={`icon-only tooltip-host ${noFill ? "active" : ""}`}
        data-tooltip="无色"
        aria-label="无色"
        onClick={onNoFill}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="4" y1="4" x2="20" y2="20" /></svg>
      </button>
    </>
  );
}

function ShapeStrokeButton({ stroke, strokeWidth, strokeStyle, opacity, onUpdate }: {
  stroke: string;
  strokeWidth: number;
  strokeStyle: string;
  opacity: number;
  onUpdate: (patch: Partial<{ stroke: string; strokeWidth: number; strokeStyle: string; opacity: number }>) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  useClickOutside([ref], open, React.useCallback(() => setOpen(false), []));
  const styles = [
    { value: "none", label: "无" },
    { value: "solid", label: "实线" },
    { value: "dashed", label: "虚线" },
    { value: "dotted", label: "点线" }
  ];
  return (
    <div className="stroke-picker" ref={ref}>
      <button
        type="button"
        className="icon-only tooltip-host"
        data-tooltip="边框"
        aria-label="边框"
        onClick={() => setOpen((o) => !o)}
      >
        <CircleDashed size={17} />
      </button>
      {open && (
        <div className="popover stroke-popover">
          <div className="brush-settings-group">
            <div className="brush-settings-label">边框样式</div>
            <div className="stroke-style-row">
              {styles.map((s) => (
                <button
                  key={s.value}
                  className={`stroke-style-btn tooltip-host ${strokeStyle === s.value ? "active" : ""}`}
                  data-tooltip={s.label}
                  aria-label={s.label}
                  onClick={() => onUpdate({ strokeStyle: s.value })}
                >
                  {s.value === "none" && <svg width="18" height="18" viewBox="0 0 24 24"><line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="2" opacity="0.3" /></svg>}
                  {s.value === "solid" && <svg width="18" height="18" viewBox="0 0 24 24"><line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="2" /></svg>}
                  {s.value === "dashed" && <svg width="18" height="18" viewBox="0 0 24 24"><line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="2" strokeDasharray="6 4" /></svg>}
                  {s.value === "dotted" && <svg width="18" height="18" viewBox="0 0 24 24"><line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="2" strokeDasharray="2 4" strokeLinecap="round" /></svg>}
                </button>
              ))}
            </div>
          </div>
          <div className="brush-settings-group">
            <div className="brush-settings-label">边框宽度</div>
            <div className="brush-settings-row">
              <input type="range" min="0" max="100" step="1" value={strokeWidth} onChange={(e) => {
                const v = Number(e.target.value);
                if (v === 0) onUpdate({ strokeWidth: 0, strokeStyle: "none" });
                else if (strokeWidth === 0 && v > 0) onUpdate({ strokeWidth: v, strokeStyle: "solid" });
                else onUpdate({ strokeWidth: v });
              }} />
              <input type="text" inputMode="numeric" value={strokeWidth} onChange={(e) => {
                const d = e.target.value.replace(/[^0-9]/g, "");
                const v = Math.max(0, Math.min(100, Number(d) || 0));
                if (v === 0) onUpdate({ strokeWidth: 0, strokeStyle: "none" });
                else if (strokeWidth === 0 && v > 0) onUpdate({ strokeWidth: v, strokeStyle: "solid" });
                else onUpdate({ strokeWidth: v });
              }} />
            </div>
          </div>
          {strokeWidth > 0 && (
            <div className="brush-settings-group">
              <div className="brush-settings-label">边框颜色</div>
              <ColorPopover color={stroke} onChange={(hex) => onUpdate({ stroke: hex })} className="stroke-color-popover" opacity={opacity} onOpacityChange={(value) => onUpdate({ opacity: value })} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LineCapButton({ type, value, onChange }: { type: "start" | "end"; value: LineCap; onChange: (v: LineCap) => void }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  useClickOutside([ref], open, React.useCallback(() => setOpen(false), []));
  const isStart = type === "start";
  const caps: { value: LineCap; label: string }[] = [
    { value: "none", label: "无" },
    { value: "arrow", label: "箭头" },
    { value: "circle", label: "圆形" },
    { value: "square", label: "方块" },
    { value: "diamond", label: "菱形" },
    { value: "bar", label: "竖线" },
    { value: "arrow-filled", label: "实心箭头" },
    { value: "circle-filled", label: "实心圆形" },
    { value: "square-filled", label: "实心方块" },
    { value: "diamond-filled", label: "实心菱形" },
  ];
  const renderCapPreview = (cap: LineCap, dir: "start" | "end") => {
    const isLeft = dir === "start";
    const lineStart = cap === "diamond" || cap === "diamond-filled" ? (isLeft ? 19 : 7) : (isLeft ? 11 : 7);
    const lineEnd = cap === "diamond" || cap === "diamond-filled" ? (isLeft ? 25 : 13) : (isLeft ? 25 : 21);
    const capX = isLeft ? 8 : 24;
    const lineEl = <line x1={lineStart} y1="16" x2={lineEnd} y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />;
    const capEl = (() => {
      switch (cap) {
        case "none":
          return (
            <>
              <circle cx="16" cy="16" r="9" fill="none" stroke="currentColor" strokeWidth="1.7" />
              <line x1="10" y1="22" x2="22" y2="10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </>
          );
        case "arrow":
          return isLeft
            ? <polyline points={`${capX + 6},10 ${capX},16 ${capX + 6},22`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            : <polyline points={`${capX - 6},10 ${capX},16 ${capX - 6},22`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />;
        case "arrow-filled":
          return isLeft
            ? <polygon points={`${capX},16 ${capX + 8},10 ${capX + 8},22`} fill="currentColor" stroke="none" />
            : <polygon points={`${capX},16 ${capX - 8},10 ${capX - 8},22`} fill="currentColor" stroke="none" />;
        case "circle":
          return <circle cx={capX} cy="16" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.7" />;
        case "circle-filled":
          return <circle cx={capX} cy="16" r="3.2" fill="currentColor" stroke="none" />;
        case "square":
          return <rect x={capX - 2.5} y="13.5" width="5" height="5" fill="none" stroke="currentColor" strokeWidth="1.6" />;
        case "square-filled":
          return <rect x={capX - 3.2} y="12.8" width="6.4" height="6.4" fill="currentColor" stroke="none" />;
        case "diamond":
          return isLeft
            ? <polygon points={`${capX - 1},16 ${capX + 4},12 ${capX + 9},16 ${capX + 4},20`} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            : <polygon points={`${capX + 1},16 ${capX - 4},12 ${capX - 9},16 ${capX - 4},20`} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />;
        case "diamond-filled":
          return isLeft
            ? <polygon points={`${capX - 1},16 ${capX + 4.5},11.5 ${capX + 10},16 ${capX + 4.5},20.5`} fill="currentColor" stroke="none" />
            : <polygon points={`${capX + 1},16 ${capX - 4.5},11.5 ${capX - 10},16 ${capX - 4.5},20.5`} fill="currentColor" stroke="none" />;
        case "bar":
          return <line x1={capX} y1="11" x2={capX} y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />;
        default:
          return null;
      }
    })();
    return (
      <svg className="line-cap-preview" width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        {cap !== "none" && lineEl}
        {capEl}
      </svg>
    );
  };
  const renderButtonIcon = (cap: LineCap, dir: "start" | "end") => {
    const isLeft = dir === "start";
    const lineEl = <line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />;
    const defaultArrow = isLeft
      ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="20" y1="12" x2="4" y2="12" /><polyline points="11,5 4,12 11,19" /></svg>
      : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="12" x2="20" y2="12" /><polyline points="13,5 20,12 13,19" /></svg>;
    switch (cap) {
      case "none":
        return defaultArrow;
      case "arrow":
        return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{lineEl}{isLeft ? <polyline points="10,7 4,12 10,17" /> : <polyline points="14,7 20,12 14,17" />}</svg>;
      case "arrow-filled":
        return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{lineEl}{isLeft ? <polygon points="4,12 11,7 11,17" fill="currentColor" stroke="none" /> : <polygon points="20,12 13,7 13,17" fill="currentColor" stroke="none" />}</svg>;
      case "circle":
        return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{lineEl}{isLeft ? <circle cx="7" cy="12" r="3" /> : <circle cx="17" cy="12" r="3" />}</svg>;
      case "circle-filled":
        return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{lineEl}{isLeft ? <circle cx="7" cy="12" r="3" fill="currentColor" /> : <circle cx="17" cy="12" r="3" fill="currentColor" />}</svg>;
      case "square":
        return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{lineEl}{isLeft ? <rect x="3" y="9" width="6" height="6" /> : <rect x="15" y="9" width="6" height="6" />}</svg>;
      case "square-filled":
        return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{lineEl}{isLeft ? <rect x="3" y="9" width="6" height="6" fill="currentColor" /> : <rect x="15" y="9" width="6" height="6" fill="currentColor" />}</svg>;
      case "diamond":
        return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{lineEl}{isLeft ? <polygon points="4,12 8,8 12,12 8,16" /> : <polygon points="20,12 16,8 12,12 16,16" />}</svg>;
      case "diamond-filled":
        return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{lineEl}{isLeft ? <polygon points="4,12 8,8 12,12 8,16" fill="currentColor" stroke="none" /> : <polygon points="20,12 16,8 12,12 16,16" fill="currentColor" stroke="none" />}</svg>;
      case "bar":
        return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">{lineEl}{isLeft ? <line x1="4" y1="7" x2="4" y2="17" strokeWidth="2.5" /> : <line x1="20" y1="7" x2="20" y2="17" strokeWidth="2.5" />}</svg>;
      default:
        return defaultArrow;
    }
  };
  return (
    <div className="stroke-picker" ref={ref}>
      <button type="button" className="icon-only tooltip-host" data-tooltip={isStart ? "线条起点" : "线条终点"} aria-label={isStart ? "线条起点" : "线条终点"} onClick={() => setOpen((o) => !o)}>
        {renderButtonIcon(value, type)}
      </button>
      {open && (
        <div className="popover line-cap-popover">
          <div className="line-cap-grid">
            {caps.map((c) => (
              <button
                key={c.value}
                className={`stroke-style-btn line-cap-option ${value === c.value ? "active" : ""}`}
                aria-label={`${isStart ? "线条起点" : "线条终点"}：${c.label}`}
                onClick={() => { onChange(c.value); }}
              >
                {renderCapPreview(c.value, type)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LineCapSwapButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="icon-only line-cap-swap tooltip-host"
      data-tooltip="调换行尾"
      aria-label="调换行尾"
      onClick={onClick}
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="9,7 5,12 9,17" />
        <polyline points="15,7 19,12 15,17" />
      </svg>
    </button>
  );
}

function LineStyleButton({ strokeStyle, strokeWidth, onUpdate }: { strokeStyle: string; strokeWidth: number; onUpdate: (patch: Partial<{ strokeStyle: string; strokeWidth: number }>) => void }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  useClickOutside([ref], open, React.useCallback(() => setOpen(false), []));
  const styles = [
    { value: "solid", label: "实线" },
    { value: "dashed", label: "虚线" },
    { value: "dotted", label: "点线" }
  ];
  return (
    <div className="stroke-picker" ref={ref}>
      <button
        type="button"
        className="icon-only"
        aria-label="线条样式"
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="12" x2="21" y2="12" strokeDasharray={strokeStyle === "dashed" ? "6 4" : strokeStyle === "dotted" ? "2 4" : undefined} />
        </svg>
      </button>
      {open && (
        <div className="popover stroke-popover line-style-popover">
          <div className="brush-settings-group">
            <div className="brush-settings-label">样式</div>
            <div className="stroke-style-row">
              {styles.map((s) => (
                <button
                  key={s.value}
                  className={`stroke-style-btn tooltip-host ${strokeStyle === s.value ? "active" : ""}`}
                  data-tooltip={s.label}
                  aria-label={s.label}
                  onClick={() => onUpdate({ strokeStyle: s.value })}
                >
                  {s.value === "solid" && <svg width="18" height="18" viewBox="0 0 24 24"><line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="2" /></svg>}
                  {s.value === "dashed" && <svg width="18" height="18" viewBox="0 0 24 24"><line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="2" strokeDasharray="6 4" /></svg>}
                  {s.value === "dotted" && <svg width="18" height="18" viewBox="0 0 24 24"><line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="2" strokeDasharray="2 4" strokeLinecap="round" /></svg>}
                </button>
              ))}
            </div>
          </div>
          <div className="brush-settings-group">
            <div className="brush-settings-label">粗细</div>
            <div className="brush-settings-row">
              <input type="range" min="1" max="100" step="1" value={strokeWidth} onChange={(e) => onUpdate({ strokeWidth: Number(e.target.value) })} />
              <input type="text" inputMode="numeric" value={strokeWidth} onChange={(e) => {
                const d = e.target.value.replace(/[^0-9]/g, "");
                onUpdate({ strokeWidth: Math.max(1, Math.min(100, Number(d) || 1)) });
              }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PropertyColorButton({ color, onChange, opacity, onOpacityChange }: { color: string; onChange: (hex: string) => void; opacity?: number; onOpacityChange?: (value: number) => void }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  useClickOutside([ref], open, React.useCallback(() => setOpen(false), []));
  return (
    <div className="brush-color-picker property-color-picker" ref={ref}>
      <button
        type="button"
        className="color-chip"
        aria-label="颜色"
        onClick={() => setOpen((o) => !o)}
      >
        <span style={{ background: color }} />
      </button>
      {open && <ColorPopover color={color} onChange={onChange} opacity={opacity} onOpacityChange={onOpacityChange} />}
    </div>
  );
}

function StrikeIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 5H9.5A3.5 3.5 0 0 0 6 8.5c0 1.1.5 2.1 1.3 2.7" />
      <path d="M7 19h7.5a3.5 3.5 0 0 0 3.5-3.5c0-1.1-.5-2.1-1.3-2.7" />
      <line x1="4" y1="12" x2="20" y2="12" />
    </svg>
  );
}

function AlignCycleIcon({ align }: { align: TextLayer["align"] }) {
  if (align === "center") return <AlignCenter size={17} />;
  if (align === "right") return <AlignRight size={17} />;
  return <AlignLeft size={17} />;
}

function ImageAdjustButton({ adjust, onUpdate }: { adjust: ImageAdjust; onUpdate: (next: ImageAdjust) => void }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  useClickOutside([ref], open, React.useCallback(() => setOpen(false), []));

  const set = <K extends keyof ImageAdjust>(key: K, value: ImageAdjust[K]) => onUpdate({ ...adjust, [key]: value });

  type Slider = { key: keyof ImageAdjust; label: string; min: number; max: number; step?: number };
  const wb: Slider[] = [
    { key: "temperature", label: "色温", min: -100, max: 100 },
    { key: "tint", label: "色调", min: -100, max: 100 },
  ];
  const light: Slider[] = [
    { key: "brightness", label: "亮度", min: -100, max: 100 },
    { key: "contrast", label: "对比度", min: -100, max: 100 },
    { key: "highlights", label: "高光", min: -100, max: 100 },
    { key: "shadows", label: "阴影", min: -100, max: 100 },
    { key: "whites", label: "白色", min: -100, max: 100 },
    { key: "blacks", label: "黑色", min: -100, max: 100 },
  ];
  const color: Slider[] = [
    { key: "vibrance", label: "自然饱和度", min: -100, max: 100 },
    { key: "saturation", label: "饱和度", min: -100, max: 100 },
  ];
  const texture: Slider[] = [
    { key: "sharpen", label: "锐化", min: -100, max: 100 },
    { key: "clarity", label: "清晰度", min: -100, max: 100 },
    { key: "vignette", label: "晕影", min: -100, max: 100 },
  ];

  // 色温滑杆使用蓝→橙渐变作为 track 背景；色调使用绿→品红——这两条本身已经是颜色提示
  const tintedTrackStyle: Record<string, React.CSSProperties> = {
    temperature: { background: "linear-gradient(to right, #6ea8ff, #f0f0f0 50%, #f5b06a)" },
    tint: { background: "linear-gradient(to right, #9adea0, #f0f0f0 50%, #d29bdf)" },
  };

  // 普通滑杆：从 0 点（百分比 50%）向当前值方向把 track 染上深色，剩余部分保持浅灰
  const buildFillBackground = (value: number, min: number, max: number) => {
    const TRACK = "#e3e5e9";
    const FILL = "#1d1f23";
    const valuePct = ((value - min) / (max - min)) * 100;
    if (min < 0 && max > 0) {
      const zeroPct = ((0 - min) / (max - min)) * 100; // 通常 50
      const a = Math.min(zeroPct, valuePct);
      const b = Math.max(zeroPct, valuePct);
      return `linear-gradient(to right, ${TRACK} 0, ${TRACK} ${a}%, ${FILL} ${a}%, ${FILL} ${b}%, ${TRACK} ${b}%, ${TRACK} 100%)`;
    }
    // 单向（min=0 或 max=0）：从起点填到当前值
    return `linear-gradient(to right, ${FILL} 0, ${FILL} ${valuePct}%, ${TRACK} ${valuePct}%, ${TRACK} 100%)`;
  };

  const renderSlider = (s: Slider) => {
    const value = adjust[s.key] as number;
    const tinted = tintedTrackStyle[s.key as string];
    const trackBg = tinted ?? { background: buildFillBackground(value, s.min, s.max) };
    return (
      <div className="image-adjust-row" key={s.key}>
        <div className="image-adjust-row-label">{s.label}</div>
        <div className="image-adjust-row-control">
          <input
            type="range"
            className={tinted ? "image-adjust-range tinted" : "image-adjust-range"}
            style={trackBg}
            min={s.min}
            max={s.max}
            step={s.step ?? 1}
            value={value}
            onChange={(e) => set(s.key, Number(e.target.value) as ImageAdjust[typeof s.key])}
          />
          <input
            className="image-adjust-number"
            type="number"
            min={s.min}
            max={s.max}
            value={value}
            onChange={(e) => {
              const raw = e.target.value === "" ? 0 : Number(e.target.value);
              const clamped = Math.max(s.min, Math.min(s.max, raw || 0));
              set(s.key, clamped as ImageAdjust[typeof s.key]);
            }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="stroke-picker" ref={ref}>
      <button
        type="button"
        className="icon-only tooltip-host"
        data-tooltip="调整"
        aria-label="调整"
        onClick={() => setOpen((value) => !value)}
      >
        <SlidersHorizontal size={17} />
      </button>
      {open && (
        <div className="popover image-adjust-popover">
          <div className="image-adjust-section">
            <div className="image-adjust-section-title"><Lightbulb size={15} /><span>白平衡</span></div>
            {wb.map(renderSlider)}
          </div>
          <div className="image-adjust-section">
            <div className="image-adjust-section-title"><Sun size={15} /><span>光线</span></div>
            {light.map(renderSlider)}
          </div>
          <div className="image-adjust-section">
            <div className="image-adjust-section-title">
              <Droplet size={15} /><span>颜色</span>
              <label className="image-adjust-invert">
                <span>反色</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={adjust.invert}
                  className={`image-adjust-switch ${adjust.invert ? "on" : ""}`}
                  onClick={() => set("invert", !adjust.invert)}
                >
                  <span className="image-adjust-switch-knob" />
                </button>
              </label>
            </div>
            {color.map(renderSlider)}
          </div>
          <div className="image-adjust-section">
            <div className="image-adjust-section-title"><Waves size={15} /><span>纹理</span></div>
            {texture.map(renderSlider)}
          </div>
          <div className="image-adjust-divider" />
          <button
            type="button"
            className="image-adjust-reset"
            disabled={!isAdjustActive(adjust)}
            onClick={() => onUpdate({ ...DEFAULT_IMAGE_ADJUST })}
          >
            重置调整
          </button>
        </div>
      )}
    </div>
  );
}

/* 与图标尺寸保持一致（17px），路径是一个左上角圆弧——直观表达"圆角" */
function CornerRadiusIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20 V11 a7 7 0 0 1 7 -7 H20" />
    </svg>
  );
}

function ImageRadiusButton({ value, onUpdate }: { value: number; onUpdate: (radius: number) => void }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  useClickOutside([ref], open, React.useCallback(() => setOpen(false), []));

  // 与调整面板共享填充背景算法（0 起点向当前值方向染色）
  const trackBg = (() => {
    const TRACK = "#e3e5e9";
    const FILL = "#1d1f23";
    const pct = (value / 50) * 100;
    return `linear-gradient(to right, ${FILL} 0, ${FILL} ${pct}%, ${TRACK} ${pct}%, ${TRACK} 100%)`;
  })();

  return (
    <div className="stroke-picker" ref={ref}>
      <button
        type="button"
        className="icon-only tooltip-host"
        data-tooltip="圆角"
        aria-label="圆角"
        onClick={() => setOpen((o) => !o)}
      >
        <CornerRadiusIcon />
      </button>
      {open && (
        <div className="popover image-adjust-popover image-radius-popover">
          <div className="image-adjust-section">
            <div className="image-adjust-row">
              <div className="image-adjust-row-label">圆角</div>
              <div className="image-adjust-row-control">
                <input
                  type="range"
                  className="image-adjust-range"
                  style={{ background: trackBg }}
                  min={0}
                  max={50}
                  step={1}
                  value={value}
                  onChange={(e) => onUpdate(Number(e.target.value))}
                />
                <input
                  className="image-adjust-number"
                  type="number"
                  min={0}
                  max={50}
                  value={value}
                  onChange={(e) => {
                    const raw = e.target.value === "" ? 0 : Number(e.target.value);
                    onUpdate(Math.max(0, Math.min(50, raw || 0)));
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CropButton({
  active,
  aspect,
  beginCrop,
  setAspect,
  finish,
  cancel,
  reset,
}: {
  active: boolean;
  aspect: number | null;        // 当前锁定比例
  beginCrop: () => void;
  setAspect: (aspect: number | null) => void;
  finish: () => void;
  cancel: () => void;
  reset: () => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  // 面板与裁剪状态绑定：active=true 时面板始终展开
  // 取消/完成/失活时关闭。点击外部不关（避免误关裁剪）。
  type Option =
    | { kind: "free" }
    | { kind: "ratio"; label: string; value: number };
  const options: Option[] = [
    { kind: "free" },
    { kind: "ratio", label: "1:1", value: 1 },
    { kind: "ratio", label: "16:9", value: 16 / 9 },
    { kind: "ratio", label: "9:16", value: 9 / 16 },
    { kind: "ratio", label: "4:3", value: 4 / 3 },
    { kind: "ratio", label: "3:4", value: 3 / 4 },
    { kind: "ratio", label: "3:2", value: 3 / 2 },
    { kind: "ratio", label: "2:3", value: 2 / 3 },
  ];

  const isActiveOption = (o: Option) => {
    if (o.kind === "free") return aspect === null;
    if (aspect === null) return false;
    return Math.abs(aspect - o.value) < 0.001;
  };

  // 横向滚动容器：3 张卡片可见，其余左右滑动查看
  const trackRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  const updateScrollState = React.useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  React.useEffect(() => {
    if (!active) return;
    // 面板打开后 layout 可能还没完成，clientWidth/scrollWidth 拿到 0 会导致 canScrollRight
    // 被错误地置为 false。用 ResizeObserver 监听容器尺寸变化，确保拿到真实尺寸时再更新一次。
    const raf = requestAnimationFrame(updateScrollState);
    const el = trackRef.current;
    if (!el) return () => cancelAnimationFrame(raf);
    el.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);
    const ro = new ResizeObserver(() => updateScrollState());
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
      ro.disconnect();
    };
  }, [active, updateScrollState]);

  const scrollByPage = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    // 一次滚一张卡片的距离（容器宽度的 1/3 + gap），保持卡片对齐
    const step = el.clientWidth / 3;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  return (
    <div className="stroke-picker" ref={ref}>
      <button
        type="button"
        className={`icon-only tooltip-host ${active ? "active" : ""}`}
        data-tooltip="裁剪"
        aria-label="裁剪"
        onClick={() => {
          if (!active) beginCrop();
        }}
      >
        <Crop size={17} />
      </button>
      {active && (
        <div className="popover crop-panel-popover">
          <div className="crop-panel-header">
            <div className="crop-panel-title">长宽比</div>
          </div>
          <div className="crop-panel-cards-wrap">
            <div className="crop-panel-cards" ref={trackRef}>
              {options.map((o, i) => (
                <button
                  key={i}
                  type="button"
                  className={`crop-panel-card ${isActiveOption(o) ? "active" : ""}`}
                  onClick={() => setAspect(o.kind === "free" ? null : o.value)}
                >
                  <div className="crop-panel-card-icon">
                    {o.kind === "free" ? <FreeCropIcon /> : <RatioRectIcon ratio={o.value} />}
                  </div>
                  <div className="crop-panel-card-label">
                    {o.kind === "free" ? "自由裁剪" : o.label}
                  </div>
                </button>
              ))}
            </div>
            {canScrollLeft && (
              <button
                type="button"
                className="crop-panel-arrow crop-panel-arrow-left"
                aria-label="向左滚动"
                onClick={() => scrollByPage(-1)}
              >
                <ChevronLeft size={18} />
              </button>
            )}
            {canScrollRight && (
              <button
                type="button"
                className="crop-panel-arrow crop-panel-arrow-right"
                aria-label="向右滚动"
                onClick={() => scrollByPage(1)}
              >
                <ChevronRight size={18} />
              </button>
            )}
          </div>
          <div className="crop-panel-actions">
            <button
              type="button"
              className="crop-panel-btn crop-panel-btn-reset tooltip-host"
              data-tooltip="重置裁剪框"
              aria-label="重置裁剪框"
              onClick={reset}
            >
              <RotateCcw size={15} />
            </button>
            <div className="crop-panel-actions-spacer" />
            <button type="button" className="crop-panel-btn" onClick={cancel}>取消</button>
            <button type="button" className="crop-panel-btn primary" onClick={finish}>完成</button>
          </div>
        </div>
      )}
    </div>
  );
}

// 自由裁剪卡片图标：4 角"取景框"
function FreeCropIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 13 V8 a2 2 0 0 1 2 -2 H13" />
      <path d="M30 13 V8 a2 2 0 0 0 -2 -2 H23" />
      <path d="M6 23 V28 a2 2 0 0 0 2 2 H13" />
      <path d="M30 23 V28 a2 2 0 0 1 -2 2 H23" />
    </svg>
  );
}

// 比例示意：圆角矩形按 ratio 决定外观比例
function RatioRectIcon({ ratio }: { ratio: number }) {
  const BOX = 26;
  let w = BOX;
  let h = BOX;
  if (ratio >= 1) h = BOX / ratio;
  else w = BOX * ratio;
  const x = (36 - w) / 2;
  const y = (36 - h) / 2;
  return (
    <svg width="32" height="32" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x={x} y={y} width={w} height={h} rx="3" ry="3" />
    </svg>
  );
}

function TextSettingsButton({ letterSpacing, lineHeight, onUpdate }: { letterSpacing: number; lineHeight: number; onUpdate: (patch: Partial<Pick<TextLayer, "letterSpacing" | "lineHeight">>) => void }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  useClickOutside([ref], open, React.useCallback(() => setOpen(false), []));
  return (
    <div className="stroke-picker" ref={ref}>
      <button
        type="button"
        className="icon-only tooltip-host"
        data-tooltip="文字设置"
        aria-label="文字设置"
        onClick={() => setOpen((value) => !value)}
      >
        <Settings size={17} />
      </button>
      {open && (
        <div className="popover text-settings-popover">
          <div className="brush-settings-group">
            <div className="brush-settings-label">字间距</div>
            <div className="brush-settings-row">
              <input type="range" min="-5" max="30" step="1" value={letterSpacing} onChange={(event) => onUpdate({ letterSpacing: Number(event.target.value) })} />
              <input type="text" inputMode="numeric" value={letterSpacing} onChange={(event) => {
                const value = event.target.value.replace(/[^0-9-]/g, "");
                onUpdate({ letterSpacing: Math.max(-5, Math.min(30, Number(value) || 0)) });
              }} />
            </div>
          </div>
          <div className="brush-settings-group">
            <div className="brush-settings-label">行间距</div>
            <div className="brush-settings-row">
              <input type="range" min="0.8" max="3" step="0.05" value={lineHeight} onChange={(event) => onUpdate({ lineHeight: Number(event.target.value) })} />
              <input type="text" inputMode="decimal" value={lineHeight.toFixed(2).replace(/\.?0+$/, "")} onChange={(event) => {
                const value = event.target.value.replace(/[^0-9.]/g, "");
                onUpdate({ lineHeight: Math.max(0.8, Math.min(3, Number(value) || 1.1)) });
              }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PropertyBar(props: {
  selected: Layer | null;
  updateSelected: (patch: Partial<Layer>) => void;
  duplicateLayer: (id: string) => void;
  deleteLayer: (id: string) => void;
  moveLayerOrder: (id: string, direction: "up" | "down" | "top" | "bottom") => void;
  resetLayer: (id: string) => void;
  showToast: (message: string) => void;
  beginCutout: () => void;
  cutoutProcessing: boolean;
  cropping: { layerId: string; aspect: number | null } | null;
  beginCrop: () => void;
  setCropAspect: (aspect: number | null) => void;
  finishCrop: () => void;
  cancelCrop: () => void;
  resetCrop: () => void;
}) {
  const { selected } = props;
  if (!selected) return null;
  const common = (
    <>
      <IconButton label="重置位置" onClick={() => props.resetLayer(selected.id)}><RotateCcw size={17} /></IconButton>
      <IconButton label="移到顶层" onClick={() => props.moveLayerOrder(selected.id, "top")}><MoveUp size={17} /></IconButton>
      <IconButton label="移到底层" onClick={() => props.moveLayerOrder(selected.id, "bottom")}><MoveDown size={17} /></IconButton>
      <IconButton label="复制" onClick={() => props.duplicateLayer(selected.id)}><Copy size={17} /></IconButton>
      <IconButton label="删除" onClick={() => props.deleteLayer(selected.id)}><Trash2 size={17} /></IconButton>
    </>
  );
  return (
    <div className="property-bar">
      {common}
      {selected.type === "image" && (
        <>
          <IconButton label="抠图" active={props.cutoutProcessing} onClick={props.beginCutout}><WandSparkles size={17} /></IconButton>
          <ImageAdjustButton
            adjust={selected.adjust ?? DEFAULT_IMAGE_ADJUST}
            onUpdate={(next) => props.updateSelected({ adjust: next } as Partial<Layer>)}
          />
          <ImageRadiusButton
            value={selected.cornerRadius ?? 0}
            onUpdate={(radius) => props.updateSelected({ cornerRadius: radius } as Partial<Layer>)}
          />
          <CropButton
            active={!!props.cropping && props.cropping.layerId === selected.id}
            aspect={props.cropping?.aspect ?? null}
            beginCrop={props.beginCrop}
            setAspect={props.setCropAspect}
            finish={props.finishCrop}
            cancel={props.cancelCrop}
            reset={props.resetCrop}
          />
          <IconButton label="水平翻转" onClick={() => props.updateSelected({ flipX: !selected.flipX })}><FlipHorizontal size={17} /></IconButton>
          <IconButton label="垂直翻转" onClick={() => props.updateSelected({ flipY: !selected.flipY })}><FlipVertical size={17} /></IconButton>
        </>
      )}
      {selected.type === "shape" && (
        <>
          <ShapeFillButton
            color={selected.noFill ? "transparent" : selected.fill}
            noFill={!!selected.noFill}
            onColorChange={(hex) => props.updateSelected({ fill: hex, noFill: false })}
            onNoFill={() => props.updateSelected({ noFill: true })}
            opacity={selected.opacity}
            onOpacityChange={(value) => props.updateSelected({ opacity: value })}
          />
          <ShapeStrokeButton
            stroke={selected.stroke}
            strokeWidth={selected.strokeWidth}
            strokeStyle={selected.strokeStyle}
            opacity={selected.opacity}
            onUpdate={(patch) => props.updateSelected(patch as Partial<Layer>)}
          />
        </>
      )}
      {(selected.type === "line" || selected.type === "curve") && (
        <>
          <PropertyColorButton color={selected.color} onChange={(hex) => props.updateSelected({ color: hex })} opacity={selected.opacity} onOpacityChange={(value) => props.updateSelected({ opacity: value })} />
          <LineStyleButton strokeStyle={selected.strokeStyle} strokeWidth={selected.strokeWidth} onUpdate={(patch) => props.updateSelected(patch as Partial<Layer>)} />
          <LineCapButton type="start" value={selected.startCap ?? "none"} onChange={(v) => props.updateSelected({ startCap: v } as Partial<Layer>)} />
          <LineCapSwapButton onClick={() => props.updateSelected({ startCap: selected.endCap ?? "none", endCap: selected.startCap ?? "none" } as Partial<Layer>)} />
          <LineCapButton type="end" value={selected.endCap ?? "none"} onChange={(v) => props.updateSelected({ endCap: v } as Partial<Layer>)} />
        </>
      )}
      {selected.type === "brush" && (
        <PropertyColorButton color={selected.color} onChange={(hex) => props.updateSelected({ color: hex })} opacity={selected.opacity} onOpacityChange={(value) => props.updateSelected({ opacity: value })} />
      )}
      {selected.type === "text" && (
        <>
          <PropertyColorButton color={selected.color} onChange={(hex) => props.updateSelected({ color: hex })} opacity={selected.opacity} onOpacityChange={(value) => props.updateSelected({ opacity: value })} />
          <span className="tooltip-host control-tooltip-wrap" data-tooltip="字体">
            <select aria-label="字体" value={selected.fontFamily} onChange={(e) => props.updateSelected({ fontFamily: e.target.value })}><option value="Inter, system-ui, sans-serif">Inter</option><option value="Georgia, serif">Georgia</option><option value="'Courier New', monospace">Courier</option></select>
          </span>
          <span className="tooltip-host control-tooltip-wrap" data-tooltip="字号">
            <input className="font-size-input" aria-label="字号" type="number" min="8" max="120" value={selected.fontSize} onChange={(e) => props.updateSelected({ fontSize: Number(e.target.value) })} />
          </span>
          <IconButton label="加粗" active={selected.bold} onClick={() => props.updateSelected({ bold: !selected.bold })}><Bold size={17} /></IconButton>
          <IconButton label="斜体" active={selected.italic} onClick={() => props.updateSelected({ italic: !selected.italic })}><Italic size={17} /></IconButton>
          <IconButton label="下划线" active={selected.underline} onClick={() => props.updateSelected({ underline: !selected.underline })}><Underline size={17} /></IconButton>
          <IconButton label="删除线" active={selected.strike} onClick={() => props.updateSelected({ strike: !selected.strike })}><StrikeIcon /></IconButton>
          <IconButton
            label={selected.align === "left" ? "左对齐" : selected.align === "center" ? "居中对齐" : "右对齐"}
            onClick={() => props.updateSelected({ align: selected.align === "left" ? "center" : selected.align === "center" ? "right" : "left" })}
          >
            <AlignCycleIcon align={selected.align} />
          </IconButton>
          <TextSettingsButton
            letterSpacing={selected.letterSpacing ?? 0}
            lineHeight={selected.lineHeight ?? 1.1}
            onUpdate={(patch) => props.updateSelected(patch as Partial<Layer>)}
          />
        </>
      )}
    </div>
  );
}

function ToolButton({ children, label, active, disabled, onClick }: React.PropsWithChildren<{ label: string; active?: boolean; disabled?: boolean; onClick?: () => void }>) {
  return <button className={`tool-button tooltip-host ${active ? "active" : ""}`} data-tooltip={label} aria-label={label} disabled={disabled} onClick={onClick}>{children}</button>;
}

function IconButton({ children, label, active, onClick }: React.PropsWithChildren<{ label: string; active?: boolean; onClick?: () => void }>) {
  return <button className={`icon-only tooltip-host ${active ? "active" : ""}`} data-tooltip={label} aria-label={label} onClick={onClick}>{children}</button>;
}

function RotateHandle({ layer, state, zoom, setActiveDrag, isRotating, hideBadge = false, getRotateCenter }: { layer: Layer; state: EditorState; zoom: number; setActiveDrag: React.Dispatch<React.SetStateAction<any>>; isRotating: boolean; hideBadge?: boolean; getRotateCenter?: () => { x: number; y: number } | null }) {
  const angle = normalizeAngle(layer.rotation ?? 0);
  // 反向抵消父层 rotate + flip，保证图标始终保持初始姿态
  const sx = layer.flipX ? -1 : 1;
  const sy = layer.flipY ? -1 : 1;
  const uprightStyle: React.CSSProperties = {
    transform: `translateY(-50%) scale(${sx}, ${sy}) rotate(${-angle}deg)`,
    // 当父层水平翻转后按钮的视觉位置会镜像到左侧；反向覆盖 left/right 让按钮始终在视觉右侧
    ...(layer.flipX ? { left: -46, right: "auto" as const } : null),
  };
  const angleRad = (angle * Math.PI) / 180;
  const visualHalfWidth = (Math.abs(layer.width * Math.cos(angleRad)) + Math.abs(layer.height * Math.sin(angleRad))) / 2;
  const badgeDistance = visualHalfWidth + 42;
  const badgeStyle: React.CSSProperties = {
    left: `calc(50% + ${Math.cos(angleRad) * badgeDistance}px)`,
    top: `calc(50% + ${-Math.sin(angleRad) * badgeDistance}px)`,
    transform: `translate(-50%, -50%) scale(${sx}, ${sy}) rotate(${-angle}deg)`,
  };
  // 旋转中：隐藏旋转按钮，在按钮原位显示度数；非旋转中：显示按钮
  // hideBadge 仅用作"完全不显示"的旧选项，留作向后兼容
  return (
    <>
      {!isRotating && (
        <button
          type="button"
          className="rotate-handle"
          style={uprightStyle}
          aria-label="旋转"
          onPointerDown={(event) => {
            event.stopPropagation();
            let centerX: number;
            let centerY: number;
            if (getRotateCenter) {
              const p = getRotateCenter();
              if (!p) return;
              centerX = p.x;
              centerY = p.y;
            } else {
              const targetEl = event.currentTarget.closest(".brush-selection") ?? event.currentTarget.closest(".layer");
              const rect = targetEl?.getBoundingClientRect();
              if (!rect) return;
              centerX = rect.left + rect.width / 2;
              centerY = rect.top + rect.height / 2;
            }
            const startAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX) * (180 / Math.PI);
            setActiveDrag({
              type: "rotate",
              id: layer.id,
              startX: event.clientX,
              startY: event.clientY,
              centerX,
              centerY,
              startAngle,
              baseRotation: layer.rotation ?? 0,
              zoom,
              base: state
            });
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M17.8 5.7A7.2 7.2 0 0 0 5.4 9" />
            <polyline points="17.8 2.8 17.8 5.8 14.8 5.8" />
            <path d="M6.2 18.3A7.2 7.2 0 0 0 18.6 15" />
            <polyline points="6.2 21.2 6.2 18.2 9.2 18.2" />
          </svg>
        </button>
      )}
      {isRotating && !hideBadge && <div className="rotation-badge" style={badgeStyle}>{angle}°</div>}
    </>
  );
}

function BrushSelectionOverlay({ layer, state, zoom, setActiveDrag, isRotating }: { layer: BrushLayer; state: EditorState; zoom: number; setActiveDrag: React.Dispatch<React.SetStateAction<any>>; isRotating: boolean }) {
  const bbox = brushBoundingBox(layer);
  if (bbox.width <= 0 || bbox.height <= 0) return null;
  const handles = ["tl", "tr", "bl", "br", "t", "b", "l", "r"];
  return (
    <div
      className="brush-selection"
      style={{ left: bbox.x, top: bbox.y, width: bbox.width, height: bbox.height }}
      onPointerDown={(event) => {
        event.stopPropagation();
        setActiveDrag({ type: "move", id: layer.id, startX: event.clientX, startY: event.clientY, zoom, base: state });
      }}
    >
      {handles.map((corner) => (
        <span
          key={corner}
          className={`resize-handle ${corner}`}
          onPointerDown={(event) => {
            event.stopPropagation();
            setActiveDrag({ type: "scale", id: layer.id, corner, startX: event.clientX, startY: event.clientY, zoom, base: state });
          }}
        />
      ))}
      <RotateHandle layer={layer} state={state} zoom={zoom} setActiveDrag={setActiveDrag} isRotating={isRotating} />
    </div>
  );
}

function LinePointHandles({ layer, state, zoom, setActiveDrag }: { layer: LineLayer; state: EditorState; zoom: number; setActiveDrag: React.Dispatch<React.SetStateAction<any>> }) {
  const dotSize = Math.max(12, layer.strokeWidth + 4);
  const pts = layer.points;
  // 装饰外延距离
  const capOffset = layer.strokeWidth * 2.5 * 0.7;
  return (
    <>
      {pts.map((point, index) => {
        let displayX = point.x;
        let displayY = point.y;
        if (layer.type === "curve" && index === 1 && pts.length === 3) {
          const p0 = pts[0];
          const p1 = pts[1];
          const p2 = pts[2];
          displayX = 0.25 * p0.x + 0.5 * p1.x + 0.25 * p2.x;
          displayY = 0.25 * p0.y + 0.5 * p1.y + 0.25 * p2.y;
        } else if (index === 0 && layer.startCap && layer.startCap !== "none") {
          // 起点圆点偏移到装饰外端
          const angle = Math.atan2(point.y - pts[1].y, point.x - pts[1].x);
          displayX = point.x + Math.cos(angle) * capOffset;
          displayY = point.y + Math.sin(angle) * capOffset;
        } else if (index === pts.length - 1 && layer.endCap && layer.endCap !== "none") {
          // 终点圆点偏移到装饰外端
          const angle = Math.atan2(point.y - pts[pts.length - 2].y, point.x - pts[pts.length - 2].x);
          displayX = point.x + Math.cos(angle) * capOffset;
          displayY = point.y + Math.sin(angle) * capOffset;
        }
        return <span key={index} className="line-point" style={{ left: displayX, top: displayY, width: dotSize, height: dotSize }} onPointerDown={(event) => { event.stopPropagation(); setActiveDrag({ type: "linePoint", id: layer.id, pointIndex: index, startX: event.clientX, startY: event.clientY, zoom, base: state }); }} />;
      })}
    </>
  );
}

function SelectionHandles({ layer, state, zoom, setActiveDrag, isRotating, scaleType = "scale", getScaleAnchor, hideBadge = false, getRotateCenter }: { layer: Layer; state: EditorState; zoom: number; setActiveDrag: React.Dispatch<React.SetStateAction<any>>; isRotating: boolean; scaleType?: "scale" | "imageScale" | "imageBox"; getScaleAnchor?: () => { x: number; y: number } | null; hideBadge?: boolean; getRotateCenter?: () => { x: number; y: number } | null }) {
  const handles = ["tl", "tr", "bl", "br", "t", "b", "l", "r"];
  return (
    <>
      {handles.map((corner) => <span key={corner} className={`resize-handle ${corner}`} onPointerDown={(event) => {
        event.stopPropagation();
        // imageScale/imageBox 模式都需要锚点（裁剪框中心的画布像素坐标）—— imageScale 用于按距离比例缩放；
        // imageBox 用于反旋转鼠标位移到图片局部坐标系
        let centerX: number | undefined;
        let centerY: number | undefined;
        if ((scaleType === "imageScale" || scaleType === "imageBox") && getScaleAnchor) {
          const p = getScaleAnchor();
          if (p) { centerX = p.x; centerY = p.y; }
        }
        setActiveDrag({ type: scaleType, id: layer.id, corner, startX: event.clientX, startY: event.clientY, centerX, centerY, zoom, base: state });
      }} />)}
      <RotateHandle layer={layer} state={state} zoom={zoom} setActiveDrag={setActiveDrag} isRotating={isRotating} hideBadge={hideBadge} getRotateCenter={getRotateCenter} />
    </>
  );
}

// ===== 裁剪覆盖层：在选中的图片图层上画裁剪框（8 手柄 + 中心拖动） =====
function CropOverlay({
  layer,
  rect,
  aspect,
  zoom,
  onChange,
  onShadePointerDown,
}: {
  layer: ImageLayer;
  rect: { x: number; y: number; w: number; h: number };
  aspect: number | null; // null = 自由
  zoom: number;
  onChange: (rect: { x: number; y: number; w: number; h: number }) => void;
  // shade 区域被点中 —— 由父级决定行为：判断是否在裁剪图层视觉范围内、做命中检测、决定取消裁剪/切换选中
  onShadePointerDown?: (event: React.PointerEvent) => void;
}) {
  // 当前图层在画布中的像素尺寸（不考虑画布缩放，layer.width/height 已是画布坐标）
  const W = layer.width;
  const H = layer.height;
  // rect 用相对图层框的 0..1，渲染时转 px
  const px = rect.x * W;
  const py = rect.y * H;
  const pw = rect.w * W;
  const ph = rect.h * H;

  // 锁定 aspect 时，rect 的宽高比 = aspect / layerAspect（详见 setCropAspect 推导）
  const layerAspect = W / H;
  const targetRectAspect = aspect == null ? null : aspect / layerAspect;
  const MIN_PX = 12; // 最小裁剪框像素尺寸

  type Mode = "move" | "tl" | "tr" | "bl" | "br" | "t" | "b" | "l" | "r";

  const beginDrag = (mode: Mode, e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const startX = e.clientX;
    const startY = e.clientY;
    const start = { ...rect };
    const minRel = MIN_PX / Math.min(W, H);

    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / (zoom * W); // 0..1 相对量
      const dy = (ev.clientY - startY) / (zoom * H);
      let { x, y, w, h } = start;

      if (mode === "move") {
        x = Math.max(0, Math.min(1 - w, start.x + dx));
        y = Math.max(0, Math.min(1 - h, start.y + dy));
      } else {
        // 左右上下边的目标 in [0,1]
        let l = start.x;
        let t = start.y;
        let r = start.x + start.w;
        let b = start.y + start.h;
        if (mode === "l" || mode === "tl" || mode === "bl") l = Math.max(0, Math.min(r - minRel, start.x + dx));
        if (mode === "r" || mode === "tr" || mode === "br") r = Math.min(1, Math.max(l + minRel, start.x + start.w + dx));
        if (mode === "t" || mode === "tl" || mode === "tr") t = Math.max(0, Math.min(b - minRel, start.y + dy));
        if (mode === "b" || mode === "bl" || mode === "br") b = Math.min(1, Math.max(t + minRel, start.y + start.h + dy));
        x = l; y = t; w = r - l; h = b - t;

        // 锁定比例时按主拖动轴推算另一轴；以拖动后的 w/h 之中"较大变化"那一轴为主
        if (targetRectAspect != null) {
          // 主轴：哪边在拖动
          const isCorner = mode.length === 2;
          const isHorzEdge = mode === "l" || mode === "r";
          const isVertEdge = mode === "t" || mode === "b";
          // 用主轴决定 w 或 h，再算出另一边
          let aw = w, ah = h;
          if (isCorner) {
            // 取变化比例最大的那一个为主轴
            const dw = Math.abs(aw - start.w);
            const dh = Math.abs(ah - start.h);
            if (dw >= dh * targetRectAspect) ah = aw / targetRectAspect;
            else aw = ah * targetRectAspect;
          } else if (isHorzEdge) {
            ah = aw / targetRectAspect;
          } else if (isVertEdge) {
            aw = ah * targetRectAspect;
          }
          // 锚点：拖动相反的那一边/角保持不动
          let anchorX = mode === "l" || mode === "tl" || mode === "bl" ? start.x + start.w : start.x;
          let anchorY = mode === "t" || mode === "tl" || mode === "tr" ? start.y + start.h : start.y;
          if (isVertEdge) anchorX = start.x + start.w / 2; // 上/下边水平居中
          if (isHorzEdge) anchorY = start.y + start.h / 2; // 左/右边垂直居中
          let nx = (mode === "l" || mode === "tl" || mode === "bl") ? anchorX - aw
                  : (mode === "t" || mode === "b") ? anchorX - aw / 2
                  : anchorX;
          let ny = (mode === "t" || mode === "tl" || mode === "tr") ? anchorY - ah
                  : (mode === "l" || mode === "r") ? anchorY - ah / 2
                  : anchorY;
          // 越界处理：等比例收缩到边界内
          const overL = nx < 0 ? -nx : 0;
          const overR = nx + aw > 1 ? nx + aw - 1 : 0;
          const overT = ny < 0 ? -ny : 0;
          const overB = ny + ah > 1 ? ny + ah - 1 : 0;
          const overMax = Math.max(overL, overR, overT, overB);
          if (overMax > 0) {
            const shrink = 1 - Math.max(overL + overR, (overT + overB) * targetRectAspect);
            // 简化：直接 clamp
          }
          nx = Math.max(0, Math.min(1 - aw, nx));
          ny = Math.max(0, Math.min(1 - ah, ny));
          // 若仍越界（aw/ah > 1），保持当前 w,h 不变
          if (aw <= 1 && ah <= 1) {
            x = nx; y = ny; w = aw; h = ah;
          }
        }
      }
      onChange({ x, y, w, h });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // 4 块暗色蒙版用一个很大的延伸范围 —— 旋转图片时图片会溢出 layer 框，
  // 这样无论原图旋转后跑到哪里，框外区域都被暗化（视觉上"裁剪框内亮、框外暗"）。
  const FAR = 9999;
  return (
    <div className="crop-overlay" style={{ left: 0, top: 0, width: W, height: H }}>
      {/* 暗化非裁剪区：用 4 个矩形覆盖框外，向四周延伸到很远
          点击 shade 转发给父级 onShadePointerDown 决定后续动作（hit-test / 取消裁剪 / 切换选中） */}
      <div className="crop-shade" style={{ left: -FAR, top: -FAR, width: W + FAR * 2, height: py + FAR }} onPointerDown={onShadePointerDown} />
      <div className="crop-shade" style={{ left: -FAR, top: py + ph, width: W + FAR * 2, height: H - py - ph + FAR }} onPointerDown={onShadePointerDown} />
      <div className="crop-shade" style={{ left: -FAR, top: py, width: px + FAR, height: ph }} onPointerDown={onShadePointerDown} />
      <div className="crop-shade" style={{ left: px + pw, top: py, width: W - px - pw + FAR, height: ph }} onPointerDown={onShadePointerDown} />
      {/* 裁剪框（中心可拖动） */}
      <div
        className="crop-frame"
        style={{ left: px, top: py, width: pw, height: ph }}
        onPointerDown={(e) => beginDrag("move", e)}
      >
        {/* 三等分参考线 */}
        <div className="crop-grid crop-grid-v" style={{ left: "33.33%" }} />
        <div className="crop-grid crop-grid-v" style={{ left: "66.66%" }} />
        <div className="crop-grid crop-grid-h" style={{ top: "33.33%" }} />
        <div className="crop-grid crop-grid-h" style={{ top: "66.66%" }} />
        {/* 8 个手柄 */}
        {(["tl","tr","bl","br","t","b","l","r"] as Mode[]).map((m) => (
          <span
            key={m}
            className={`crop-handle crop-handle-${m}`}
            onPointerDown={(e) => beginDrag(m, e)}
          />
        ))}
      </div>
    </div>
  );
}

function LayerThumb({ layer, background }: { layer: Layer; background: string }) {
  if (layer.type === "image") {
    return <div className="layer-thumb" style={{ background }}><img src={layer.src} alt="" /></div>;
  }
  if (layer.type === "text") {
    return (
      <div className="layer-thumb" style={{ background }}>
        <span className="layer-thumb-text" style={{ color: layer.color, fontFamily: layer.fontFamily, fontWeight: layer.bold ? 800 : 500, fontStyle: layer.italic ? "italic" : "normal" }}>
          {(layer.text || "T").trim().slice(0, 1) || "T"}
        </span>
      </div>
    );
  }
  if (layer.type === "shape") {
    return <div className="layer-thumb" style={{ background }}><ShapeView layer={layer} /></div>;
  }
  if (layer.type === "line" || layer.type === "curve") {
    return <div className="layer-thumb" style={{ background }}><LineView layer={layer} /></div>;
  }
  if (layer.type === "brush") {
    const bbox = brushBoundingBox(layer);
    if (bbox.width <= 0 || bbox.height <= 0) {
      return <div className="layer-thumb" style={{ background }} />;
    }
    // 用笔迹的紧致包围盒作为 viewBox，缩略图里看到的是有效笔触
    const pad = layer.strokeWidth / 2;
    return (
      <div className="layer-thumb" style={{ background }}>
        <svg viewBox={`${bbox.x - pad} ${bbox.y - pad} ${bbox.width + pad * 2} ${bbox.height + pad * 2}`}>
          <path d={layer.points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ")} fill="none" stroke={layer.color} strokeWidth={layer.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }
  return <div className="layer-thumb" style={{ background }} />;
}

function ShapeView({ layer }: { layer: ShapeLayer }) {
  const sw = layer.strokeWidth;
  const strokeDasharray = layer.strokeStyle === "dashed" ? "10 8" : layer.strokeStyle === "dotted" ? "2 8" : undefined;
  const common = { fill: layer.noFill ? "transparent" : layer.fill, stroke: layer.strokeStyle === "none" ? "transparent" : layer.stroke, strokeWidth: sw, strokeDasharray };
  const w = layer.width;
  const h = layer.height;
  const half = sw / 2;
  // stroke 向内画：形状边缘缩进半个 strokeWidth，stroke 完全在 viewBox 内
  if (layer.shape === "rect" || layer.shape === "rounded") return <svg viewBox={`0 0 ${w} ${h}`}><rect x={half} y={half} width={w - sw} height={h - sw} rx={layer.shape === "rounded" ? layer.radius : 0} {...common} /></svg>;
  if (layer.shape === "circle") return <svg viewBox={`0 0 ${w} ${h}`}><ellipse cx={w / 2} cy={h / 2} rx={(w - sw) / 2} ry={(h - sw) / 2} {...common} /></svg>;
  const ix = half; // inner offset
  const iy = half;
  const iw = w - sw;
  const ih = h - sw;
  const points: Record<ShapeKind, string> = {
    rect: "",
    rounded: "",
    circle: "",
    triangle: `${w / 2},${iy} ${ix + iw},${iy + ih} ${ix},${iy + ih}`,
    invertedTriangle: `${ix},${iy} ${ix + iw},${iy} ${w / 2},${iy + ih}`,
    diamond: `${w / 2},${iy} ${ix + iw},${h / 2} ${w / 2},${iy + ih} ${ix},${h / 2}`,
    pentagon: `${w / 2},${iy} ${ix + iw},${iy + ih * 0.38} ${ix + iw * 0.8},${iy + ih} ${ix + iw * 0.2},${iy + ih} ${ix},${iy + ih * 0.38}`
  };
  return <svg viewBox={`0 0 ${w} ${h}`}><polygon points={points[layer.shape]} {...common} /></svg>;
}

function renderLineCap(cap: LineCap | undefined, x: number, y: number, angle: number, sw: number, color: string) {
  if (!cap || cap === "none") return null;
  const size = sw * 2.5;
  const half = size / 2;
  const transform = `translate(${x}, ${y}) rotate(${angle})`;
  // 装饰从端点(0,0)沿正X轴向外延伸
  switch (cap) {
    case "arrow":
      return <polyline points={`0,${half * 0.7} ${half * 0.7},0 0,${-half * 0.7}`} transform={transform} fill="none" stroke={color} strokeWidth={sw * 0.6} strokeLinecap="round" strokeLinejoin="round" />;
    case "arrow-filled":
      return <polygon points={`${half},0 0,${-half * 0.8} 0,${half * 0.8}`} transform={transform} fill={color} stroke="none" />;
    case "circle":
      return <circle cx={half * 0.7} cy={0} r={half * 0.6} transform={transform} fill="none" stroke={color} strokeWidth={sw * 0.5} />;
    case "circle-filled":
      return <circle cx={half * 0.7} cy={0} r={half * 0.6} transform={transform} fill={color} stroke="none" />;
    case "square":
      return <rect x={half * 0.1} y={-half * 0.55} width={half * 1.1} height={half * 1.1} transform={transform} fill="none" stroke={color} strokeWidth={sw * 0.5} />;
    case "square-filled":
      return <rect x={half * 0.1} y={-half * 0.55} width={half * 1.1} height={half * 1.1} transform={transform} fill={color} stroke="none" />;
    case "diamond":
      return <polygon points={`0,0 ${half * 0.7},-${half * 0.7} ${half * 1.4},0 ${half * 0.7},${half * 0.7}`} transform={transform} fill="none" stroke={color} strokeWidth={sw * 0.5} />;
    case "diamond-filled":
      return <polygon points={`0,0 ${half * 0.7},-${half * 0.7} ${half * 1.4},0 ${half * 0.7},${half * 0.7}`} transform={transform} fill={color} stroke="none" />;
    case "bar":
      return <line x1={0} y1={-half * 0.7} x2={0} y2={half * 0.7} transform={transform} stroke={color} strokeWidth={sw * 0.7} strokeLinecap="round" />;
    default: return null;
  }
}

function LineView({ layer }: { layer: LineLayer }) {
  const sw = layer.strokeWidth;
  const dash = layer.strokeStyle === "dashed" ? `${sw * 2} ${sw * 1.5}` : layer.strokeStyle === "dotted" ? `${Math.max(1, sw * 0.3)} ${sw * 1.5}` : undefined;
  // 计算起点和终点的角度
  const pts = layer.points;
  const startPt = pts[0];
  const endPt = pts[pts.length - 1];
  // 起点角度：从第二个点指向起点（装饰朝线条外侧延伸）
  const startAngle = Math.atan2(startPt.y - pts[1].y, startPt.x - pts[1].x) * (180 / Math.PI);
  // 终点角度：从倒数第二个点指向终点（装饰朝线条外侧延伸）
  const endAngle = Math.atan2(endPt.y - pts[pts.length - 2].y, endPt.x - pts[pts.length - 2].x) * (180 / Math.PI);
  return (
    <svg viewBox={`0 0 ${layer.width} ${layer.height}`} style={{ overflow: "visible" }}>
      {layer.type === "line" ? (
        <line x1={pts[0].x} y1={pts[0].y} x2={pts[1].x} y2={pts[1].y} stroke={layer.color} strokeWidth={sw} strokeDasharray={dash} strokeLinecap="round" />
      ) : (
        <path d={`M ${pts[0].x} ${pts[0].y} Q ${pts[1].x} ${pts[1].y} ${pts[2].x} ${pts[2].y}`} fill="none" stroke={layer.color} strokeWidth={sw} strokeDasharray={dash} strokeLinecap="round" />
      )}
      {renderLineCap(layer.startCap, startPt.x, startPt.y, startAngle, sw, layer.color)}
      {renderLineCap(layer.endCap, endPt.x, endPt.y, endAngle, sw, layer.color)}
    </svg>
  );
}

function BrushView({ layer }: { layer: BrushLayer }) {
  if (layer.points.length === 0) return null;
  // 支持多子路径：首点用 M，遇到 p.m=true 也用 M（开新子路径），其它用 L
  // 单点子路径会被 strokeLinecap="round" 渲染成一个圆点 —— 仍可见，符合"还剩一点就显示一点"
  const d = layer.points
    .map((point, index) => `${index === 0 || point.m ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  return <svg viewBox={`0 0 ${layer.width} ${layer.height}`}><path d={d} fill="none" stroke={layer.color} strokeWidth={layer.strokeWidth} strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

const ColorPopover = React.forwardRef<HTMLDivElement, {
  color: string;
  onChange: (hex: string) => void;
  className?: string;
  opacity?: number;
  onOpacityChange?: (value: number) => void;
}>(function ColorPopover(props, ref) {
  const { color, onChange, className, opacity, onOpacityChange } = props;
  const [mode, setMode] = React.useState<"RGB" | "Hex">("Hex");
  const currentHex0 = color.replace("#", "").toUpperCase();
  const [hexDraft, setHexDraft] = React.useState(currentHex0);
  React.useEffect(() => {
    setHexDraft(currentHex0);
  }, [currentHex0]);
  const rgb = hexToRgb(color);
  const baseHsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
  // 保留 hue：当颜色饱和度为 0（灰阶）时 rgbToHsv 会返回 h=0，会丢失用户上次选的色相
  const [hue, setHue] = React.useState(baseHsv.h);
  React.useEffect(() => {
    if (baseHsv.s > 0.0001) setHue(baseHsv.h);
  }, [baseHsv.h, baseHsv.s]);
  const sat = baseHsv.s;
  const val = baseHsv.v;

  const svRef = React.useRef<HTMLDivElement>(null);
  const hueRef = React.useRef<HTMLDivElement>(null);

  const commitHsv = (h: number, s: number, v: number) => {
    const next = hsvToRgb(h, s, v);
    onChange(rgbToHex(next.r, next.g, next.b));
  };

  const handleSvPointer = (event: React.PointerEvent) => {
    const el = svRef.current;
    if (!el) return;
    el.setPointerCapture(event.pointerId);
    const rect = el.getBoundingClientRect();
    const update = (clientX: number, clientY: number) => {
      const s = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const v = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      commitHsv(hue, s, v);
    };
    update(event.clientX, event.clientY);
    const onMove = (e: PointerEvent) => update(e.clientX, e.clientY);
    const onUp = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
  };

  const handleHuePointer = (event: React.PointerEvent) => {
    const el = hueRef.current;
    if (!el) return;
    el.setPointerCapture(event.pointerId);
    const rect = el.getBoundingClientRect();
    const update = (clientX: number) => {
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const h = ratio * 360;
      setHue(h);
      commitHsv(h, sat || 1, val || 1);
    };
    update(event.clientX);
    const onMove = (e: PointerEvent) => update(e.clientX);
    const onUp = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
  };

  const hueColor = (() => {
    const c = hsvToRgb(hue, 1, 1);
    return rgbToHex(c.r, c.g, c.b);
  })();
  const currentHex = color.replace("#", "").toUpperCase();

  return (
    <div ref={ref} className={`color-popover color-popover-stack ${className ?? ""}`}>
      <div
        ref={svRef}
        className="sv-panel"
        style={{ background: hueColor }}
        onPointerDown={handleSvPointer}
      >
        <div className="sv-panel-sat" />
        <div className="sv-panel-val" />
        <span
          className="sv-cursor"
          style={{ left: `${sat * 100}%`, top: `${(1 - val) * 100}%`, background: color }}
        />
      </div>
      <div ref={hueRef} className="hue-bar" onPointerDown={handleHuePointer}>
        <span className="hue-cursor" style={{ left: `${(hue / 360) * 100}%`, background: hueColor }} />
      </div>
      {onOpacityChange !== undefined && opacity !== undefined && (
        <div className="opacity-bar-wrap">
          <input
            type="range"
            className="opacity-bar"
            min="0"
            max="1"
            step="0.01"
            value={opacity}
            onChange={(e) => onOpacityChange(Number(e.target.value))}
          />
        </div>
      )}
      <div className="color-popover-row">
        <select
          value={mode}
          onChange={(event) => {
            setMode(event.target.value as "RGB" | "Hex");
            setHexDraft(currentHex);
          }}
        >
          <option value="Hex">Hex</option>
          <option value="RGB">RGB</option>
        </select>
        {mode === "RGB" ? (
          <div className="rgb-fields">
            {(["r", "g", "b"] as const).map((key) => (
              <input
                key={key}
                aria-label={key.toUpperCase()}
                type="number"
                min="0"
                max="255"
                value={rgb[key]}
                onChange={(event) => {
                  const next = { ...rgb, [key]: clampColor(Number(event.target.value)) };
                  onChange(rgbToHex(next.r, next.g, next.b));
                }}
              />
            ))}
          </div>
        ) : (
          <input
            className="hex-field"
            aria-label="Hex"
            value={hexDraft}
            maxLength={6}
            onChange={(event) => {
              const clean = event.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6).toUpperCase();
              setHexDraft(clean);
              if (clean.length === 6 || clean.length === 3) onChange(`#${clean}`);
            }}
          />
        )}
        {opacity !== undefined && onOpacityChange && (
          <div className="opacity-field">
            <input
              type="text"
              inputMode="numeric"
              value={Math.round(opacity * 100)}
              onChange={(e) => {
                const d = e.target.value.replace(/[^0-9]/g, "");
                onOpacityChange(d === "" ? 0 : Math.max(0, Math.min(100, Number(d))) / 100);
              }}
            />
            <span>%</span>
          </div>
        )}
      </div>
    </div>
  );
});

createRoot(document.getElementById("root")!).render(<App />);
