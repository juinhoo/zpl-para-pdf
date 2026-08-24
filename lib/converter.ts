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
  const job = await renderZpl(primeLabelDimensions(source), {
    printDensity,
    fallbackSize: {
      width: settings.fallbackWidthMm,
      height: settings.fallbackHeightMm,
      unit: 'mm',
    },
    limits: {
      maxDimension: 32_768,
      maxPixels: 40_000_000,
      maxGraphicBytes: 16 * 1024 * 1024,
      maxSessionBytes: 32 * 1024 * 1024,
      maxTemplateDepth: 16,
      maxExpandedCommands: 100_000,
      maxLabels: 1_000,
    },
  });

  const printableLabels = job.labels.filter((label) => hasVisibleDots(label.raster.data));

  if (printableLabels.length === 0) {
    throw new Error('O ZPL foi lido, mas não produziu nenhuma etiqueta imprimível.');
  }

  return {
    diagnostics: job.diagnostics,
    labels: printableLabels.map((label) => ({
      dataUrl: label.canvas.toDataURL('image/png'),
      widthDots: label.width,
      heightDots: label.height,
      widthMm: label.width / label.printDensity,
      heightMm: label.height / label.printDensity,
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
