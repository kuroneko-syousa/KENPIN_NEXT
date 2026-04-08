/* 前処理設定型 + 純粋処理関数 — DOM依存あり（canvas）、副作用なし */

export type PreprocessConfig = {
  resize: number;
  resizeEnabled: boolean;
  grayscale: boolean;
  binarize: boolean;
  binarizeThreshold: number;
  histogramEqualization: boolean;
  edgeEnhance: boolean;
  normalize: boolean;
  removeBlur: boolean;
  crop: boolean;
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
  hue: number;
  saturation: number;
  brightness: number;
  augFlip: boolean;
  augRotate: boolean;
};

export const DEFAULT_CONFIG: PreprocessConfig = {
  resize: 640,
  resizeEnabled: false,
  grayscale: false,
  binarize: false,
  binarizeThreshold: 128,
  histogramEqualization: false,
  edgeEnhance: false,
  normalize: false,
  removeBlur: false,
  crop: false,
  cropX: 0,
  cropY: 0,
  cropW: 100,
  cropH: 100,
  hue: 0,
  saturation: 0,
  brightness: 0,
  augFlip: false,
  augRotate: false,
};

export type PreprocessResult = {
  dataUrl: string;
  srcW: number;
  srcH: number;
  outW: number;
  outH: number;
};

/** Canvas API を使ったピクセル処理（純粋関数・元画像不変） */
export function applyPreprocess(src: string, cfg: PreprocessConfig): Promise<PreprocessResult> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const srcW = img.width;
      const srcH = img.height;

      let sw = img.width;
      let sh = img.height;
      let sx = 0;
      let sy = 0;

      if (cfg.crop) {
        sx = Math.round((cfg.cropX / 100) * img.width);
        sy = Math.round((cfg.cropY / 100) * img.height);
        sw = Math.round((cfg.cropW / 100) * img.width);
        sh = Math.round((cfg.cropH / 100) * img.height);
        sw = Math.max(1, Math.min(sw, img.width - sx));
        sh = Math.max(1, Math.min(sh, img.height - sy));
      }

      const outW = cfg.resizeEnabled ? cfg.resize : sw;
      const outH = cfg.resizeEnabled ? cfg.resize : sh;

      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);

      const imageData = ctx.getImageData(0, 0, outW, outH);
      const d = imageData.data;

      if (cfg.grayscale || cfg.binarize || cfg.histogramEqualization) {
        for (let i = 0; i < d.length; i += 4) {
          const gray = Math.round(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
          d[i] = gray;
          d[i + 1] = gray;
          d[i + 2] = gray;
        }
      }

      if (cfg.binarize) {
        const thr = cfg.binarizeThreshold;
        for (let i = 0; i < d.length; i += 4) {
          const v = d[i] >= thr ? 255 : 0;
          d[i] = v;
          d[i + 1] = v;
          d[i + 2] = v;
        }
      }

      if (cfg.histogramEqualization && !cfg.binarize) {
        const hist = new Array<number>(256).fill(0);
        for (let i = 0; i < d.length; i += 4) hist[d[i]]++;
        const total = outW * outH;
        const cdf = new Array<number>(256).fill(0);
        cdf[0] = hist[0];
        for (let i = 1; i < 256; i++) cdf[i] = cdf[i - 1] + hist[i];
        const cdfMin = cdf.find((v) => v > 0) ?? 0;
        const lut = cdf.map((v) => Math.round(((v - cdfMin) / (total - cdfMin)) * 255));
        for (let i = 0; i < d.length; i += 4) {
          d[i] = lut[d[i]];
          d[i + 1] = lut[d[i + 1]];
          d[i + 2] = lut[d[i + 2]];
        }
      }

      if (cfg.edgeEnhance) {
        const w = outW;
        const h = outH;
        const src2 = new Uint8ClampedArray(d);
        const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            for (let c = 0; c < 3; c++) {
              let val = 0;
              for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                  val +=
                    src2[((y + ky) * w + (x + kx)) * 4 + c] *
                    kernel[(ky + 1) * 3 + (kx + 1)];
                }
              }
              d[(y * w + x) * 4 + c] = Math.max(0, Math.min(255, val));
            }
          }
        }
      }

      if (cfg.brightness !== 0 || cfg.saturation !== 0 || cfg.hue !== 0) {
        const bAdj = cfg.brightness / 100;
        const sAdj = cfg.saturation / 100;
        const hAdj = cfg.hue;
        for (let i = 0; i < d.length; i += 4) {
          let r = d[i] / 255;
          let g = d[i + 1] / 255;
          let b = d[i + 2] / 255;
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          let h2 = 0;
          let s2 = 0;
          let l2 = (max + min) / 2;
          if (max !== min) {
            const delta = max - min;
            s2 = l2 > 0.5 ? delta / (2 - max - min) : delta / (max + min);
            h2 =
              max === r
                ? (g - b) / delta + (g < b ? 6 : 0)
                : max === g
                ? (b - r) / delta + 2
                : (r - g) / delta + 4;
            h2 /= 6;
          }
          h2 = (h2 + hAdj / 360 + 1) % 1;
          s2 = Math.max(0, Math.min(1, s2 + sAdj));
          l2 = Math.max(0, Math.min(1, l2 + bAdj));
          if (s2 === 0) {
            r = g = b = l2;
          } else {
            const q = l2 < 0.5 ? l2 * (1 + s2) : l2 + s2 - l2 * s2;
            const p2 = 2 * l2 - q;
            const hue2rgb = (p: number, q2: number, t: number) => {
              const t2 = ((t % 1) + 1) % 1;
              if (t2 < 1 / 6) return p + (q2 - p) * 6 * t2;
              if (t2 < 1 / 2) return q2;
              if (t2 < 2 / 3) return p + (q2 - p) * (2 / 3 - t2) * 6;
              return p;
            };
            r = hue2rgb(p2, q, h2 + 1 / 3);
            g = hue2rgb(p2, q, h2);
            b = hue2rgb(p2, q, h2 - 1 / 3);
          }
          d[i] = Math.round(r * 255);
          d[i + 1] = Math.round(g * 255);
          d[i + 2] = Math.round(b * 255);
        }
      }

      if (cfg.normalize) {
        for (let i = 0; i < d.length; i += 4) {
          d[i] = Math.min(255, Math.round(d[i] * 1.04));
          d[i + 1] = Math.min(255, Math.round(d[i + 1] * 1.04));
          d[i + 2] = Math.min(255, Math.round(d[i + 2] * 1.04));
        }
      }

      ctx.putImageData(imageData, 0, 0);

      if (cfg.augFlip) {
        const flipped = document.createElement("canvas");
        flipped.width = outW;
        flipped.height = outH;
        const fc = flipped.getContext("2d")!;
        fc.translate(outW, 0);
        fc.scale(-1, 1);
        fc.drawImage(canvas, 0, 0);
        resolve({ dataUrl: flipped.toDataURL("image/jpeg", 0.92), srcW, srcH, outW, outH });
        return;
      }

      if (cfg.augRotate) {
        const rot = document.createElement("canvas");
        rot.width = outW;
        rot.height = outH;
        const rc = rot.getContext("2d")!;
        rc.translate(outW / 2, outH / 2);
        rc.rotate((10 * Math.PI) / 180);
        rc.drawImage(canvas, -outW / 2, -outH / 2);
        resolve({ dataUrl: rot.toDataURL("image/jpeg", 0.92), srcW, srcH, outW, outH });
        return;
      }

      resolve({ dataUrl: canvas.toDataURL("image/jpeg", 0.92), srcW, srcH, outW, outH });
    };
    img.src = src;
  });
}

/** 前処理を適用して dataUrl 文字列のみを返す（importImages 用） */
export async function applyPreprocessToDataUrl(
  src: string,
  cfg: PreprocessConfig
): Promise<string> {
  const result = await applyPreprocess(src, cfg);
  return result.dataUrl;
}
