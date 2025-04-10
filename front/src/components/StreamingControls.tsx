// src/components/StreamingControls.tsx (SIMPLIFIÉ)
import React from "react";
import { useRealtimeTranscription } from "../hooks/useRealtimeTranscription"; // << IMPORTER LE HOOK

// Plus besoin de props liées au streaming ici

const StreamingControls: React.FC = () => {
  // --- Utiliser le Hook ---
  const {
    isStreaming,
    statusMessage,
    startStreaming,
    stopStreaming,
  } = useRealtimeTranscription();

  // --- Rendu ---
  return (
    <div className="flex flex-col gap-2 items-center">
      <button
        onClick={isStreaming ? stopStreaming : startStreaming}
        className={`w-full px-4 py-2 rounded text-white font-semibold transition-colors text-sm ${
          isStreaming
            ? "bg-red-600 hover:bg-red-500" // Style "Stop"
            : "bg-green-600 hover:bg-green-500" // Style "Start"
        }`}
        aria-label={
          isStreaming ? "Arrêter le streaming audio" : "Démarrer le streaming audio"
        }
      >
        {isStreaming ? "Stop Stream" : "Start Stream"}
      </button>
      {/* Afficher le message de statut du hook */}
      <p className="text-zinc-400 text-[10px] mt-1 h-4" aria-live="polite">
        {statusMessage}
      </p>
    </div>
  );
};

export default StreamingControls;