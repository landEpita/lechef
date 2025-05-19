import React, { useEffect, useState, useCallback } from "react";
import Face from "./components/face";
import { useRecorder } from "./hooks/useRecorder";
import ChatHistory from "./components/ChatHistory";
import speakWithElevenLabs, { speakWithOpenAI } from "./services/tts";
import Recette from "./components/Recette";

/** Extrait la clé `text` si la réponse est un JSON valide, sinon renvoie la chaîne brute. */
function extractText(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "text" in parsed) {
      return parsed.text as string;
    }
  } catch {
    /* raw n'est pas un JSON --> on renvoie tel quel */
  }
  return raw;
}

const App: React.FC = () => {
  const [isTalking, setIsTalking] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const { isRecording, startRecording, stopRecording } = useRecorder();

  const [chatHistory, setChatHistory] = useState<
    { role: "user" | "bot"; text: string }[]
  >([]);

  /** Démarre l'enregistrement si ENTER pressé, toggle recette avec R */
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.key === "Enter" && !isRecording) {
        await startRecording();
      }
      if (e.key.toLowerCase() === "r") {
        setIsActive((prev) => !prev);
      }
    };

    const handleKeyUp = async (e: KeyboardEvent) => {
      if (e.key === "Enter" && isRecording) {
        const audioBlob = await stopRecording();

        /* --- Speech-to-text --- */
        const formData = new FormData();
        formData.append("file", audioBlob, "speech.webm");

        const sttRes = await fetch("http://localhost:8000/api/stt/transcribe", {
          method: "POST",
          body: formData,
        });
        const sttData = await sttRes.json();
        const userText = sttData.transcription || "[aucune transcription]";

        /* --- Ajout tour utilisateur --- */
        setChatHistory((prev) => [...prev, { role: "user", text: userText }]);

        /* --- Préparation payload backend (historique + nouveau tour) --- */
        const historyForBackend = [
          ...chatHistory,
          { role: "user", text: userText },
        ];

        /* --- Appel Mistral backend --- */
        fetch("http://localhost:8000/api/mistral/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ history: historyForBackend }),
        })
          .then((res) => res.json())
          .then(async (data) => {
            const rawReply = data.response as string;

            /* -------- on extrait uniquement le texte pour TTS -------- */
            const textForTTS = extractText(rawReply);

            /* -------- on ajoute la réponse dans l'historique -------- */
            setChatHistory((prev) => [
              ...prev,
              { role: "bot", text: textForTTS },
            ]);

            /* -------- TTS -------- */
            await speakWithElevenLabs(textForTTS, setIsTalking);
          })
          .catch((err) => console.error("Backend error:", err));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [chatHistory, isRecording, startRecording, stopRecording]);

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center gap-4">
      <img
        src="/src/assets/bg.png"
        className="absolute top-0 left-0 w-full h-full object-cover -z-10"
        alt="Background"
      />

      <div className="absolute bottom-0 left-1/2 -translate-x-1/2">
        <Face isTalking={isTalking} />
      </div>

      {chatHistory.length > 0 && <ChatHistory history={chatHistory} />}

      {isActive && (
        <Recette
          title="Tarte aux Pommes"
          ingredients={[
            "3 pommes",
            "1 pâte feuilletée",
            "2 cuillères à soupe de sucre",
            "1 pincée de cannelle",
          ]}
          instructions={[
            "Préchauffez le four à 180°C.",
            "Étalez la pâte dans un moule.",
            "Disposez les tranches de pommes.",
            "Saupoudrez de sucre et de cannelle.",
            "Faites cuire 30 minutes.",
          ]}
        />
      )}
    </div>
  );
};

export default App;
