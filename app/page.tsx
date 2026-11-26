"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import type { User } from "@supabase/supabase-js";
import { FormLectura, ResultadoLectura, obtenerTemaAleatorio } from "./types/lectura";
import { supabase } from "./lib/supabase";
import FormularioLectura from "./components/FormularioLectura";
import FichaLectura from "./components/FichaLectura";
import VentanaCorrector from "./components/VentanaCorrector";
import BibliotecaDocente, { ActividadGuardada } from "./components/BibliotecaDocente";

const TIEMPO_LIMITE_SEGUNDOS = 200;

export default function GeneradorLectura() {
  const [usuarioDocente, setUsuarioDocente] = useState<User | null>(null);
  const [pestanaPrincipal, setPestanaPrincipal] = useState<"crear" | "biblioteca">("crear");
  const [codigoActividadSeleccionada, setCodigoActividadSeleccionada] = useState<string | null>(
    null
  );

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
    incluirResumen: false,
    minPalabrasResumen: 60,
    bloqueo_secuencial: false,
  });

  useEffect(() => {
    queueMicrotask(() => {
      setForm((prev) => ({
        ...prev,
        tematica: obtenerTemaAleatorio(),
      }));
    });
  }, []);

  // Gestión de sesión Google del docente
  useEffect(() => {
    let activo = true;
    const cargarSesion = async () => {
      const { data } = await supabase.auth.getUser();
      if (activo) {
        setUsuarioDocente(data.user ?? null);
      }
    };
    void cargarSesion();

    const { data: subscripcion } = supabase.auth.onAuthStateChange((_evento, session) => {
      if (activo) {
        setUsuarioDocente(session?.user ?? null);
        if (!session?.user) {
          setPestanaPrincipal("crear");
        }
      }
    });

    return () => {
      activo = false;
      subscripcion.subscription.unsubscribe();
    };
  }, []);

  const iniciarSesionGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });
  };

  const cerrarSesionDocente = async () => {
    await supabase.auth.signOut();
    setUsuarioDocente(null);
    setPestanaPrincipal("crear");
  };

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
    setCodigoActividadSeleccionada(null);
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

      const minPalabras = form.incluirResumen
        ? Math.max(10, Number(form.minPalabrasResumen) || 50)
        : 0;

      const resultadoFinal: ResultadoLectura = {
        ...data,
        bloqueo_secuencial: form.bloqueo_secuencial ?? false,
        ...(esContenidoPropio
          ? {
              titulo: form.tituloPropio?.trim() || data.titulo,
              texto: form.textoPropio!.trim(),
            }
          : {}),
        ...(form.modoOrigen === "oral" && form.mediaUrl
          ? { mediaUrl: form.mediaUrl, mediaTipo: form.mediaTipo }
          : {}),
        ...(minPalabras > 0
          ? {
              resumen_min_palabras: minPalabras,
              resumen_modelo: data.resumen_modelo || "",
            }
          : {}),
      };

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
      setCodigoActividadSeleccionada(null);
      setResultado({
        ...data,
        bloqueo_secuencial: resultado.bloqueo_secuencial ?? false,
        ...(resultado.mediaUrl
          ? { mediaUrl: resultado.mediaUrl, mediaTipo: resultado.mediaTipo }
          : {}),
        ...(resultado.resumen_min_palabras && resultado.resumen_min_palabras > 0
          ? {
              resumen_min_palabras: resultado.resumen_min_palabras,
              resumen_modelo: data.resumen_modelo ?? resultado.resumen_modelo ?? "",
            }
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

  const abrirDesdeBiblioteca = (actividad: ActividadGuardada) => {
    setPdfPreviewUrl(null);
    setForm((prev) => ({
      ...prev,
      edad: actividad.edad || prev.edad,
    }));
    setResultado({
      titulo: actividad.titulo,
      texto: actividad.texto,
      mediaUrl: actividad.media_url || undefined,
      mediaTipo: actividad.media_tipo || undefined,
      preguntas_literales: actividad.preguntas_literales || [],
      preguntas_inferenciales: actividad.preguntas_inferenciales || [],
      resumen_min_palabras: actividad.resumen_min_palabras || 0,
      resumen_modelo: actividad.resumen_modelo || "",
      bloqueo_secuencial: actividad.bloqueo_secuencial ?? false,
    });
    setCodigoActividadSeleccionada(actividad.codigo);
    setAvisoExito(false);

    setTimeout(() => {
      seccionResultadoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const pdfActivo = form.modoOrigen === "subir" ? pdfPreviewUrl : null;

  return (
    <div className="min-h-screen bg-slate-100/80 text-slate-800 font-sans pb-20 antialiased print:bg-white print:pb-0">
      <header className="bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 text-white shadow-lg print:hidden">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 pt-7 pb-14">
          {/* Fila superior: Etiqueta institucional y sesión docente */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div className="inline-flex items-center gap-2.5 bg-white/12 backdrop-blur-md px-3.5 py-1.5 rounded-full text-xs font-bold tracking-wider uppercase border border-white/20 text-blue-50">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-xs shadow-emerald-400/50" />
              IESO Sierra la Mesta · Santa Amalia
            </div>

            {/* Acceso docente con Google */}
            {usuarioDocente ? (
              <div className="flex items-center gap-2.5 bg-white/12 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-white/20 text-xs sm:text-sm">
                <span className="font-semibold text-white truncate max-w-[220px]">
                  👤 {usuarioDocente.email}
                </span>
                <button
                  type="button"
                  onClick={cerrarSesionDocente}
                  className="bg-white/20 hover:bg-white/30 text-white font-bold px-3 py-1 rounded-lg transition cursor-pointer"
                >
                  Salir
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={iniciarSesionGoogle}
                className="inline-flex items-center gap-2.5 bg-white hover:bg-blue-50 text-slate-900 font-bold text-xs sm:text-sm px-4 py-2.5 rounded-xl shadow-md transition cursor-pointer"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                  />
                </svg>
                <span>Entrar con Google (Guardar biblioteca)</span>
              </button>
            )}
          </div>

          {/* Bloque principal: Logo en tarjeta blanca + Título DialectIA */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
            <div className="bg-white rounded-2xl px-4 py-3 shadow-xl shadow-blue-950/30 border border-white/90 w-fit shrink-0">
              <Image
                src="/logo.jpg"
                alt="Logo I.E.S.O. Sierra la Mesta - Santa Amalia"
                width={150}
                height={100}
                priority
                className="h-14 sm:h-16 w-auto object-contain"
              />
            </div>

            <div className="space-y-1.5">
              <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-none text-white">
                DialectIA
              </h1>
              <p className="text-blue-100/95 text-sm sm:text-lg font-medium leading-snug">
                Entrenador de Competencia Lingüística — Programa NEXO (Educalectura-Educalem)
              </p>
            </div>
          </div>

          {/* Navegación Docente: Crear vs Biblioteca */}
          {usuarioDocente && (
            <div className="flex flex-wrap gap-3 mt-7">
              <button
                type="button"
                onClick={() => setPestanaPrincipal("crear")}
                className={`px-5 py-2.5 rounded-xl text-sm font-bold transition cursor-pointer ${
                  pestanaPrincipal === "crear"
                    ? "bg-white text-blue-950 shadow-md"
                    : "bg-white/15 text-white hover:bg-white/25 border border-white/15"
                }`}
              >
                ✨ Crear / Editar Lectura
              </button>
              <button
                type="button"
                onClick={() => setPestanaPrincipal("biblioteca")}
                className={`px-5 py-2.5 rounded-xl text-sm font-bold transition cursor-pointer ${
                  pestanaPrincipal === "biblioteca"
                    ? "bg-white text-indigo-950 shadow-md"
                    : "bg-white/15 text-white hover:bg-white/25 border border-white/15"
                }`}
              >
                📚 Mi Biblioteca en la Nube
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-8 -mt-7 print:mt-0 print:px-0 print:max-w-none">
        {usuarioDocente && pestanaPrincipal === "biblioteca" ? (
          <BibliotecaDocente
            docenteId={usuarioDocente.id}
            codigoActivo={codigoActividadSeleccionada}
            onSeleccionarActividad={abrirDesdeBiblioteca}
            onActividadEliminada={(codigoEliminado) => {
              if (codigoActividadSeleccionada === codigoEliminado) {
                setCodigoActividadSeleccionada(null);
                setResultado(null);
              }
            }}
          />
        ) : (
          <FormularioLectura
            form={form}
            setForm={setForm}
            cargando={cargando}
            segundosRestantes={segundosRestantes}
            onSubmit={handleSubmit}
            onPdfChange={setPdfPreviewUrl}
          />
        )}

        {resultado && (
          <>
            <FichaLectura
              resultado={resultado}
              edad={form.edad}
              pdfPreviewUrl={pdfActivo}
              avisoExito={avisoExito}
              docenteId={usuarioDocente?.id ?? null}
              docenteEmail={usuarioDocente?.email ?? null}
              codigoInicial={codigoActividadSeleccionada}
              onActividadGuardada={(codigo) => setCodigoActividadSeleccionada(codigo)}
              onCerrarAviso={() => setAvisoExito(false)}
              onAbrirCorrector={() => setVentanaCorrectorAbierta(true)}
              onRefinarResultado={handleRefinar}
              onActualizarResultado={setResultado}
              refinando={refinando}
              seccionRef={seccionResultadoRef}
            />

            <VentanaCorrector
              key={`corrector-${resultado.titulo}-${resultado.resumen_min_palabras || 0}-${
                resultado.bloqueo_secuencial ?? false
              }`}
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
              resumenMinPalabras={resultado.resumen_min_palabras || 0}
              resumenModelo={resultado.resumen_modelo || ""}
              bloqueoSecuencial={resultado.bloqueo_secuencial ?? false}
            />
          </>
        )}
      </main>
    </div>
  );
}