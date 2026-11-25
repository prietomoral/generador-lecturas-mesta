"use client";

import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { MediaTipo, Pregunta } from "../types/lectura";

export interface ActividadGuardada {
  id: string;
  codigo: string;
  titulo: string;
  texto: string;
  edad: string;
  media_url?: string | null;
  media_tipo?: MediaTipo | null;
  preguntas_literales?: Pregunta[];
  preguntas_inferenciales?: Pregunta[];
  bloqueo_secuencial?: boolean;
  resumen_min_palabras?: number;
  resumen_modelo?: string | null;
  created_at: string;
}

interface BibliotecaDocenteProps {
  docenteId: string;
  codigoActivo?: string | null;
  onSeleccionarActividad: (actividad: ActividadGuardada) => void;
  onActividadEliminada?: (codigo: string) => void;
}

export default function BibliotecaDocente({
  docenteId,
  codigoActivo,
  onSeleccionarActividad,
  onActividadEliminada,
}: BibliotecaDocenteProps) {
  const [lecturas, setLecturas] = useState<ActividadGuardada[]>([]);
  const [cargando, setCargando] = useState(true);
  const [copiadoCodigo, setCopiadoCodigo] = useState<string | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);

  const cargarLecturas = useCallback(async () => {
    if (!docenteId) return;
    setCargando(true);
    try {
      const { data, error } = await supabase
        .from("actividades")
        .select(
          "id, codigo, titulo, texto, edad, media_url, media_tipo, preguntas_literales, preguntas_inferenciales, bloqueo_secuencial, resumen_min_palabras, resumen_modelo, created_at"
        )
        .eq("docente_id", docenteId)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setLecturas(data as ActividadGuardada[]);
      }
    } finally {
      setCargando(false);
    }
  }, [docenteId]);

  useEffect(() => {
    let activo = true;
    const iniciar = async () => {
      const { data, error } = await supabase
        .from("actividades")
        .select(
          "id, codigo, titulo, texto, edad, media_url, media_tipo, preguntas_literales, preguntas_inferenciales, bloqueo_secuencial, resumen_min_palabras, resumen_modelo, created_at"
        )
        .eq("docente_id", docenteId)
        .order("created_at", { ascending: false });

      if (!activo) return;
      if (!error && data) {
        setLecturas(data as ActividadGuardada[]);
      }
      setCargando(false);
    };

    if (docenteId) {
      void iniciar();
    }
    return () => {
      activo = false;
    };
  }, [docenteId]);

  const copiarEnlace = (codigo: string) => {
    const url = `${window.location.origin}/alumno?codigo=${codigo}`;
    navigator.clipboard.writeText(url);
    setCopiadoCodigo(codigo);
    setTimeout(() => setCopiadoCodigo(null), 2500);
  };

  const eliminarLectura = async (item: ActividadGuardada) => {
    const confirmado = window.confirm(
      `¿Seguro que quieres eliminar "${item.titulo || item.codigo}" de tu biblioteca?\nEsta acción borrará la lectura y ya no será accesible con ese código.`
    );
    if (!confirmado) return;

    setEliminandoId(item.id);
    try {
      const { error } = await supabase
        .from("actividades")
        .delete()
        .eq("id", item.id)
        .eq("docente_id", docenteId);

      if (error) {
        throw new Error(error.message);
      }

      setLecturas((prev) => prev.filter((l) => l.id !== item.id));
      onActividadEliminada?.(item.codigo);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "No se pudo eliminar la lectura.";
      alert("Error al eliminar: " + msg);
    } finally {
      setEliminandoId(null);
    }
  };

  if (cargando) {
    return (
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200/80 p-8 text-center text-sm text-slate-500">
        Cargando tu biblioteca de lecturas...
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg shadow-slate-200/70 border border-slate-200/80 p-6 sm:p-8 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900">
            📚 Mis Lecturas Preparadas ({lecturas.length})
          </h2>
          <p className="text-xs text-slate-500">
            Prepara tus actividades en casa, pulsa <strong>«Guardar / Compartir con la clase»</strong> y ábrelas aquí en el aula cuando las necesites.
          </p>
        </div>
        <button
          type="button"
          onClick={cargarLecturas}
          className="text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 px-3.5 py-2 rounded-xl transition cursor-pointer"
        >
          🔄 Actualizar lista
        </button>
      </div>

      {lecturas.length === 0 ? (
        <div className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-8 text-center space-y-2">
          <p className="text-sm font-semibold text-slate-700">
            Aún no tienes lecturas guardadas en tu cuenta.
          </p>
          <p className="text-xs text-slate-500">
            Crea una actividad en <strong>✨ Crear / Editar Lectura</strong> y pulsa el botón verde <strong>📢 Guardar y compartir</strong> para que aparezca aquí.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {lecturas.map((item) => {
            const esActiva = codigoActivo === item.codigo;
            const eliminando = eliminandoId === item.id;
            const fecha = new Date(item.created_at).toLocaleDateString("es-ES", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            });

            return (
              <div
                key={item.id}
                className={`rounded-2xl border-2 p-4 transition flex flex-col justify-between gap-3 ${
                  esActiva
                    ? "border-indigo-600 bg-indigo-50/40 shadow-sm"
                    : "border-slate-200 bg-white hover:border-indigo-300"
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-extrabold bg-indigo-900 text-white px-2.5 py-0.5 rounded-md">
                      {item.codigo}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-400">{fecha}</span>
                      <button
                        type="button"
                        disabled={eliminando}
                        onClick={() => eliminarLectura(item)}
                        title="Eliminar lectura de mi biblioteca"
                        className="text-xs text-slate-400 hover:text-rose-600 hover:bg-rose-50 px-1.5 py-0.5 rounded-md transition cursor-pointer disabled:opacity-40"
                      >
                        {eliminando ? "⏳" : "🗑️"}
                      </button>
                    </div>
                  </div>
                  <h3 className="font-bold text-slate-900 line-clamp-2">
                    {item.titulo || "Lectura sin título"}
                  </h3>
                  <p className="text-[11px] text-slate-500">{item.edad}</p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                      {item.bloqueo_secuencial === true
                        ? "🔒 Avance secuencial"
                        : "🔓 Avance libre"}
                    </span>
                    {(item.resumen_min_palabras ?? 0) > 0 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                        📝 Resumen ({item.resumen_min_palabras} pal.)
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => onSeleccionarActividad(item)}
                    className="flex-1 text-xs font-bold bg-indigo-700 hover:bg-indigo-600 text-white px-3 py-2 rounded-xl transition cursor-pointer"
                  >
                    {esActiva ? "✅ Abierta abajo" : "🚀 Abrir en clase"}
                  </button>
                  <button
                    type="button"
                    onClick={() => copiarEnlace(item.codigo)}
                    className="text-xs font-bold bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 px-3 py-2 rounded-xl transition cursor-pointer"
                  >
                    {copiadoCodigo === item.codigo ? "✓ Copiado" : "🔗 Enlace"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}