"use client";

import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

const NIVELES_ESCALA = [
  "No conseguido",
  "Bajamente Conseguido",
  "Conseguido",
  "Altamente Conseguido",
];

function calcularMediaNiveles(nivelComp: string, nivelExpr: string): string {
  const idxComp = Math.max(0, NIVELES_ESCALA.indexOf(nivelComp));
  const idxExpr = Math.max(0, NIVELES_ESCALA.indexOf(nivelExpr));
  const mediaIdx = Math.floor((idxComp + idxExpr) / 2);
  return NIVELES_ESCALA[mediaIdx] || "No conseguido";
}

interface EntregaAlumno {
  id: string;
  nombre_alumno: string;
  intentos: number;
  nivel_logro: string;
  nivel_comprension?: string | null;
  nivel_expresion?: string | null;
  superada: boolean;
  updated_at: string;
}

interface PanelSeguimientoClaseProps {
  codigoActividad: string;
  tituloActividad: string;
}

export default function PanelSeguimientoClase({
  codigoActividad,
  tituloActividad,
}: PanelSeguimientoClaseProps) {
  const [entregas, setEntregas] = useState<EntregaAlumno[]>([]);
  const [cargando, setCargando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const enlaceAlumno =
    typeof window !== "undefined"
      ? `${window.location.origin}/alumno?codigo=${codigoActividad}`
      : `/alumno?codigo=${codigoActividad}`;

  const cargarEntregas = useCallback(async () => {
    if (!codigoActividad) return;
    setCargando(true);
    try {
      const { data, error } = await supabase
        .from("entregas")
        .select(
          "id, nombre_alumno, intentos, nivel_logro, nivel_comprension, nivel_expresion, superada, updated_at"
        )
        .eq("actividad_codigo", codigoActividad)
        .order("updated_at", { ascending: false });

      if (!error && data) {
        setEntregas(data);
      }
    } finally {
      setCargando(false);
    }
  }, [codigoActividad]);

  useEffect(() => {
    cargarEntregas();
    const intervalo = setInterval(cargarEntregas, 10000);
    return () => clearInterval(intervalo);
  }, [cargarEntregas]);

  const copiarEnlace = () => {
    navigator.clipboard.writeText(enlaceAlumno);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 3000);
  };

  const badgeNivel = (nivel: string) => {
    switch (nivel) {
      case "Altamente Conseguido":
        return "bg-emerald-100 text-emerald-950 border-emerald-300";
      case "Conseguido":
        return "bg-teal-100 text-teal-950 border-teal-300";
      case "Bajamente Conseguido":
        return "bg-amber-100 text-amber-950 border-amber-300";
      default:
        return "bg-rose-100 text-rose-950 border-rose-300";
    }
  };

  return (
    <div className="mt-6 bg-indigo-50/70 border-2 border-indigo-200 rounded-2xl p-5 space-y-4 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-200/80 pb-3">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">
            Aula Interactiva Activa · {tituloActividad}
          </span>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-slate-700">Código para el alumnado:</span>
            <span className="font-mono text-base font-extrabold bg-indigo-900 text-white px-3 py-0.5 rounded-lg">
              {codigoActividad}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={copiarEnlace}
            className="text-xs font-bold bg-white border border-indigo-300 hover:bg-indigo-100 text-indigo-900 px-3.5 py-2 rounded-xl transition cursor-pointer"
          >
            {copiado ? "✓ Enlace copiado" : "🔗 Copiar enlace para alumnos"}
          </button>
          <button
            type="button"
            onClick={cargarEntregas}
            disabled={cargando}
            className="text-xs font-bold bg-indigo-700 hover:bg-indigo-600 text-white px-3.5 py-2 rounded-xl transition cursor-pointer"
          >
            {cargando ? "Actualizando..." : "🔄 Actualizar tabla"}
          </button>
        </div>
      </div>

      {entregas.length === 0 ? (
        <p className="text-xs text-slate-600 py-2">
          Aún no ha entrado ningún alumno/a. Comparte el enlace{" "}
          <span className="font-mono underline">{enlaceAlumno}</span> o proyecta el código{" "}
          <strong>{codigoActividad}</strong>.
        </p>
      ) : (
        <div className="overflow-x-auto bg-white rounded-xl border border-indigo-100">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="py-2.5 px-4">Alumno/a</th>
                <th className="py-2.5 px-3 text-center">Intentos</th>
                <th className="py-2.5 px-3 text-center">1. Comprensión</th>
                <th className="py-2.5 px-3 text-center">2. Expresión</th>
                <th className="py-2.5 px-3 text-center">Media General</th>
                <th className="py-2.5 px-4 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entregas.map((e) => {
                const nivelComp = e.nivel_comprension || e.nivel_logro;
                const nivelExpr = e.nivel_expresion || e.nivel_logro;
                const mediaGeneral =
                  e.nivel_comprension && e.nivel_expresion
                    ? calcularMediaNiveles(e.nivel_comprension, e.nivel_expresion)
                    : e.nivel_logro;

                return (
                  <tr key={e.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 font-semibold text-slate-800">
                      {e.nombre_alumno}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-slate-600">
                      {e.intentos} / 10
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold border ${badgeNivel(
                          nivelComp
                        )}`}
                      >
                        {nivelComp}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold border ${badgeNivel(
                          nivelExpr
                        )}`}
                      >
                        {nivelExpr}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-extrabold border ${badgeNivel(
                          mediaGeneral
                        )}`}
                      >
                        {mediaGeneral}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      {e.superada ? (
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900">
                          ✅ Superada
                        </span>
                      ) : e.intentos >= 10 ? (
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-900">
                          ⛔ 10/10 agotados
                        </span>
                      ) : (
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900">
                          ⏳ Entrenando
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}