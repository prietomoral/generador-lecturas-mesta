"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../lib/supabase";

const MAX_INTENTOS = 10;

interface Pregunta {
  pregunta: string;
  respuesta: string;
}

interface Actividad {
  codigo: string;
  titulo: string;
  texto: string;
  edad: string;
  preguntas_literales: Pregunta[];
  preguntas_inferenciales: Pregunta[];
}

interface CorreccionItem {
  nivel_pregunta: string;
  estado: string;
  pista_comprension: string;
  consejo_redaccion: string;
}

interface ResultadoCorreccion {
  nivel_global: string;
  comentario_general: string;
  correcciones_literales: CorreccionItem[];
  correcciones_inferenciales: CorreccionItem[];
}

function VistaAlumnoContenido() {
  const searchParams = useSearchParams();
  const [codigo, setCodigo] = useState(searchParams.get("codigo") || "");
  const [nombreAlumno, setNombreAlumno] = useState("");
  const [actividad, setActividad] = useState<Actividad | null>(null);
  const [respLiterales, setRespLiterales] = useState<string[]>([]);
  const [respInferenciales, setRespInferenciales] = useState<string[]>([]);
  const [evaluacion, setEvaluacion] = useState<ResultadoCorreccion | null>(null);
  const [intentos, setIntentos] = useState(0);
  const [superada, setSuperada] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [corrigiendo, setCorrigiendo] = useState(false);

  const sinIntentos = intentos >= MAX_INTENTOS && !superada;
  const bloqueado = superada || sinIntentos;

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
        setEvaluacion(entregaPrevia.ultima_evaluacion || null);
        setIntentos(entregaPrevia.intentos || 0);
        setSuperada(Boolean(entregaPrevia.superada));
      } else {
        setRespLiterales((act.preguntas_literales || []).map(() => ""));
        setRespInferenciales((act.preguntas_inferenciales || []).map(() => ""));
      }
    } finally {
      setCargando(false);
    }
  };

  const enviarIntento = async () => {
    if (!actividad || bloqueado) return;

    const hayRespuesta =
      respLiterales.some((r) => r.trim().length > 0) ||
      respInferenciales.some((r) => r.trim().length > 0);

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
        }),
      });

      const data: ResultadoCorreccion & { error?: string } = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Error al evaluar");

      const estaSuperada =
        data.nivel_global === "Conseguido" ||
        data.nivel_global === "Altamente Conseguido";

      const { error: errorUpsert } = await supabase.from("entregas").upsert(
        {
          actividad_codigo: actividad.codigo,
          nombre_alumno: nombreAlumno.trim(),
          intentos: nuevoIntento,
          nivel_logro: data.nivel_global,
          superada: estaSuperada,
          respuestas_literales: respLiterales,
          respuestas_inferenciales: respInferenciales,
          ultima_evaluacion: data,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "actividad_codigo,nombre_alumno" }
      );

      if (errorUpsert) {
        console.error("Error guardando progreso en Supabase:", errorUpsert.message);
      }

      setIntentos(nuevoIntento);
      setEvaluacion(data);
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

  if (!actividad) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <form
          onSubmit={entrarActividad}
          className="bg-white max-w-md w-full rounded-2xl shadow-lg border border-slate-200 p-6 space-y-4"
        >
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">
            IESO Sierra la Mesta · Entrenador de Lectura
          </span>
          <h1 className="text-xl font-extrabold text-slate-900">
            Acceder a la lectura de clase
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
            {cargando ? "Cargando lectura..." : "Entrar y comenzar"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div>
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
                🏆 {evaluacion?.nivel_global || "Conseguido"}
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
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
              Texto de lectura
            </h2>
            <div className="space-y-3.5 text-sm leading-relaxed text-slate-800 text-justify">
              {parrafosTexto.map((parrafo, idx) => (
                <p key={idx} className="indent-3">
                  {parrafo}
                </p>
              ))}
            </div>
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 space-y-5">
            {evaluacion && (
              <div
                className={`border-2 rounded-xl p-4 space-y-1.5 ${estiloNivel(
                  evaluacion.nivel_global
                )}`}
              >
                <div className="font-extrabold text-base">
                  Valoración global (intento {intentos} de {MAX_INTENTOS}):{" "}
                  <span className="underline">{evaluacion.nivel_global}</span>
                </div>
                <p className="text-sm leading-relaxed">{evaluacion.comentario_general}</p>
                {!superada && !sinIntentos && (
                  <p className="text-xs font-bold pt-1">
                    💡 Usa las pistas de comprensión y los consejos de redacción de abajo para mejorar tus respuestas (te quedan {MAX_INTENTOS - intentos} intentos).
                  </p>
                )}
                {sinIntentos && (
                  <p className="text-xs font-bold pt-1">
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
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-sm font-semibold text-slate-900">
                      L{idx + 1}. {item.pregunta}
                    </label>
                    {corr && (
                      <span
                        className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${estiloNivel(
                          corr.nivel_pregunta
                        )}`}
                      >
                        {corr.nivel_pregunta}
                      </span>
                    )}
                  </div>
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
                  {corr && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      <div className="text-xs bg-blue-50/80 border border-blue-200 rounded-lg p-2.5 text-blue-950">
                        <strong className="block text-blue-800 mb-0.5">
                          🧭 Pista de comprensión:
                        </strong>
                        {corr.pista_comprension}
                      </div>
                      <div className="text-xs bg-indigo-50/80 border border-indigo-200 rounded-lg p-2.5 text-indigo-950">
                        <strong className="block text-indigo-800 mb-0.5">
                          ✍️ Entrenamiento de redacción:
                        </strong>
                        {corr.consejo_redaccion}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Preguntas inferenciales */}
            {(actividad.preguntas_inferenciales || []).map((item, idx) => {
              const corr = evaluacion?.correcciones_inferenciales?.[idx];
              return (
                <div key={`I-${idx}`} className="border border-slate-200 rounded-xl p-4 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-sm font-semibold text-slate-900">
                      I{idx + 1}. {item.pregunta}
                    </label>
                    {corr && (
                      <span
                        className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${estiloNivel(
                          corr.nivel_pregunta
                        )}`}
                      >
                        {corr.nivel_pregunta}
                      </span>
                    )}
                  </div>
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
                  {corr && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      <div className="text-xs bg-blue-50/80 border border-blue-200 rounded-lg p-2.5 text-blue-950">
                        <strong className="block text-blue-800 mb-0.5">
                          🧭 Pista de comprensión:
                        </strong>
                        {corr.pista_comprension}
                      </div>
                      <div className="text-xs bg-indigo-50/80 border border-indigo-200 rounded-lg p-2.5 text-indigo-950">
                        <strong className="block text-indigo-800 mb-0.5">
                          ✍️ Entrenamiento de redacción:
                        </strong>
                        {corr.consejo_redaccion}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {!bloqueado && (
              <button
                type="button"
                disabled={corrigiendo}
                onClick={enviarIntento}
                className="w-full py-3 rounded-xl bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-400 text-white font-bold text-sm transition cursor-pointer"
              >
                {corrigiendo
                  ? "Analizando comprensión y redacción..."
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