import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'VLinked - Descubra Profissionais em Vídeo',
  description: 'A plataforma de vídeo para descoberta de profissionais. Encontre fotógrafos, designers, desenvolvedores e muito mais.',
  keywords: ['profissionais', 'vídeo', 'descoberta', 'serviços', 'freelancer'],
  openGraph: {
    title: 'VLinked - Descubra Profissionais em Vídeo',
    description: 'A plataforma de vídeo para descoberta de profissionais.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
