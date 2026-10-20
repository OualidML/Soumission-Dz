import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SoumissionAI-DZ — Système Multi-Agents d\'Audit (Loi n° 23-12)',
  description: 'Audit automatisé et vérification des marchés publics algériens (BOMOP / BAOSEM) propulsé par Google Gemma 4 et des Agents Skills modulaires.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className="dark">
      <body className="antialiased selection:bg-cyan-500/30 selection:text-cyan-200">
        {children}
      </body>
    </html>
  );
}
