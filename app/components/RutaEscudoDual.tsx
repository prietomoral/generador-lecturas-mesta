"use client";

import React from "react";
import { EstadoEstacionEscudo } from "../types/gamificacion";

interface RutaEscudoDualProps {
  estaciones: EstadoEstacionEscudo[];
  indiceActivo?: number;
  onSeleccionarEstacion?: (indice: number) => void;
}

export default function RutaEscudoDual({
  estaciones,
  indiceActivo = 0,
  onSeleccionarEstacion,
}: RutaEscudoDualProps) {
  if (!estaciones || estaciones.length === 0) return null;

  return (
    <div className="bg-slate-900 text-white rounded-2xl p-4 border border-slate-700 shadow-sm space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-extrabold uppercase tracking-wider text-amber-300">
          🛡️ Ruta de Lectura y Escudo Dual
        </span>
        <div className="flex items-center gap-3 text-[11px] text-slate-300">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-xs bg-sky-400 inline-block" />
            Mitad izq.: Comprensión
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-xs bg-emerald-400 inline-block" />
            Mitad der.: Expresión
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-1 overflow-x-auto py-2 px-1">
        {estaciones.map((est, idx) => {
          const completo = est.comprensionIluminada && est.expresionIluminada;
          const esActual = idx === indiceActivo;
          const esMeta = est.tipo === "resumen";

          return (
            <React.Fragment key={est.id}>
              <button
                type="button"
                onClick={() => onSeleccionarEstacion?.(idx)}
                title={`${est.etiqueta}: Comprensión ${
                  est.comprensionIluminada ? "✓" : "pendiente"
                } | Expresión ${est.expresionIluminada ? "✓" : "pendiente"}`}
                className={`group flex flex-col items-center gap-1.5 shrink-0 transition cursor-pointer ${
                  esActual ? "scale-105" : "opacity-90 hover:opacity-100"
                }`}
              >
                {/* Escudo partido en dos mitades */}
                <div
                  className={`relative w-11 h-12 rounded-b-full rounded-t-md border-2 overflow-hidden flex shadow-md transition-all ${
                    completo
                      ? "border-amber-300 shadow-amber-400/30"
                      : esActual
                      ? "border-white ring-2 ring-indigo-400/50"
                      : "border-slate-600"
                  }`}
                >
                  {/* Mitad izquierda: Comprensión */}
                  <div
                    className={`w-1/2 h-full transition-colors duration-300 ${
                      est.comprensionIluminada ? "bg-sky-500" : "bg-slate-800"
                    }`}
                  />
                  {/* Mitad derecha: Expresión */}
                  <div
                    className={`w-1/2 h-full border-l border-slate-900/40 transition-colors duration-300 ${
                      est.expresionIluminada ? "bg-emerald-500" : "bg-slate-800"
                    }`}
                  />

                  {/* Icono central */}
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-black drop-shadow">
                    {completo ? (esMeta ? "🏆" : "🛡️") : esMeta ? "🏁" : est.etiqueta}
                  </span>
                </div>

                <span
                  className={`text-[11px] font-bold ${
                    completo
                      ? "text-amber-300"
                      : esActual
                      ? "text-white"
                      : "text-slate-400"
                  }`}
                >
                  {est.etiqueta}
                </span>
              </button>

              {idx < estaciones.length - 1 && (
                <div
                  className={`h-1 flex-1 min-w-[16px] rounded-full transition-colors ${
                    completo ? "bg-amber-400" : "bg-slate-700"
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}