import type { ReactNode } from "react";

export const metadata = {
  title: "ULTRA M 64 · Figuras de arcilla polimérica",
  description: "Figuras de arcilla polimérica hechas a mano de ULTRA M 64.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
