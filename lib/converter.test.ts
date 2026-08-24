import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import { renderZpl } from 'zplr/node';
import {
  buildPdf,
  dpiToDensity,
  hasVisibleDots,
  hasPrintableFormat,
  mmToPoints,
  outputFileName,
  primeLabelDimensions,
  type PreviewLabel,
} from './converter';

const onePixelPng =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function label(widthMm: number, heightMm: number): PreviewLabel {
  return {
    dataUrl: onePixelPng,
    widthDots: Math.round(widthMm * 8),
    heightDots: Math.round(heightMm * 8),
    widthMm,
    heightMm,
    printDensity: 8,
    diagnostics: [],
  };
}

describe('converter helpers', () => {
  it('maps common Zebra resolutions to dots per millimetre', () => {
    expect(dpiToDensity(203)).toBe(8);
    expect(dpiToDensity(300)).toBe(12);
    expect(dpiToDensity(600)).toBe(24);
  });

  it('detects complete printable formats', () => {
    expect(hasPrintableFormat('^XA^FDTeste^FS^XZ')).toBe(true);
    expect(hasPrintableFormat('^XA^FDincompleto')).toBe(false);
    expect(hasPrintableFormat('')).toBe(false);
  });

  it('primes late ^PW and ^LL commands without changing inherited sizes', () => {
    const source = '^XA^FO1,1^FDPrimeira^FS^PW800^LL1200^XZ^XA^FO1,1^FDSegunda^FS^XZ';
    expect(primeLabelDimensions(source)).toBe(
      '^XA^PW800^LL1200^FO1,1^FDPrimeira^FS^PW800^LL1200^XZ^XA^FO1,1^FDSegunda^FS^XZ',
    );
  });

  it('distinguishes printable rasters from control-only blank formats', () => {
    expect(hasVisibleDots(new Uint8Array([0, 0, 0]))).toBe(false);
    expect(hasVisibleDots(new Uint8Array([0, 16, 0]))).toBe(true);
  });

  it('creates a safe PDF filename from supported inputs', () => {
    expect(outputFileName('pedido-123.zpl')).toBe('pedido-123.pdf');
    expect(outputFileName('etiqueta.prn')).toBe('etiqueta.pdf');
    expect(outputFileName('cliente: 12.txt')).toBe('cliente- 12.pdf');
  });

  it('converts millimetres to physical PDF points', () => {
    expect(mmToPoints(25.4)).toBeCloseTo(72, 8);
  });

  it('builds a multipage PDF preserving each label size', async () => {
    const bytes = await buildPdf([label(100, 150), label(80, 50)]);
    const document = await PDFDocument.load(bytes);
    const [first, second] = document.getPages();

    expect(document.getPageCount()).toBe(2);
    expect(first.getWidth()).toBeCloseTo(mmToPoints(100), 3);
    expect(first.getHeight()).toBeCloseTo(mmToPoints(150), 3);
    expect(second.getWidth()).toBeCloseTo(mmToPoints(80), 3);
    expect(second.getHeight()).toBeCloseTo(mmToPoints(50), 3);
  });

  it('renders multiple formats and expands the ^PQ quantity', async () => {
    const fixture = await readFile(new URL('../tests/fixtures/multiple-labels.zpl', import.meta.url), 'utf8');
    const job = await renderZpl(fixture, {
      printDensity: 8,
      fallbackSize: { width: 100, height: 150, unit: 'mm' },
    });

    expect(job.labels).toHaveLength(4);
    expect(job.labels[0].width).toBe(800);
    expect(job.labels[0].height).toBe(1200);
    expect(job.labels.slice(1).every((item) => item.width === 640 && item.height === 400)).toBe(true);
  });
});
