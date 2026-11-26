"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
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
  const [busqueda, setBusqueda] = useState("");
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

  const lecturasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return lecturas;
    return lecturas.filter(
      (item) =>
        (item.titulo || "").toLowerCase().includes(q) ||
        item.codigo.toLowerCase().includes(q) ||
        (item.edad || "").toLowerCase().includes(q)
    );
  }, [lecturas, busqueda]);

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
      <div className="bg-white rounded-3xl shadow-xl shadow-slate-300/40 border border-slate-200/90 p-10 text-center space-y-3">
        <div className="w-7 h-7 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-base font-semibold text-slate-600">
          Cargando tu biblioteca de lecturas...
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl shadow-xl shadow-slate-300/40 border border-slate-200/90 p-6 sm:p-9 space-y-6">
      {/* Cabecera de la biblioteca */}
      <div className="flex flex-wrap items-start sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div className="space-y-1">
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900">
            📚 Mis Lecturas Preparadas ({lecturas.length})
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Prepara tus actividades con antelación, pulsa{" "}
            <strong className="text-slate-800">«Guardar / Compartir con la clase»</strong> y ábrelas aquí en el aula cuando las necesites.
          </p>
        </div>

        <button
          type="button"
          onClick={cargarLecturas}
          className="text-xs sm:text-sm font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300/80 px-4 py-2.5 rounded-xl transition cursor-pointer shrink-0"
        >
          🔄 Actualizar lista
        </button>
      </div>

      {/* Buscador rápido cuando hay lecturas */}
      {lecturas.length > 0 && (
        <div className="relative">
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="🔍 Buscar por título, código de clase o nivel educativo (ej: 1º ESO)..."
            className="w-full bg-slate-50 focus:bg-white border border-slate-300 text-slate-900 text-base rounded-2xl px-4 py-3 pr-24 shadow-2xs focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-600 transition"
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => setBusqueda("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500 hover:text-slate-900 bg-slate-200/70 px-2.5 py-1 rounded-lg cursor-pointer"
            >
              Limpiar
            </button>
          )}
        </div>
      )}

      {lecturas.length === 0 ? (
        <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl p-10 text-center space-y-2.5">
          <p className="text-base font-bold text-slate-800">
            Aún no tienes lecturas guardadas en tu cuenta.
          </p>
          <p className="text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
            Crea una actividad en <strong>✨ Crear / Editar Lectura</strong> y pulsa el botón verde{" "}
            <strong>📢 Guardar y compartir</strong> para que aparezca aquí disponible en cualquier dispositivo.
          </p>
        </div>
      ) : lecturasFiltradas.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 text-center space-y-2">
          <p className="text-base font-bold text-slate-800">
            No hay lecturas que coincidan con «{busqueda}».
          </p>
          <button
            type="button"
            onClick={() => setBusqueda("")}
            className="text-sm font-bold text-indigo-700 hover:underline cursor-pointer"
          >
            Mostrar todas las lecturas ({lecturas.length})
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {lecturasFiltradas.map((item) => {
            const esActiva = codigoActivo === item.codigo;
            const eliminando = eliminandoId === item.id;
            const totalPreguntas =
              (item.preguntas_literales?.length || 0) +
              (item.preguntas_inferenciales?.length || 0);
            const fecha = new Date(item.created_at).toLocaleDateString("es-ES", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            });

            return (
              <div
                key={item.id}
                className={`rounded-2xl border-2 p-5 transition flex flex-col justify-between gap-4 ${
                  esActiva
                    ? "border-indigo-600 bg-indigo-50/40 shadow-md shadow-indigo-900/5"
                    : "border-slate-200 bg-white hover:border-indigo-300 hover:shadow-sm"
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs sm:text-sm font-extrabold bg-indigo-900 text-white px-3 py-1 rounded-lg tracking-wide">
                        {item.codigo}
                      </span>
                      {item.media_url && (
                        <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-teal-100 text-teal-900 border border-teal-200">
                          🎧 Oral
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-500">{fecha}</span>
                      <button
                        type="button"
                        disabled={eliminando}
                        onClick={() => eliminarLectura(item)}
                        title="Eliminar lectura de mi biblioteca"
                        className="text-sm text-slate-400 hover:text-rose-600 hover:bg-rose-50 px-2 py-1 rounded-lg transition cursor-pointer disabled:opacity-40"
                      >
                        {eliminando ? "⏳" : "🗑️"}
                      </button>
                    </div>
                  </div>

                  <h3 className="text-base sm:text-lg font-extrabold text-slate-900 leading-snug line-clamp-2">
                    {item.titulo || "Lectura sin título"}
                  </h3>

                  <p className="text-xs sm:text-sm font-medium text-slate-600">
                    🎓 {item.edad}
                  </p>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-800 border border-slate-200/80">
                      {item.bloqueo_secuencial === true
                        ? "🔒 Avance secuencial"
                        : "🔓 Avance libre"}
                    </span>
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-50 text-blue-900 border border-blue-200/80">
                      ❓ {totalPreguntas} preguntas
                    </span>
                    {(item.resumen_min_palabras ?? 0) > 0 && (
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-950 border border-amber-200">
                        📝 Resumen ({item.resumen_min_palabras} pal.)
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => onSeleccionarActividad(item)}
                    className="flex-1 text-xs sm:text-sm font-extrabold bg-indigo-700 hover:bg-indigo-600 text-white px-4 py-2.5 rounded-xl shadow-2xs transition cursor-pointer"
                  >
                    {esActiva ? "✅ Abierta abajo" : "🚀 Abrir en clase"}
                  </button>
                  <button
                    type="button"
                    onClick={() => copiarEnlace(item.codigo)}
                    className="text-xs sm:text-sm font-bold bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 px-3.5 py-2.5 rounded-xl transition cursor-pointer"
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