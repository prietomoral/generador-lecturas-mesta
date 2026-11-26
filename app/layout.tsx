import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DialectIA | IESO Sierra la Mesta — Programa NEXO",
  description:
    "Entrenador de Competencia Lingüística — Programa NEXO (Educalectura-Educalem) · IESO Sierra la Mesta",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <div className="flex-1 flex flex-col">{children}</div>

        <footer className="bg-white border-t border-slate-200/80 py-4 px-4 sm:px-6 text-center text-xs text-slate-500 print:hidden">
          <div className="max-w-4xl mx-auto space-y-1">
            <p className="font-medium text-slate-600">
              <strong className="font-semibold text-slate-800">
                Idea original y Diseño didáctico:
              </strong>{" "}
              Jorge Centeno Blanco{" "}
              <span className="mx-1.5 text-slate-300">|</span>{" "}
              <strong className="font-semibold text-slate-800">
                Desarrollo y Programación (asistida por IA Gemini):
              </strong>{" "}
              Luis Prieto
            </p>
            <p className="text-[11px] font-semibold text-indigo-800/80">
              IESO Sierra la Mesta · Noviembre 2026
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}