"use client";

import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { ConfigMision, EstadoGamificacion } from "../types/gamificacion";

const NIVELES_ESCALA = [
  "No conseguido",
  "Bajamente Conseguido",
  "Conseguido",
  "Altamente Conseguido",
];

const ICONOS_INSIGNIA: Record<string, string> = {
  lupa_detective: "🔍",
  pluma_oro: "✒️",
  maestro_sintesis: "📜",
  oido_fino: "🎧",
};

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
    gamificacion?: EstadoGamificacion;
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
  bloqueoSecuencial = true,
}: PanelSeguimientoClaseProps) {
  const [entregas, setEntregas] = useState<EntregaAlumno[]>([]);
  const [mision, setMision] = useState<ConfigMision | null>(null);
  const [ordenPorPuntos, setOrdenPorPuntos] = useState<boolean>(true);
  const [cargando, setCargando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const enlaceAlumno =
    typeof window !== "undefined"
      ? `${window.location.origin}/alumno?codigo=${codigoActividad}`
      : `/alumno?codigo=${codigoActividad}`;

  const cargarDatos = useCallback(async () => {
    if (!codigoActividad) return;
    setCargando(true);
    try {
      const [{ data: dataEntregas, error }, { data: dataAct }] = await Promise.all([
        supabase
          .from("entregas")
          .select(
            "id, nombre_alumno, intentos, nivel_logro, nivel_comprension, nivel_expresion, superada, ultima_evaluacion, updated_at"
          )
          .eq("actividad_codigo", codigoActividad)
          .order("updated_at", { ascending: false }),
        supabase
          .from("actividades")
          .select("config_mision")
          .eq("codigo", codigoActividad)
          .maybeSingle(),
      ]);

      if (!error && dataEntregas) {
        setEntregas(dataEntregas as EntregaAlumno[]);
      }
      if (dataAct?.config_mision) {
        setMision(dataAct.config_mision as ConfigMision);
      }
    } finally {
      setCargando(false);
    }
  }, [codigoActividad]);

  useEffect(() => {
    if (!codigoActividad) return;
    void cargarDatos();

    const intervalo = setInterval(() => {
      void cargarDatos();
    }, 10000);

    return () => {
      clearInterval(intervalo);
    };
  }, [codigoActividad, cargarDatos]);

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

  const obtenerPuntos = (e: EntregaAlumno) =>
    Number(e.ultima_evaluacion?.gamificacion?.puntosTotales) || 0;

  const entregasOrdenadas = [...entregas].sort((a, b) => {
    if (!ordenPorPuntos) return 0;
    const diff = obtenerPuntos(b) - obtenerPuntos(a);
    if (diff !== 0) return diff;
    return a.nombre_alumno.localeCompare(b.nombre_alumno);
  });

  const puntosTotalesGrupo = entregas.reduce((acc, e) => acc + obtenerPuntos(e), 0);
  const metaMision = mision?.metaPuntos && mision.metaPuntos > 0 ? mision.metaPuntos : 400;
  const porcentajeMision = Math.min(100, Math.round((puntosTotalesGrupo / metaMision) * 100));

  return (
    <div className="mt-6 bg-indigo-50/70 border-2 border-indigo-200 rounded-2xl p-5 space-y-4 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-200/80 pb-3">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">
            Aula Interactiva Activa · {tituloActividad}
          </span>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className="text-sm text-slate-700">Código para el alumnado:</span>
            <span className="font-mono text-base font-extrabold bg-indigo-900 text-white px-3 py-0.5 rounded-lg">
              {codigoActividad}
            </span>
            <span
              className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                bloqueoSecuencial
                  ? "bg-indigo-100 text-indigo-950 border-indigo-300"
                  : "bg-slate-200/80 text-slate-800 border-slate-300"
              }`}
            >
              {bloqueoSecuencial ? "🔒 Avance secuencial obligatorio" : "🔓 Avance libre"}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex bg-white p-0.5 rounded-xl border border-indigo-200 text-[11px] font-bold">
            <button
              type="button"
              onClick={() => setOrdenPorPuntos(true)}
              className={`px-2.5 py-1.5 rounded-lg transition cursor-pointer ${
                ordenPorPuntos
                  ? "bg-amber-500 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              🏆 Ranking puntos
            </button>
            <button
              type="button"
              onClick={() => setOrdenPorPuntos(false)}
              className={`px-2.5 py-1.5 rounded-lg transition cursor-pointer ${
                !ordenPorPuntos
                  ? "bg-indigo-700 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              🕒 Recientes
            </button>
          </div>

          <button
            type="button"
            onClick={copiarEnlace}
            className="text-xs font-bold bg-white border border-indigo-300 hover:bg-indigo-100 text-indigo-900 px-3.5 py-2 rounded-xl transition cursor-pointer"
          >
            {copiado ? "✓ Enlace copiado" : "🔗 Copiar enlace para alumnos"}
          </button>
          <button
            type="button"
            onClick={cargarDatos}
            disabled={cargando}
            className="text-xs font-bold bg-indigo-700 hover:bg-indigo-600 text-white px-3.5 py-2 rounded-xl transition cursor-pointer"
          >
            {cargando ? "Actualizando..." : "🔄 Actualizar tabla"}
          </button>
        </div>
      </div>

      {/* Progreso de Misión Colectiva si está activa */}
      {mision?.activa && (
        <div className="bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border border-amber-300 rounded-xl p-3.5 space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-extrabold text-amber-950">
              🗺️ Misión Colectiva: {mision.tituloMision || "Reto de Comprensión"}
            </span>
            <span className="font-extrabold text-amber-900">
              {puntosTotalesGrupo} / {metaMision} pts ({porcentajeMision}%)
            </span>
          </div>
          <div className="w-full bg-amber-200/70 h-2 rounded-full overflow-hidden">
            <div
              className="bg-amber-600 h-full transition-all duration-500"
              style={{ width: `${porcentajeMision}%` }}
            />
          </div>
        </div>
      )}

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
                {ordenPorPuntos && <th className="py-2.5 px-3 text-center w-12">Pos.</th>}
                <th className="py-2.5 px-4">Alumno/a</th>
                <th className="py-2.5 px-3 text-center">Puntos / Nivel</th>
                <th className="py-2.5 px-3 text-center">Progreso General</th>
                <th className="py-2.5 px-3 text-center">Entregas</th>
                <th className="py-2.5 px-3 text-center">1. Comprensión</th>
                <th className="py-2.5 px-3 text-center">2. Expresión</th>
                <th className="py-2.5 px-3 text-center">Media General</th>
                <th className="py-2.5 px-4 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entregasOrdenadas.map((e, index) => {
                const nivelComp = e.nivel_comprension || e.nivel_logro;
                const nivelExpr = e.nivel_expresion || e.nivel_logro;
                const mediaGeneral =
                  e.nivel_comprension && e.nivel_expresion
                    ? calcularMediaNiveles(e.nivel_comprension, e.nivel_expresion)
                    : e.nivel_logro;

                const progreso = e.ultima_evaluacion?.progreso_pasos;
                const gamif = e.ultima_evaluacion?.gamificacion;
                const puntos = obtenerPuntos(e);
                const dominados = progreso?.dominados ?? 0;
                const totalPasos = progreso?.total ?? 0;
                const porcentaje =
                  totalPasos > 0 ? Math.round((dominados / totalPasos) * 100) : 0;
                const todosDominados = totalPasos > 0 && dominados >= totalPasos;

                const medalla =
                  index === 0 && puntos > 0
                    ? "🥇"
                    : index === 1 && puntos > 0
                    ? "🥈"
                    : index === 2 && puntos > 0
                    ? "🥉"
                    : `#${index + 1}`;

                return (
                  <tr key={e.id} className="hover:bg-slate-50/70">
                    {ordenPorPuntos && (
                      <td className="py-2.5 px-3 text-center font-extrabold text-sm">
                        {medalla}
                      </td>
                    )}

                    <td className="py-2.5 px-4 font-semibold text-slate-800">
                      <div>{e.nombre_alumno}</div>
                      {gamif?.insigniasDesbloqueadas &&
                        gamif.insigniasDesbloqueadas.length > 0 && (
                          <div className="flex gap-1 mt-0.5 text-xs">
                            {gamif.insigniasDesbloqueadas.map((ins) => (
                              <span key={ins} title={ins}>
                                {ICONOS_INSIGNIA[ins] || "🏅"}
                              </span>
                            ))}
                          </div>
                        )}
                    </td>

                    <td className="py-2.5 px-3 text-center">
                      <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-950 border border-amber-300 text-xs font-extrabold">
                        ⭐ {puntos} pts
                      </div>
                      {gamif?.nivelLector?.titulo && (
                        <div className="text-[10px] font-semibold text-slate-500 mt-0.5">
                          {gamif.nivelLector.icono} {gamif.nivelLector.titulo}
                        </div>
                      )}
                    </td>

                    <td className="py-2.5 px-3 text-center min-w-[150px]">
                      {totalPasos > 0 ? (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                            <span>
                              {dominados} / {totalPasos} pasos
                            </span>
                            <span className="text-indigo-700">{porcentaje}%</span>
                          </div>
                          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
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
                            <div className="text-[10px] font-semibold text-slate-500 truncate">
                              {todosDominados
                                ? "📤 Pendiente de entrega final"
                                : bloqueoSecuencial
                                ? `✍️ Activa: ${progreso.paso_actual_etiqueta}`
                                : `🔓 ${progreso.paso_actual_etiqueta}`}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">En curso</span>
                      )}
                    </td>

                    <td
                      title="Entregas globales realizadas (comprobar pasos individuales no consume intentos)"
                      className="py-2.5 px-3 text-center font-mono text-slate-600"
                    >
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
                      ) : todosDominados ? (
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-900">
                          📤 Listo para entregar
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