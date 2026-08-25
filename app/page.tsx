'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildPdf,
  downloadBytes,
  outputFileName,
  renderPreview,
  type Dpi,
  type PreviewLabel,
} from '../lib/converter';

const sampleZpl = `^XA
^CI28
^PW800
^LL1200
^FO45,45^GB710,1110,3^FS
^FO75,90^A0N,34,34^FDDESTINATARIO^FS
^FO75,150^A0N,48,48^FDMaria Oliveira^FS
^FO75,215^A0N,28,28^FDAvenida Brasil, 1200^FS
^FO75,255^A0N,28,28^FDSao Paulo - SP - 01310-100^FS
^FO75,345^BY3,3,100^BCN,100,Y,N,N^FDAB123456789BR^FS
^FO75,570^BQN,2,8^FDQA,https://exemplo.local/AB123456789BR^FS
^FO340,585^A0N,28,28^FDDocumento: 000123^FS
^FO340,635^A0N,28,28^FDVolume: 1/1^FS
^FO75,1030^A0N,24,24^FDEtiqueta de demonstracao^FS
^XZ`;

const SETTINGS_KEY = 'zpl-para-pdf:settings-v1';
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function formatMm(value: number) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function diagnosticLabel(severity: string) {
  if (severity === 'error') return 'Erro';
  if (severity === 'warning') return 'Atenção';
  return 'Informação';
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const renderRequest = useRef(0);
  const preferencesLoaded = useRef(false);
  const [zpl, setZpl] = useState(sampleZpl);
  const [fileName, setFileName] = useState('exemplo.zpl');
  const [dpi, setDpi] = useState<Dpi>(203);
  const [fallbackWidth, setFallbackWidth] = useState(100);
  const [fallbackHeight, setFallbackHeight] = useState(150);
  const [labels, setLabels] = useState<PreviewLabel[]>([]);
  const [diagnostics, setDiagnostics] = useState<Awaited<ReturnType<typeof renderPreview>>['diagnostics']>([]);
  const [activePage, setActivePage] = useState(0);
  const [isRendering, setIsRendering] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
      if (saved?.dpi === 203 || saved?.dpi === 300 || saved?.dpi === 600) setDpi(saved.dpi);
      if (Number.isFinite(saved?.fallbackWidth)) setFallbackWidth(saved.fallbackWidth);
      if (Number.isFinite(saved?.fallbackHeight)) setFallbackHeight(saved.fallbackHeight);
    } catch {
      // Prefer defaults when device-local preferences cannot be read.
    } finally {
      preferencesLoaded.current = true;
    }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!preferencesLoaded.current) return;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ dpi, fallbackWidth, fallbackHeight }));
  }, [dpi, fallbackWidth, fallbackHeight]);

  const runRender = useCallback(async () => {
    const requestId = ++renderRequest.current;
    setIsRendering(true);
    setError('');

    try {
      const result = await renderPreview(zpl, {
        dpi,
        fallbackWidthMm: fallbackWidth,
        fallbackHeightMm: fallbackHeight,
      });
      if (requestId !== renderRequest.current) return;
      setLabels(result.labels);
      setDiagnostics(result.diagnostics);
      setActivePage((current) => Math.min(current, result.labels.length - 1));
    } catch (renderError) {
      if (requestId !== renderRequest.current) return;
      setLabels([]);
      setDiagnostics([]);
      setActivePage(0);
      setError(renderError instanceof Error ? renderError.message : 'Não foi possível interpretar este ZPL.');
    } finally {
      if (requestId === renderRequest.current) setIsRendering(false);
    }
  }, [dpi, fallbackHeight, fallbackWidth, zpl]);

  useEffect(() => {
    const timer = window.setTimeout(runRender, 450);
    return () => window.clearTimeout(timer);
  }, [runRender]);

  async function loadFile(file?: File) {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError('O arquivo ultrapassa o limite de 10 MB.');
      return;
    }
    try {
      setZpl(await file.text());
      setFileName(file.name);
      setError('');
    } catch {
      setError('Não foi possível ler esse arquivo.');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function downloadPdf() {
    setIsDownloading(true);
    setError('');
    try {
      const bytes = await buildPdf(labels);
      downloadBytes(bytes, outputFileName(fileName));
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Não foi possível gerar o PDF.');
    } finally {
      setIsDownloading(false);
    }
  }

  function clearAll() {
    renderRequest.current += 1;
    setZpl('');
    setFileName('novo-arquivo.zpl');
    setLabels([]);
    setDiagnostics([]);
    setError('');
    setActivePage(0);
  }

  const currentLabel = labels[activePage];
  const relevantDiagnostics = diagnostics.filter((item) => item.severity !== 'info').slice(0, 4);

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#inicio" aria-label="ZPL para PDF — início">
          <span className="brand-mark" aria-hidden="true">Z</span>
          <span>ZPL para PDF</span>
        </a>
        <span className="privacy-pill"><span aria-hidden="true">●</span> 100% local</span>
      </header>

      <section className="hero" id="inicio">
        <div>
          <p className="eyebrow">Conversor de etiquetas Zebra</p>
          <h1>Seu ZPL, pronto para<br />imprimir em PDF.</h1>
        </div>
        <p className="hero-copy">
          Abra um arquivo ou cole o código. A etiqueta é processada no seu
          navegador e não sai do computador.
        </p>
      </section>

      <section className="workbench" aria-label="Conversor ZPL">
        <div className="editor-panel">
          <div className="panel-heading">
            <div>
              <span className="step">01</span>
              <h2>Arquivo ZPL</h2>
            </div>
            <div className="heading-actions">
              <button className="link-button muted-action" type="button" onClick={clearAll}>Limpar</button>
              <button className="link-button" type="button" onClick={() => inputRef.current?.click()}>Abrir arquivo</button>
            </div>
          </div>

          <button
            className={`dropzone${isDragging ? ' is-dragging' : ''}`}
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              void loadFile(event.dataTransfer.files[0]);
            }}
          >
            <span className="upload-icon" aria-hidden="true">↑</span>
            <span><strong>Arraste seu arquivo aqui</strong> ou clique para selecionar</span>
            <small>.zpl, .txt ou .prn · até 10 MB</small>
          </button>
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept=".zpl,.txt,.prn,text/plain"
            onChange={(event) => void loadFile(event.target.files?.[0])}
          />

          <div className="code-wrap">
            <div className="code-toolbar">
              <span title={fileName}>{fileName}</span>
              <span>{zpl ? zpl.split('\n').length : 0} linhas</span>
            </div>
            <textarea
              aria-label="Código ZPL"
              placeholder="Cole aqui um código iniciado por ^XA e terminado por ^XZ"
              spellCheck={false}
              value={zpl}
              onChange={(event) => {
                setZpl(event.target.value);
                setFileName('codigo-colado.zpl');
              }}
            />
          </div>

          <details className="fallback-settings">
            <summary>Medidas mínimas quando ^PW ou ^LL não existirem</summary>
            <div className="size-fields">
              <label>
                Largura (mm)
                <input type="number" min="10" max="500" step="1" value={fallbackWidth} onChange={(event) => setFallbackWidth(Number(event.target.value) || 100)} />
              </label>
              <label>
                Altura (mm)
                <input type="number" min="10" max="1000" step="1" value={fallbackHeight} onChange={(event) => setFallbackHeight(Number(event.target.value) || 150)} />
              </label>
            </div>
          </details>
        </div>

        <div className="preview-panel">
          <div className="panel-heading">
            <div>
              <span className="step">02</span>
              <h2>Prévia</h2>
            </div>
            <span className="page-counter">
              {isRendering ? 'Processando…' : `${labels.length} etiqueta${labels.length === 1 ? '' : 's'}`}
            </span>
          </div>

          <div className="preview-stage" aria-busy={isRendering}>
            {isRendering && <div className="loader" role="status"><span /> Interpretando ZPL</div>}
            {!isRendering && error && labels.length === 0 && (
              <div className="empty-state" role="alert">
                <span aria-hidden="true">!</span>
                <strong>Prévia indisponível</strong>
                <p>{error}</p>
              </div>
            )}
            {!isRendering && currentLabel && (
              <div className="rendered-label-wrap">
                {/* The renderer already returns the label as a faithful monochrome raster. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="rendered-label"
                  src={currentLabel.dataUrl}
                  alt={`Prévia da etiqueta ${activePage + 1} de ${labels.length}`}
                />
              </div>
            )}
          </div>

          {labels.length > 1 && (
            <div className="pagination" aria-label="Selecionar etiqueta">
              <button type="button" disabled={activePage === 0} onClick={() => setActivePage((page) => page - 1)} aria-label="Etiqueta anterior">←</button>
              <span>{activePage + 1} / {labels.length}</span>
              <button type="button" disabled={activePage === labels.length - 1} onClick={() => setActivePage((page) => page + 1)} aria-label="Próxima etiqueta">→</button>
            </div>
          )}

          {relevantDiagnostics.length > 0 && (
            <details className="diagnostics">
              <summary>{relevantDiagnostics.length} aviso{relevantDiagnostics.length === 1 ? '' : 's'} do arquivo</summary>
              <ul>
                {relevantDiagnostics.map((item, index) => (
                  <li key={`${item.code}-${index}`}>
                    <strong>{diagnosticLabel(item.severity)} {item.command ? `em ${item.command}` : ''}</strong>
                    <span>{item.message}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {error && labels.length > 0 && <p className="inline-error" role="alert">{error}</p>}

          <div className="label-meta" aria-live="polite">
            {currentLabel ? (
              <>
                <span>{formatMm(currentLabel.widthMm)} × {formatMm(currentLabel.heightMm)} mm</span>
                <span>{currentLabel.widthDots} × {currentLabel.heightDots} pontos</span>
              </>
            ) : <span>Aguardando etiqueta válida</span>}
          </div>

          <div className="controls-row">
            <label>
              Resolução
              <select value={dpi} onChange={(event) => setDpi(Number(event.target.value) as Dpi)} aria-label="Resolução">
                <option value="203">203 DPI</option>
                <option value="300">300 DPI</option>
                <option value="600">600 DPI</option>
              </select>
            </label>
            <button className="secondary-button" type="button" onClick={() => void runRender()} disabled={isRendering}>Atualizar</button>
            <button className="primary-button" type="button" onClick={() => void downloadPdf()} disabled={isRendering || isDownloading || labels.length === 0}>
              {isDownloading ? 'Gerando…' : 'Baixar PDF'} <span aria-hidden="true">↓</span>
            </button>
          </div>
        </div>
      </section>

      <footer>
        <span>Sem upload. Sem cadastro. Sem complicação.</span>
        <span>ZPL II · PDF multipágina</span>
      </footer>
    </main>
  );
}
