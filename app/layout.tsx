import type { Metadata } from 'next';
import './globals.css';

const metadataBase = new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000');

export const metadata: Metadata = {
  title: 'ZPL para PDF — Conversor local de etiquetas',
  description: 'Converta arquivos ZPL em PDFs no tamanho correto, diretamente no navegador.',
  metadataBase,
  openGraph: {
    title: 'ZPL para PDF',
    description: 'Etiquetas prontas para imprimir, sem enviar seus dados para a internet.',
    type: 'website',
    locale: 'pt_BR',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'ZPL para PDF — Etiquetas prontas para imprimir' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ZPL para PDF',
    description: 'Etiquetas prontas para imprimir, direto no navegador.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
