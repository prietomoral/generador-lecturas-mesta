"use client";

import { useState, useEffect, useRef } from "react";
import { FormLectura, ResultadoLectura, obtenerTemaAleatorio } from "./types/lectura";
import FormularioLectura from "./components/FormularioLectura";
import FichaLectura from "./components/FichaLectura";
import VentanaCorrector from "./components/VentanaCorrector";

const TIEMPO_LIMITE_SEGUNDOS = 200;

export default function GeneradorLectura() {
  const [form, setForm] = useState<FormLectura>({
    modoOrigen: "generar",
    tituloPropio: "",
    textoPropio: "",
    edad: "12-14 años (1º-2º ESO)",
    tipoTextoSelect: "Narrativo (cuento o relato)",
    tipoTextoOtro: "",
    dificultad: "Media",
    extension: "Media (250 - 350 palabras)",
    tematica: "La biodiversidad de la dehesa extremeña y el Parque Nacional de Monfragüe",
    saberes: "",
    numLiterales: 3,
    numInferenciales: 2,
  });

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      tematica: obtenerTemaAleatorio(),
    }));
  }, []);

  const [resultado, setResultado] = useState<ResultadoLectura | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [refinando, setRefinando] = useState(false);
  const [segundosRestantes, setSegundosRestantes] = useState(TIEMPO_LIMITE_SEGUNDOS);
  const [avisoExito, setAvisoExito] = useState(false);
  const [ventanaCorrectorAbierta, setVentanaCorrectorAbierta] = useState(false);

  const seccionResultadoRef = useRef<HTMLElement | null>(null);
  const debeHacerScrollRef = useRef(false);

  useEffect(() => {
    if (!cargando) return;
    const intervalo = setInterval(() => {
      setSegundosRestantes((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(intervalo);
  }, [cargando]);

  useEffect(() => {
    if (!resultado || !debeHacerScrollRef.current) return;
    debeHacerScrollRef.current = false;

    const timerScroll = setTimeout(() => {
      seccionResultadoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);

    const timerAviso = setTimeout(() => setAvisoExito(false), 6000);

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch {
      // Silencio si el navegador bloquea el sonido
    }

    return () => {
      clearTimeout(timerScroll);
      clearTimeout(timerAviso);
    };
  }, [resultado]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSegundosRestantes(TIEMPO_LIMITE_SEGUNDOS);
    setCargando(true);
    setResultado(null);
    setAvisoExito(false);

    const tipoTextoFinal =
      form.tipoTextoSelect === "Otro" ? form.tipoTextoOtro : form.tipoTextoSelect;

    const controlador = new AbortController();
    const temporizador = setTimeout(
      () => controlador.abort(),
      TIEMPO_LIMITE_SEGUNDOS * 1000
    );

    try {
      const res = await fetch("/api/generar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, tipoTexto: tipoTextoFinal }),
        signal: controlador.signal,
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Error en la respuesta del servidor");
      }

      const esContenidoPropio =
        (form.modoOrigen === "subir" || form.modoOrigen === "oral") &&
        Boolean(form.textoPropio?.trim());

      const resultadoFinal: ResultadoLectura = esContenidoPropio
        ? {
            ...data,
            titulo: form.tituloPropio?.trim() || data.titulo,
            texto: form.textoPropio!.trim(),
            ...(form.modoOrigen === "oral" && form.mediaUrl
              ? { mediaUrl: form.mediaUrl, mediaTipo: form.mediaTipo }
              : {}),
          }
        : data;

      debeHacerScrollRef.current = true;
      setResultado(resultadoFinal);
      setAvisoExito(true);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        alert(`La petición tardó demasiado (más de ${TIEMPO_LIMITE_SEGUNDOS}s).`);
      } else {
        const mensaje = err instanceof Error ? err.message : "No se pudo generar la actividad.";
        alert("Error: " + mensaje);
      }
    } finally {
      clearTimeout(temporizador);
      setCargando(false);
      setSegundosRestantes(TIEMPO_LIMITE_SEGUNDOS);
    }
  };

  const handleRefinar = async (instruccionRefinamiento: string) => {
    if (!resultado) return;
    setRefinando(true);
    setAvisoExito(false);

    try {
      const res = await fetch("/api/generar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          esRefinamiento: true,
          edad: form.edad,
          resultadoActual: resultado,
          instruccionRefinamiento,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "No se pudo aplicar el ajuste.");
      }

      debeHacerScrollRef.current = true;
      setResultado({
        ...data,
        ...(resultado.mediaUrl
          ? { mediaUrl: resultado.mediaUrl, mediaTipo: resultado.mediaTipo }
          : {}),
      });
      setAvisoExito(true);
    } catch (err: unknown) {
      const mensaje = err instanceof Error ? err.message : "No se pudo ajustar la actividad.";
      alert("Error al ajustar: " + mensaje);
    } finally {
      setRefinando(false);
    }
  };

  const pdfActivo = form.modoOrigen === "subir" ? pdfPreviewUrl : null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-16 print:bg-white print:pb-0">
      <header className="bg-gradient-to-r from-blue-800 via-blue-700 to-indigo-800 text-white shadow-md print:hidden">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase mb-3">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            IESO Sierra la Mesta
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            DialectIA
          </h1>
          <p className="text-blue-100 text-sm sm:text-base font-medium mt-1">
            Entrenador de Competencia Lingüística — Programa NEXO (Educalectura-Educalem)
          </p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 -mt-5 print:mt-0 print:px-0 print:max-w-none">
        <FormularioLectura
          form={form}
          setForm={setForm}
          cargando={cargando}
          segundosRestantes={segundosRestantes}
          onSubmit={handleSubmit}
          onPdfChange={setPdfPreviewUrl}
        />

        {resultado && (
          <>
            <FichaLectura
              resultado={resultado}
              edad={form.edad}
              pdfPreviewUrl={pdfActivo}
              avisoExito={avisoExito}
              onCerrarAviso={() => setAvisoExito(false)}
              onAbrirCorrector={() => setVentanaCorrectorAbierta(true)}
              onRefinarResultado={handleRefinar}
              onActualizarResultado={setResultado}
              refinando={refinando}
              seccionRef={seccionResultadoRef}
            />

            <VentanaCorrector
              key={`corrector-${resultado.titulo}`}
              abierta={ventanaCorrectorAbierta}
              onCerrar={() => setVentanaCorrectorAbierta(false)}
              titulo={resultado.titulo}
              texto={resultado.texto}
              edad={form.edad}
              pdfPreviewUrl={pdfActivo}
              mediaUrl={resultado.mediaUrl || null}
              mediaTipo={resultado.mediaTipo || null}
              preguntasLiterales={resultado.preguntas_literales || []}
              preguntasInferenciales={resultado.preguntas_inferenciales || []}
            />
          </>
        )}
      </main>
    </div>
  );
}