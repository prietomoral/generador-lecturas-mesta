"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../lib/supabase";

const MAX_INTENTOS = 10;

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

interface Pregunta {
  pregunta: string;
  respuesta: string;
}

interface Actividad {
  codigo: string;
  titulo: string;
  texto: string;
  edad: string;
  pdf_url?: string | null;
  media_url?: string | null;
  media_tipo?: "youtube" | "video" | "audio" | null;
  preguntas_literales: Pregunta[];
  preguntas_inferenciales: Pregunta[];
  resumen_min_palabras?: number | null;
  resumen_modelo?: string | null;
}

interface CorreccionItem {
  nivel_comprension: string;
  nivel_expresion: string;
  nivel_media?: string;
  estado: string;
  pista_comprension: string;
  consejo_redaccion: string;
}

interface ResultadoCorreccion {
  nivel_global: string;
  nivel_comprension_global: string;
  nivel_expresion_global: string;
  comentario_general: string;
  correcciones_literales: CorreccionItem[];
  correcciones_inferenciales: CorreccionItem[];
  correccion_resumen?: CorreccionItem | null;
}

function contarPalabras(texto: string): number {
  const limpio = (texto || "").trim();
  if (!limpio) return 0;
  return limpio.split(/\s+/).filter(Boolean).length;
}

function VistaAlumnoContenido() {
  const searchParams = useSearchParams();
  const [codigo, setCodigo] = useState(searchParams.get("codigo") || "");
  const [nombreAlumno, setNombreAlumno] = useState("");
  const [actividad, setActividad] = useState<Actividad | null>(null);
  const [respLiterales, setRespLiterales] = useState<string[]>([]);
  const [respInferenciales, setRespInferenciales] = useState<string[]>([]);
  const [respResumen, setRespResumen] = useState("");
  const [evaluacion, setEvaluacion] = useState<ResultadoCorreccion | null>(null);
  const [intentos, setIntentos] = useState(0);
  const [superada, setSuperada] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [vistaLectura, setVistaLectura] = useState<"original" | "texto">("original");

  const sinIntentos = intentos >= MAX_INTENTOS && !superada;
  const bloqueado = superada || sinIntentos;

  const minPalabrasResumen = Number(actividad?.resumen_min_palabras) || 0;
  const requiereResumen = minPalabrasResumen > 0;
  const palabrasActualesResumen = contarPalabras(respResumen);
  const resumenCumpleMinimo =
    !requiereResumen || palabrasActualesResumen >= minPalabrasResumen;
  const palabrasFaltantes = Math.max(0, minPalabrasResumen - palabrasActualesResumen);

  const parrafosTexto = (actividad?.texto || "")
    .replace(/\\n/g, "\n")
    .split(/\r?\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const entrarActividad = async (e: React.FormEvent) => {
    e.preventDefault();
    const codLimpio = codigo.trim().toUpperCase();
    const nomLimpio = nombreAlumno.trim();
    if (!codLimpio || !nomLimpio) return;

    setCargando(true);
    try {
      const { data: act, error } = await supabase
        .from("actividades")
        .select("*")
        .eq("codigo", codLimpio)
        .single();

      if (error || !act) {
        alert("No existe ninguna actividad con ese código.");
        return;
      }

      setActividad(act as Actividad);

      const { data: entregaPrevia } = await supabase
        .from("entregas")
        .select("*")
        .eq("actividad_codigo", codLimpio)
        .eq("nombre_alumno", nomLimpio)
        .maybeSingle();

      if (entregaPrevia) {
        setRespLiterales(entregaPrevia.respuestas_literales || []);
        setRespInferenciales(entregaPrevia.respuestas_inferenciales || []);
        setRespResumen(entregaPrevia.respuesta_resumen || "");
        setEvaluacion(entregaPrevia.ultima_evaluacion || null);
        setIntentos(entregaPrevia.intentos || 0);
        setSuperada(Boolean(entregaPrevia.superada));
      } else {
        setRespLiterales((act.preguntas_literales || []).map(() => ""));
        setRespInferenciales((act.preguntas_inferenciales || []).map(() => ""));
        setRespResumen("");
      }
    } finally {
      setCargando(false);
    }
  };

  const enviarIntento = async () => {
    if (!actividad || bloqueado) return;

    if (requiereResumen && !resumenCumpleMinimo) {
      alert(
        `El resumen es obligatorio y debe tener al menos ${minPalabrasResumen} palabras (llevas ${palabrasActualesResumen}).`
      );
      return;
    }

    const hayRespuesta =
      respLiterales.some((r) => r.trim().length > 0) ||
      respInferenciales.some((r) => r.trim().length > 0) ||
      (requiereResumen && respResumen.trim().length > 0);

    if (!hayRespuesta) {
      alert("Escribe tus respuestas antes de pedir ayuda al entrenador.");
      return;
    }

    setCorrigiendo(true);
    const nuevoIntento = intentos + 1;

    try {
      const res = await fetch("/api/corregir-lectura", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: actividad.titulo,
          texto: actividad.texto,
          edad: actividad.edad,
          intentoActual: nuevoIntento,
          preguntas_literales: actividad.preguntas_literales,
          preguntas_inferenciales: actividad.preguntas_inferenciales,
          respuestasAlumnoLiterales: respLiterales,
          respuestasAlumnoInferenciales: respInferenciales,
          resumenMinPalabras: minPalabrasResumen,
          resumenModelo: actividad.resumen_modelo || "",
          respuestaAlumnoResumen: requiereResumen ? respResumen : undefined,
        }),
      });

      const data: ResultadoCorreccion & { error?: string } = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Error al evaluar");

      const compGlobal = data.nivel_comprension_global || data.nivel_global;
      const exprGlobal = data.nivel_expresion_global || data.nivel_global;
      const mediaGlobal = calcularMediaNiveles(compGlobal, exprGlobal);

      const compOk =
        compGlobal === "Conseguido" || compGlobal === "Altamente Conseguido";
      const exprOk =
        exprGlobal === "Conseguido" || exprGlobal === "Altamente Conseguido";
      const estaSuperada = compOk && exprOk;

      const { error: errorUpsert } = await supabase.from("entregas").upsert(
        {
          actividad_codigo: actividad.codigo,
          nombre_alumno: nombreAlumno.trim(),
          intentos: nuevoIntento,
          nivel_logro: mediaGlobal,
          nivel_comprension: compGlobal,
          nivel_expresion: exprGlobal,
          superada: estaSuperada,
          respuestas_literales: respLiterales,
          respuestas_inferenciales: respInferenciales,
          respuesta_resumen: requiereResumen ? respResumen : null,
          ultima_evaluacion: {
            ...data,
            nivel_global: mediaGlobal,
            nivel_comprension_global: compGlobal,
            nivel_expresion_global: exprGlobal,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "actividad_codigo,nombre_alumno" }
      );

      if (errorUpsert) {
        console.error("Error guardando progreso en Supabase:", errorUpsert.message);
      }

      setIntentos(nuevoIntento);
      setEvaluacion({
        ...data,
        nivel_global: mediaGlobal,
        nivel_comprension_global: compGlobal,
        nivel_expresion_global: exprGlobal,
      });
      setSuperada(estaSuperada);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error inesperado.";
      alert("Error: " + msg);
    } finally {
      setCorrigiendo(false);
    }
  };

  const estiloNivel = (nivel: string) => {
    switch (nivel) {
      case "Altamente Conseguido":
        return "bg-emerald-100 text-emerald-950 border-emerald-400";
      case "Conseguido":
        return "bg-teal-100 text-teal-950 border-teal-400";
      case "Bajamente Conseguido":
        return "bg-amber-100 text-amber-950 border-amber-400";
      default:
        return "bg-rose-100 text-rose-950 border-rose-400";
    }
  };

  const renderBloqueFeedbackEstructurado = (
    corr: CorreccionItem,
    subtituloComp: string,
    subtituloExpr: string
  ) => {
    const mediaItem =
      corr.nivel_media ||
      calcularMediaNiveles(corr.nivel_comprension, corr.nivel_expresion);

    return (
      <div className="space-y-2.5 pt-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {/* Apartado 1: Comprensión + Indicador debajo */}
          <div className="bg-blue-50/80 border border-blue-200 rounded-lg p-3 flex flex-col justify-between gap-2.5 text-blue-950">
            <div className="text-xs leading-relaxed">
              <strong className="block text-blue-900 mb-1">
                🧭 {subtituloComp}
              </strong>
              <p>{corr.pista_comprension}</p>
            </div>
            <div className="pt-2 border-t border-blue-200/80 flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-blue-900">
                Indicador de logro:
              </span>
              <span
                className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border ${estiloNivel(
                  corr.nivel_comprension
                )}`}
              >
                {corr.nivel_comprension}
              </span>
            </div>
          </div>

          {/* Apartado 2: Expresión escrita + Indicador debajo */}
          <div className="bg-indigo-50/80 border border-indigo-200 rounded-lg p-3 flex flex-col justify-between gap-2.5 text-indigo-950">
            <div className="text-xs leading-relaxed">
              <strong className="block text-indigo-900 mb-1">
                ✍️ {subtituloExpr}
              </strong>
              <p>{corr.consejo_redaccion}</p>
            </div>
            <div className="pt-2 border-t border-indigo-200/80 flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-indigo-900">
                Indicador de logro:
              </span>
              <span
                className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border ${estiloNivel(
                  corr.nivel_expresion
                )}`}
              >
                {corr.nivel_expresion}
              </span>
            </div>
          </div>
        </div>

        {/* Valoración media de ambos apartados */}
        <div className="bg-slate-100/90 border border-slate-300 rounded-lg px-3 py-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-700">
            ⚖️ Valoración media de la respuesta (Comprensión + Expresión):
          </span>
          <span
            className={`text-xs font-extrabold px-3 py-0.5 rounded-full border ${estiloNivel(
              mediaItem
            )}`}
          >
            {mediaItem}
          </span>
        </div>
      </div>
    );
  };

  if (!actividad) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <form
          onSubmit={entrarActividad}
          className="bg-white max-w-md w-full rounded-2xl shadow-lg border border-slate-200 p-6 space-y-4"
        >
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 block">
              DialectIA · IESO Sierra la Mesta
            </span>
            <span className="text-xs text-slate-500 block">
              Entrenador de Competencia Lingüística — Programa NEXO (Educalectura-Educalem)
            </span>
          </div>
          <h1 className="text-xl font-extrabold text-slate-900">
            Acceder a la actividad de clase
          </h1>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Código de la actividad
            </label>
            <input
              type="text"
              required
              placeholder="Ej: MESTA-482"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm uppercase font-mono"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Tu nombre y apellidos
            </label>
            <input
              type="text"
              required
              placeholder="Ej: María García López"
              value={nombreAlumno}
              onChange={(e) => setNombreAlumno(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={cargando}
            className="w-full bg-indigo-700 hover:bg-indigo-600 text-white font-bold py-3 rounded-xl transition cursor-pointer"
          >
            {cargando ? "Cargando actividad..." : "Entrar y comenzar"}
          </button>
        </form>
      </div>
    );
  }

  const mediaGlobalActual = evaluacion
    ? calcularMediaNiveles(
        evaluacion.nivel_comprension_global || evaluacion.nivel_global,
        evaluacion.nivel_expresion_global || evaluacion.nivel_global
      )
    : "";

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 mb-0.5">
              DialectIA · IESO Sierra la Mesta · Programa NEXO (Educalectura-Educalem)
            </div>
            <div className="text-xs text-slate-500">
              Alumno/a: <strong className="text-slate-900">{nombreAlumno}</strong> · Código:{" "}
              <span className="font-mono font-bold">{actividad.codigo}</span>
            </div>
            <h1 className="text-lg font-extrabold text-slate-900">{actividad.titulo}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-800 border border-slate-200">
              Intento: {intentos} / {MAX_INTENTOS}
            </span>
            {superada && (
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-100 text-emerald-950 border border-emerald-300">
                🏆 {mediaGlobalActual || "Conseguido"}
              </span>
            )}
            {sinIntentos && (
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-rose-100 text-rose-900 border border-rose-300">
                ⛔ Límite de 10 intentos alcanzado
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 h-fit">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {actividad.media_url ? "Recurso audiovisual" : "Documento de lectura"}
              </h2>
              {!actividad.media_url && actividad.pdf_url && (
                <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setVistaLectura("original")}
                    className={`px-2 py-1 rounded-md transition cursor-pointer ${
                      vistaLectura === "original"
                        ? "bg-indigo-600 text-white shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    📑 Documento original
                  </button>
                  <button
                    type="button"
                    onClick={() => setVistaLectura("texto")}
                    className={`px-2 py-1 rounded-md transition cursor-pointer ${
                      vistaLectura === "texto"
                        ? "bg-indigo-600 text-white shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    📝 Solo texto
                  </button>
                </div>
              )}
            </div>

            {actividad.media_url ? (
              <div className="space-y-3">
                {actividad.media_tipo === "youtube" && (
                  <div className="w-full aspect-video rounded-xl overflow-hidden border border-slate-300 bg-black shadow-inner">
                    <iframe
                      src={actividad.media_url}
                      title={actividad.titulo}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="w-full h-full"
                    />
                  </div>
                )}
                {actividad.media_tipo === "video" && (
                  <video
                    controls
                    src={actividad.media_url}
                    className="w-full rounded-xl border border-slate-300 bg-black"
                  />
                )}
                {actividad.media_tipo === "audio" && (
                  <div className="bg-teal-50/70 border border-teal-200 rounded-xl p-4">
                    <audio controls src={actividad.media_url} className="w-full" />
                  </div>
                )}
                <p className="text-xs text-slate-500">
                  Escucha atentamente el audio o vídeo tantas veces como necesites antes de responder.
                </p>
              </div>
            ) : actividad.pdf_url && vistaLectura === "original" ? (
              <div className="w-full h-[520px] rounded-xl overflow-hidden border border-slate-300 bg-slate-200 shadow-inner">
                <iframe
                  src={`${actividad.pdf_url}#toolbar=1&navpanes=0`}
                  title={actividad.titulo}
                  className="w-full h-full"
                />
              </div>
            ) : (
              <div className="space-y-3.5 text-sm leading-relaxed text-slate-800 text-justify">
                {parrafosTexto.map((parrafo, idx) => (
                  <p key={idx} className="indent-3">
                    {parrafo}
                  </p>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 space-y-5">
            {/* PANEL DESGLOSADO DE RESULTADOS GLOBALES */}
            {evaluacion && (
              <div className="border-2 border-slate-300 bg-slate-50/70 rounded-2xl p-4 space-y-3">
                <div className="font-extrabold text-sm sm:text-base text-slate-900">
                  Resultados Globales (intento {intentos} de {MAX_INTENTOS})
                </div>

                <p className="text-sm leading-relaxed text-slate-700">
                  {evaluacion.comentario_general}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-white border border-blue-200 rounded-xl p-3 flex flex-col justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wider text-blue-800">
                        1. {actividad.media_url ? "Comprensión Oral" : "Comprensión Lectora"} (Fondo)
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Exactitud y acierto respecto al contenido.
                      </p>
                    </div>
                    <div className="pt-2 border-t border-blue-100 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-blue-900">
                        Indicador:
                      </span>
                      <span
                        className={`text-xs font-extrabold px-2.5 py-0.5 rounded-full border ${estiloNivel(
                          evaluacion.nivel_comprension_global || evaluacion.nivel_global
                        )}`}
                      >
                        {evaluacion.nivel_comprension_global || evaluacion.nivel_global}
                      </span>
                    </div>
                  </div>

                  <div className="bg-white border border-indigo-200 rounded-xl p-3 flex flex-col justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-800">
                        2. Expresión Escrita / Redacción (Forma)
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Ortografía, gramática, puntuación y coherencia textual.
                      </p>
                    </div>
                    <div className="pt-2 border-t border-indigo-100 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-indigo-900">
                        Indicador:
                      </span>
                      <span
                        className={`text-xs font-extrabold px-2.5 py-0.5 rounded-full border ${estiloNivel(
                          evaluacion.nivel_expresion_global || evaluacion.nivel_global
                        )}`}
                      >
                        {evaluacion.nivel_expresion_global || evaluacion.nivel_global}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Valoración general (media de ambos) */}
                <div className="bg-white border-2 border-slate-300 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800 block">
                      Valoración General (Media de Comprensión y Expresión)
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Calculada a partir de los dos indicadores independientes
                    </span>
                  </div>
                  <span
                    className={`px-3.5 py-1 rounded-full text-xs sm:text-sm font-extrabold border ${estiloNivel(
                      mediaGlobalActual
                    )}`}
                  >
                    {mediaGlobalActual}
                  </span>
                </div>

                {!superada && !sinIntentos && (
                  <p className="text-xs font-bold text-indigo-900 pt-0.5">
                    💡 Para superar la actividad debes alcanzar al menos <strong>Conseguido</strong> en ambos indicadores (te quedan {MAX_INTENTOS - intentos} intentos).
                  </p>
                )}
                {sinIntentos && (
                  <p className="text-xs font-bold text-rose-900 pt-0.5">
                    Has completado los 10 intentos disponibles. Tu docente revisará tu evolución y tus respuestas guardadas.
                  </p>
                )}
              </div>
            )}

            {/* Preguntas literales */}
            {(actividad.preguntas_literales || []).map((item, idx) => {
              const corr = evaluacion?.correcciones_literales?.[idx];
              return (
                <div key={`L-${idx}`} className="border border-slate-200 rounded-xl p-4 space-y-2.5">
                  <label className="block text-sm font-semibold text-slate-900">
                    L{idx + 1}. {item.pregunta}
                  </label>
                  <textarea
                    rows={2}
                    disabled={bloqueado}
                    placeholder="Redacta una oración completa..."
                    value={respLiterales[idx] || ""}
                    onChange={(e) => {
                      const copia = [...respLiterales];
                      copia[idx] = e.target.value;
                      setRespLiterales(copia);
                    }}
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-sm disabled:bg-slate-100"
                  />
                  {corr &&
                    renderBloqueFeedbackEstructurado(
                      corr,
                      "Comprensión (fondo y contenido):",
                      "Expresión escrita (ortografía, gramática y coherencia):"
                    )}
                </div>
              );
            })}

            {/* Preguntas inferenciales */}
            {(actividad.preguntas_inferenciales || []).map((item, idx) => {
              const corr = evaluacion?.correcciones_inferenciales?.[idx];
              return (
                <div key={`I-${idx}`} className="border border-slate-200 rounded-xl p-4 space-y-2.5">
                  <label className="block text-sm font-semibold text-slate-900">
                    I{idx + 1}. {item.pregunta}
                  </label>
                  <textarea
                    rows={2}
                    disabled={bloqueado}
                    placeholder="Redacta tu respuesta razonada..."
                    value={respInferenciales[idx] || ""}
                    onChange={(e) => {
                      const copia = [...respInferenciales];
                      copia[idx] = e.target.value;
                      setRespInferenciales(copia);
                    }}
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-sm disabled:bg-slate-100"
                  />
                  {corr &&
                    renderBloqueFeedbackEstructurado(
                      corr,
                      "Comprensión (fondo y deducción):",
                      "Expresión escrita (ortografía, gramática y coherencia):"
                    )}
                </div>
              );
            })}

            {/* Actividad final: Redacción de resumen obligatoria */}
            {requiereResumen && (
              <div className="border-2 border-amber-200 bg-amber-50/30 rounded-xl p-4 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-900 bg-amber-100 px-2.5 py-1 rounded-lg">
                    Actividad Final · Redacción de Resumen (Obligatorio)
                  </span>
                  <span
                    className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                      resumenCumpleMinimo
                        ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                        : "bg-amber-100 text-amber-950 border-amber-300"
                    }`}
                  >
                    {palabrasActualesResumen} / {minPalabrasResumen} palabras{" "}
                    {resumenCumpleMinimo ? "✓" : `(faltan ${palabrasFaltantes})`}
                  </span>
                </div>

                <label className="block text-sm font-semibold text-slate-900">
                  Redacta con tus propias palabras un resumen completo del texto (mínimo{" "}
                  {minPalabrasResumen} palabras):
                </label>

                <textarea
                  rows={5}
                  disabled={bloqueado}
                  placeholder={`Escribe aquí tu resumen (debes escribir al menos ${minPalabrasResumen} palabras para poder enviarlo)...`}
                  value={respResumen}
                  onChange={(e) => setRespResumen(e.target.value)}
                  className="w-full bg-white border border-amber-300 rounded-lg p-3 text-sm leading-relaxed disabled:bg-slate-100"
                />

                {!bloqueado && !resumenCumpleMinimo && (
                  <p className="text-xs font-semibold text-amber-900">
                    ⚠️ Requisito obligatorio: escribe al menos {palabrasFaltantes}{" "}
                    {palabrasFaltantes === 1 ? "palabra más" : "palabras más"} para habilitar el envío.
                  </p>
                )}

                {evaluacion?.correccion_resumen &&
                  renderBloqueFeedbackEstructurado(
                    evaluacion.correccion_resumen,
                    "Comprensión (síntesis de ideas principales):",
                    "Expresión escrita (ortografía, puntuación y cohesión):"
                  )}
              </div>
            )}

            {!bloqueado && (
              <button
                type="button"
                disabled={corrigiendo || !resumenCumpleMinimo}
                title={
                  !resumenCumpleMinimo
                    ? `Completa el resumen (faltan ${palabrasFaltantes} palabras)`
                    : undefined
                }
                onClick={enviarIntento}
                className="w-full py-3 rounded-xl bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-400 disabled:cursor-not-allowed text-white font-bold text-sm transition cursor-pointer"
              >
                {corrigiendo
                  ? "Analizando comprensión y redacción..."
                  : !resumenCumpleMinimo
                  ? `🔒 Completa el resumen (faltan ${palabrasFaltantes} palabras)`
                  : intentos > 0
                  ? `🔄 Revisar mejora (Intento ${intentos + 1} de ${MAX_INTENTOS})`
                  : `🧭 Enviar al entrenador (Intento 1 de ${MAX_INTENTOS})`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PaginaAlumno() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Cargando entrenador...</div>}>
      <VistaAlumnoContenido />
    </Suspense>
  );
}