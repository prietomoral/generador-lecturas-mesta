"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { ConfigMision } from "../types/gamificacion";

interface BannerMisionColectivaProps {
  codigoActividad: string;
  mision?: ConfigMision | null;
}

export default function BannerMisionColectiva({
  codigoActividad,
  mision,
}: BannerMisionColectivaProps) {
  const [puntosClase, setPuntosClase] = useState(0);

  useEffect(() => {
    if (!mision?.activa || !codigoActividad) return;

    const cargarPuntosClase = async () => {
      const { data } = await supabase
        .from("entregas")
        .select("ultima_evaluacion")
        .eq("actividad_codigo", codigoActividad);

      if (data) {
        const suma = data.reduce((acc, row) => {
          const pts =
            Number(row.ultima_evaluacion?.gamificacion?.puntosTotales) || 0;
          return acc + pts;
        }, 0);
        setPuntosClase(suma);
      }
    };

    cargarPuntosClase();

    const canal = supabase
      .channel(`mision-${codigoActividad}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "entregas",
          filter: `actividad_codigo=eq.${codigoActividad}`,
        },
        () => {
          cargarPuntosClase();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [codigoActividad, mision?.activa]);

  if (!mision?.activa) return null;

  const meta = mision.metaPuntos > 0 ? mision.metaPuntos : 400;
  const porcentaje = Math.min(100, Math.round((puntosClase / meta) * 100));

  return (
    <div className="bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border-2 border-amber-300 rounded-2xl p-4 shadow-xs space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-extrabold uppercase tracking-wider text-amber-900 bg-amber-200/80 px-2.5 py-0.5 rounded-full">
          🗺️ Misión de Clase: {mision.tituloMision || "Reto de Comprensión"}
        </span>
        <span className="text-xs font-extrabold text-amber-950">
          Progreso del grupo: {puntosClase} / {meta} pts ({porcentaje}%)
        </span>
      </div>

      {mision.narrativa && (
        <p className="text-xs sm:text-sm text-amber-950/90 leading-relaxed">
          {mision.narrativa}
        </p>
      )}

      <div className="w-full bg-amber-200/70 h-2.5 rounded-full overflow-hidden">
        <div
          className="bg-amber-600 h-full transition-all duration-500"
          style={{ width: `${porcentaje}%` }}
        />
      </div>
    </div>
  );
}