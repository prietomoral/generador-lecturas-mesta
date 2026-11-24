"use client";

import React from "react";
import {
  CATALOGO_INSIGNIAS,
  ConfigMision,
  EstadoGamificacion,
  IdInsignia,
} from "../types/gamificacion";

interface PanelGamificacionAlumnoProps {
  gamificacion: EstadoGamificacion;
  mision?: ConfigMision | null;
}

const TODAS_INSIGNIAS: IdInsignia[] = [
  "lupa_detective",
  "pluma_oro",
  "maestro_sintesis",
  "oido_fino",
];

export default function PanelGamificacionAlumno({
  gamificacion,
  mision,
}: PanelGamificacionAlumnoProps) {
  const metaPuntos = mision?.activa && mision.metaPuntos > 0 ? mision.metaPuntos : 0;
  const progresoMision =
    metaPuntos > 0
      ? Math.min(100, Math.round((gamificacion.puntosTotales / metaPuntos) * 100))
      : 0;

  return (
    <div className="space-y-3">
      {/* Tarjeta de Modo Misión si está activa */}
      {mision?.activa && (
        <div className="bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border-2 border-amber-300 rounded-2xl p-4 shadow-xs space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-extrabold uppercase tracking-wider text-amber-900 bg-amber-200/80 px-2.5 py-0.5 rounded-full">
              🗺️ Misión Especial: {mision.tituloMision || "Reto de Comprensión"}
            </span>
            {metaPuntos > 0 && (
              <span className="text-xs font-extrabold text-amber-950">
                Meta: {gamificacion.puntosTotales} / {metaPuntos} pts ({progresoMision}%)
              </span>
            )}
          </div>
          {mision.narrativa && (
            <p className="text-xs sm:text-sm text-amber-950/90 leading-relaxed">
              {mision.narrativa}
            </p>
          )}
          {metaPuntos > 0 && (
            <div className="w-full bg-amber-200/70 h-2 rounded-full overflow-hidden">
              <div
                className="bg-amber-600 h-full transition-all duration-500"
                style={{ width: `${progresoMision}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* HUD de Puntos, Racha y Medallero */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Nivel de lector */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-1.5">
            <span className="text-[10px] font-bold uppercase text-indigo-700 block">
              Rango de Lector
            </span>
            <span className="text-xs font-extrabold text-indigo-950">
              {gamificacion.nivelLector.icono} {gamificacion.nivelLector.titulo}
            </span>
          </div>

          {/* Puntos totales */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-1.5">
            <span className="text-[10px] font-bold uppercase text-amber-800 block">
              Puntos de Sesión
            </span>
            <span className="text-sm font-black text-amber-950">
              ⭐ {gamificacion.puntosTotales} pts
            </span>
          </div>

          {/* Multiplicador de racha ortográfica/expresión */}
          <div
            className={`border rounded-xl px-3 py-1.5 ${
              gamificacion.rachaExpresion >= 2
                ? "bg-orange-50 border-orange-300 text-orange-950"
                : "bg-slate-50 border-slate-200 text-slate-700"
            }`}
          >
            <span className="text-[10px] font-bold uppercase block">
              Racha Redacción
            </span>
            <span className="text-xs font-extrabold">
              🔥 {gamificacion.rachaExpresion} seguidas (x
              {gamificacion.multiplicadorActual.toFixed(2)})
            </span>
          </div>
        </div>

        {/* Medallero de habilidades */}
        <div className="flex items-center gap-1.5">
          {TODAS_INSIGNIAS.map((id) => {
            const def = CATALOGO_INSIGNIAS[id];
            const obtenida = gamificacion.insigniasDesbloqueadas.includes(id);
            return (
              <div
                key={id}
                title={`${def.nombre}: ${def.descripcion}${
                  obtenida ? " (¡Desbloqueada!)" : " (Bloqueada)"
                }`}
                className={`w-9 h-9 rounded-xl border flex items-center justify-center text-base transition ${
                  obtenida
                    ? "bg-amber-100 border-amber-400 shadow-xs scale-105"
                    : "bg-slate-100 border-slate-200 opacity-40 grayscale"
                }`}
              >
                {def.icono}
              </div>
            );
          })}
        </div>
      </div>

      {/* Notificación del último logro de puntos */}
      {gamificacion.ultimoEventoPuntos && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-950 rounded-xl px-3.5 py-2 text-xs font-bold flex items-center justify-between">
          <span>✨ {gamificacion.ultimoEventoPuntos.motivo}</span>
          <span className="bg-emerald-600 text-white px-2 py-0.5 rounded-full text-[11px]">
            +{gamificacion.ultimoEventoPuntos.puntosGanados} pts
          </span>
        </div>
      )}
    </div>
  );
}