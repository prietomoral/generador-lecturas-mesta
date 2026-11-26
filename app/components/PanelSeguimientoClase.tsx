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

interface ProgresoPasos {
  dominados: number;
  total: number;
  paso_actual_etiqueta: string;
}

interface EntregaAlumno {
  id: string;
  nombre_alumno: string;
  intentos: number;
  nivel_logro: string;
  nivel_comprension?: string | null;
  nivel_expresion?: string | null;
  superada: boolean;
  ultima_evaluacion?: {
    progreso_pasos?: ProgresoPasos;
  } | null;
  updated_at: string;
}

interface PanelSeguimientoClaseProps {
  codigoActividad: string;
  tituloActividad: string;
  bloqueoSecuencial?: boolean;
}

export default function PanelSeguimientoClase({
  codigoActividad,
  tituloActividad,
  bloqueoSecuencial = false,
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
          "id, nombre_alumno, intentos, nivel_logro, nivel_comprension, nivel_expresion, superada, ultima_evaluacion, updated_at"
        )
        .eq("actividad_codigo", codigoActividad)
        .order("updated_at", { ascending: false });

      if (!error && data) {
        setEntregas(data as EntregaAlumno[]);
      }
    } finally {
      setCargando(false);
    }
  }, [codigoActividad]);

  useEffect(() => {
    if (!codigoActividad) return;

    let activo = true;

    const inicializar = async () => {
      const { data, error } = await supabase
        .from("entregas")
        .select(
          "id, nombre_alumno, intentos, nivel_logro, nivel_comprension, nivel_expresion, superada, ultima_evaluacion, updated_at"
        )
        .eq("actividad_codigo", codigoActividad)
        .order("updated_at", { ascending: false });

      if (activo && !error && data) {
        setEntregas(data as EntregaAlumno[]);
      }
    };

    void inicializar();
    const intervalo = setInterval(() => {
      void cargarEntregas();
    }, 10000);

    return () => {
      activo = false;
      clearInterval(intervalo);
    };
  }, [codigoActividad, cargarEntregas]);

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
    <div className="mt-6 bg-indigo-50/75 border-2 border-indigo-200 rounded-2xl p-5 sm:p-6 space-y-5 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-indigo-200 pb-4">
        <div className="space-y-1">
          <span className="text-xs font-extrabold uppercase tracking-wider text-indigo-800 block">
            Aula Interactiva Activa · {tituloActividad}
          </span>
          <div className="flex flex-wrap items-center gap-2.5 pt-0.5">
            <span className="text-sm font-semibold text-slate-800">
              Código para el alumnado:
            </span>
            <span className="font-mono text-base sm:text-lg font-extrabold bg-indigo-950 text-white px-3.5 py-1 rounded-xl tracking-wide shadow-2xs">
              {codigoActividad}
            </span>
            <span
              className={`text-xs font-extrabold px-3 py-1 rounded-full border ${
                bloqueoSecuencial
                  ? "bg-indigo-100 text-indigo-950 border-indigo-300"
                  : "bg-white text-slate-800 border-slate-300"
              }`}
            >
              {bloqueoSecuencial ? "🔒 Avance secuencial obligatorio" : "🔓 Avance libre"}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={copiarEnlace}
            className="text-xs sm:text-sm font-bold bg-white border border-indigo-300 hover:bg-indigo-100 text-indigo-950 px-4 py-2.5 rounded-xl shadow-2xs transition cursor-pointer"
          >
            {copiado ? "✓ Enlace copiado" : "🔗 Copiar enlace para alumnos"}
          </button>
          <button
            type="button"
            onClick={cargarEntregas}
            disabled={cargando}
            className="text-xs sm:text-sm font-bold bg-indigo-700 hover:bg-indigo-600 text-white px-4 py-2.5 rounded-xl shadow-2xs transition cursor-pointer"
          >
            {cargando ? "Actualizando..." : "🔄 Actualizar tabla"}
          </button>
        </div>
      </div>

      {entregas.length === 0 ? (
        <p className="text-sm text-slate-700 py-2 leading-relaxed">
          Aún no ha entrado ningún alumno/a. Comparte el enlace{" "}
          <span className="font-mono font-semibold underline text-indigo-900">
            {enlaceAlumno}
          </span>{" "}
          o proyecta el código <strong>{codigoActividad}</strong>.
        </p>
      ) : (
        <div className="overflow-x-auto bg-white rounded-2xl border border-indigo-200/80 shadow-2xs">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100/90 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-700">
                <th className="py-3.5 px-4 font-extrabold">Alumno/a</th>
                <th className="py-3.5 px-3 text-center font-extrabold">Progreso General</th>
                <th className="py-3.5 px-3 text-center font-extrabold">Entregas</th>
                <th className="py-3.5 px-3 text-center font-extrabold">1. Comprensión</th>
                <th className="py-3.5 px-3 text-center font-extrabold">2. Expresión</th>
                <th className="py-3.5 px-3 text-center font-extrabold">Media General</th>
                <th className="py-3.5 px-4 text-center font-extrabold">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70">
              {entregas.map((e) => {
                const nivelComp = e.nivel_comprension || e.nivel_logro;
                const nivelExpr = e.nivel_expresion || e.nivel_logro;
                const mediaGeneral =
                  e.nivel_comprension && e.nivel_expresion
                    ? calcularMediaNiveles(e.nivel_comprension, e.nivel_expresion)
                    : e.nivel_logro;

                const progreso = e.ultima_evaluacion?.progreso_pasos;
                const dominados = progreso?.dominados ?? 0;
                const totalPasos = progreso?.total ?? 0;
                const porcentaje =
                  totalPasos > 0 ? Math.round((dominados / totalPasos) * 100) : 0;
                const todosDominados = totalPasos > 0 && dominados >= totalPasos;

                return (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      {e.nombre_alumno}
                    </td>

                    <td className="py-3.5 px-3 text-center min-w-[165px]">
                      {totalPasos > 0 ? (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                            <span>
                              {dominados} / {totalPasos} pasos
                            </span>
                            <span className="text-indigo-700">{porcentaje}%</span>
                          </div>
                          <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all duration-300 ${
                                e.superada || todosDominados
                                  ? "bg-emerald-600"
                                  : "bg-indigo-600"
                              }`}
                              style={{ width: `${porcentaje}%` }}
                            />
                          </div>
                          {progreso?.paso_actual_etiqueta && !e.superada && (
                            <div className="text-[11px] font-semibold text-slate-600 truncate">
                              {todosDominados
                                ? "📤 Pendiente de entrega final"
                                : bloqueoSecuencial
                                ? `✍️ Activa: ${progreso.paso_actual_etiqueta}`
                                : `🔓 ${progreso.paso_actual_etiqueta}`}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs font-medium text-slate-500">En curso</span>
                      )}
                    </td>

                    <td
                      title="Entregas globales realizadas (comprobar pasos individuales no consume intentos)"
                      className="py-3.5 px-3 text-center font-mono font-bold text-slate-700"
                    >
                      {e.intentos} / 10
                    </td>

                    <td className="py-3.5 px-3 text-center">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-xs font-bold border ${badgeNivel(
                          nivelComp
                        )}`}
                      >
                        {nivelComp}
                      </span>
                    </td>

                    <td className="py-3.5 px-3 text-center">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-xs font-bold border ${badgeNivel(
                          nivelExpr
                        )}`}
                      >
                        {nivelExpr}
                      </span>
                    </td>

                    <td className="py-3.5 px-3 text-center">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-xs font-extrabold border ${badgeNivel(
                          mediaGeneral
                        )}`}
                      >
                        {mediaGeneral}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      {e.superada ? (
                        <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-950 border border-emerald-300">
                          ✅ Superada
                        </span>
                      ) : e.intentos >= 10 ? (
                        <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-950 border border-rose-300">
                          ⛔ 10/10 agotados
                        </span>
                      ) : todosDominados ? (
                        <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-950 border border-indigo-300">
                          📤 Listo para entregar
                        </span>
                      ) : (
                        <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-950 border border-amber-300">
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