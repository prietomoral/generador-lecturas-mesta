"use client";

import React from "react";
import { ConfigMision } from "../types/gamificacion";

interface ConfiguradorMisionDocenteProps {
  mision: ConfigMision;
  onChange: (nuevaMision: ConfigMision) => void;
}

export default function ConfiguradorMisionDocente({
  mision,
  onChange,
}: ConfiguradorMisionDocenteProps) {
  return (
    <div className="border border-amber-200 bg-amber-50/50 rounded-2xl p-4 space-y-3 print:hidden">
      <div className="flex items-center justify-between gap-2">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800 block">
            Gamificación · Modo Misión
          </span>
          <p className="text-xs text-slate-600">
            Añade una narrativa motivadora y una meta de puntos para el reto de lectura.
          </p>
        </div>

        <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-bold text-amber-950 bg-white border border-amber-300 px-3 py-1.5 rounded-xl">
          <input
            type="checkbox"
            checked={mision.activa}
            onChange={(e) => onChange({ ...mision, activa: e.target.checked })}
            className="accent-amber-600 w-4 h-4"
          />
          <span>{mision.activa ? "Misión activa" : "Activar Misión"}</span>
        </label>
      </div>

      {mision.activa && (
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-1">
          <div className="sm:col-span-8">
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Título de la Misión
            </label>
            <input
              type="text"
              placeholder="Ej: Expedición al Archivo Secreto de Monfragüe"
              value={mision.tituloMision}
              onChange={(e) => onChange({ ...mision, tituloMision: e.target.value })}
              className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-sm"
            />
          </div>

          <div className="sm:col-span-4">
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Meta de puntos
            </label>
            <input
              type="number"
              min={100}
              max={3000}
              step={50}
              value={mision.metaPuntos}
              onChange={(e) =>
                onChange({ ...mision, metaPuntos: Number(e.target.value) || 400 })
              }
              className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-sm font-bold text-center"
            />
          </div>

          <div className="sm:col-span-12">
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Narrativa breve para el alumnado
            </label>
            <textarea
              rows={2}
              placeholder="Ej: Vuestro equipo debe descifrar las claves de este documento sin cometer errores de redacción para desbloquear el sello final..."
              value={mision.narrativa}
              onChange={(e) => onChange({ ...mision, narrativa: e.target.value })}
              className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-sm"
            />
          </div>
        </div>
      )}
    </div>
  );
}