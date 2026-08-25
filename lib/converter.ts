import type { PrintDensity, ZplDiagnostic } from 'zplr/web';

export const DPI_OPTIONS = [203, 300, 600] as const;
export type Dpi = (typeof DPI_OPTIONS)[number];

export interface RenderSettings {
  dpi: Dpi;
  fallbackWidthMm: number;
  fallbackHeightMm: number;
}

export interface PreviewLabel {
  dataUrl: string;
  widthDots: number;
  heightDots: number;
  widthMm: number;
  heightMm: number;
  printDensity: PrintDensity;
  diagnostics: readonly ZplDiagnostic[];
}

export interface RenderedPreview {
  labels: PreviewLabel[];
  diagnostics: readonly ZplDiagnostic[];
}

interface LabelLayout {
  height: number;
  diagnostics: readonly Pick<ZplDiagnostic, 'code'>[];
  highlightRegions: readonly {
    y: number;
    height?: number;
    radius?: number;
    textCaretStops?: readonly { y: number; endY: number }[];
  }[];
}

function usesFallbackLabelHeight(label: Pick<LabelLayout, 'diagnostics'>): boolean {
  return label.diagnostics.some(
    (diagnostic) => diagnostic.code === 'FALLBACK_LABEL_HEIGHT',
  );
}

export function dpiToDensity(dpi: Dpi): PrintDensity {
  if (dpi === 600) return 24;
  if (dpi === 300) return 12;
  return 8;
}

export function mmToPoints(mm: number): number {
  return (mm * 72) / 25.4;
}

export function outputFileName(inputName: string): string {
  const trimmed = inputName.trim() || 'etiquetas.zpl';
  const withoutExtension = trimmed.replace(/\.(zpl|txt|prn)$/i, '');
  const safe = withoutExtension.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'etiquetas';
  return `${safe}.pdf`;
}

export function hasPrintableFormat(source: string): boolean {
  return /\^XA/i.test(source) && /\^XZ/i.test(source);
}

export function primeLabelDimensions(source: string): string {
  return source.replace(/\^XA[\s\S]*?\^XZ/gi, (format) => {
    const widths = [...format.matchAll(/\^PW(\d+)/gi)];
    const heights = [...format.matchAll(/\^LL(\d+)/gi)];
    const width = widths.at(-1)?.[1];
    const height = heights.at(-1)?.[1];
    const prefix = `${width ? `^PW${width}` : ''}${height ? `^LL${height}` : ''}`;
    return prefix ? format.replace(/^\^XA/i, `^XA${prefix}`) : format;
  });
}

export function hasVisibleDots(data: Uint8Array): boolean {
  return data.some((byte) => byte !== 0);
}

export function requiredLabelHeight(label: LabelLayout): number {
  if (!usesFallbackLabelHeight(label)) return label.height;

  const contentBottom = label.highlightRegions.reduce((bottom, region) => {
    const regionBottom = region.height != null
      ? region.y + region.height
      : region.radius != null
        ? region.y + region.radius * 2
        : region.y;
    const caretBottom = region.textCaretStops?.reduce(
      (maximum, caret) => Math.max(maximum, caret.y, caret.endY),
      regionBottom,
    ) ?? regionBottom;
    return Math.max(bottom, regionBottom, caretBottom);
  }, label.height);

  const requiredHeight = Math.ceil(contentBottom);
  return requiredHeight > label.height ? requiredHeight + 1 : label.height;
}

function canvasDataUrl(canvas: HTMLCanvasElement, width: number, height: number): string {
  if (canvas.width === width && canvas.height === height) return canvas.toDataURL('image/png');

  const cropped = document.createElement('canvas');
  cropped.width = width;
  cropped.height = height;
  const context = cropped.getContext('2d');
  if (!context) throw new Error('Não foi possível preparar a imagem da etiqueta.');
  context.drawImage(canvas, 0, 0);
  return cropped.toDataURL('image/png');
}

export async function renderPreview(
  source: string,
  settings: RenderSettings,
): Promise<RenderedPreview> {
  if (!source.trim()) throw new Error('Cole um código ZPL ou abra um arquivo para começar.');
  if (!hasPrintableFormat(source)) {
    throw new Error('Nenhuma etiqueta completa foi encontrada. Verifique os comandos ^XA e ^XZ.');
  }

  const { renderZpl } = await import('zplr/web');
  const printDensity = dpiToDensity(settings.dpi);
  const preparedSource = primeLabelDimensions(source);
  const limits = {
    maxDimension: 32_768,
    maxPixels: 40_000_000,
    maxGraphicBytes: 16 * 1024 * 1024,
    maxSessionBytes: 32 * 1024 * 1024,
    maxTemplateDepth: 16,
    maxExpandedCommands: 100_000,
    maxLabels: 1_000,
  };
  const initialJob = await renderZpl(preparedSource, {
    printDensity,
    fallbackSize: {
      width: settings.fallbackWidthMm,
      height: settings.fallbackHeightMm,
      unit: 'mm',
    },
    limits,
  });

  const targetHeights = initialJob.labels.map(requiredLabelHeight);
  const expandedFallbackHeight = initialJob.labels.reduce(
    (maximum, label, index) => usesFallbackLabelHeight(label)
      ? Math.max(maximum, targetHeights[index])
      : maximum,
    0,
  );
  const needsExpandedFallback = initialJob.labels.some(
    (label, index) => targetHeights[index] > label.height,
  );
  const job = needsExpandedFallback
    ? await renderZpl(preparedSource, {
        printDensity,
        fallbackSize: {
          width: Math.round(settings.fallbackWidthMm * printDensity),
          height: expandedFallbackHeight,
          unit: 'dots',
        },
        limits,
      })
    : initialJob;

  if (job.labels.length !== targetHeights.length) {
    throw new Error('Não foi possível ajustar as dimensões de todas as etiquetas.');
  }

  const printableLabels = job.labels
    .map((label, index) => ({ label, height: targetHeights[index] }))
    .filter(({ label }) => hasVisibleDots(label.raster.data));

  if (printableLabels.length === 0) {
    throw new Error('O ZPL foi lido, mas não produziu nenhuma etiqueta imprimível.');
  }

  return {
    diagnostics: job.diagnostics,
    labels: printableLabels.map(({ label, height }) => ({
      dataUrl: canvasDataUrl(label.canvas, label.width, height),
      widthDots: label.width,
      heightDots: height,
      widthMm: label.width / label.printDensity,
      heightMm: height / label.printDensity,
      printDensity: label.printDensity,
      diagnostics: label.diagnostics,
    })),
  };
}

export async function buildPdf(labels: readonly PreviewLabel[]): Promise<Uint8Array> {
  if (labels.length === 0) throw new Error('Gere a prévia antes de baixar o PDF.');

  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  pdf.setTitle('Etiquetas ZPL');
  pdf.setCreator('ZPL para PDF');

  for (const label of labels) {
    const pageWidth = mmToPoints(label.widthMm);
    const pageHeight = mmToPoints(label.heightMm);
    const page = pdf.addPage([pageWidth, pageHeight]);
    const image = await pdf.embedPng(label.dataUrl);
    page.drawImage(image, { x: 0, y: 0, width: pageWidth, height: pageHeight });
  }

  return pdf.save();
}

export function downloadBytes(bytes: Uint8Array, filename: string): void {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
