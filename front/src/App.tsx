import React, { useEffect, useState } from "react";
import Face from "./components/face";
import { useRecorder } from "./hooks/useRecorder";
import ChatHistory from "./components/ChatHistory";
import speakWithElevenLabs, { speakWithBrowserTTS } from "./services/tts";
import Recette from "./components/Recette";

const App: React.FC = () => {
  const [isTalking, setIsTalking] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const { isRecording, startRecording, stopRecording } = useRecorder();
  const [chatHistory, setChatHistory] = useState<
    { role: "user" | "bot"; text: string }[]
  >([]);

  const voices = window.speechSynthesis.getVoices();
  console.log(voices);

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.key === "Enter" && !isRecording) {
        await startRecording();
      }
      if (e.key.toLowerCase() === "r") {
        setIsActive((prev) => !prev); // toggle l'affichage de la recette
      }
    };

    const handleKeyUp = async (e: KeyboardEvent) => {
      if (e.key === "Enter" && isRecording) {
        const audioBlob = await stopRecording();

        // Préparer l’envoi
        const formData = new FormData();
        formData.append("file", audioBlob, "speech.webm");

        const res = await fetch("http://localhost:8000/api/stt/transcribe", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        const text = data.transcription || "[aucune transcription]";

        const new_chatHistory = [...chatHistory, { role: "user", text }];

        setChatHistory((prev) => [...prev, { role: "user", text }]);

        await fetch("http://localhost:8000/api/mistral/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ history: new_chatHistory }),
        })
          .then((res) => res.json())
          .then(async (data) => {
            const botReply = data.response;
            setChatHistory((prev) => [
              ...prev,
              { role: "bot", text: botReply },
            ]);

            // await speakWithElevenLabs(botReply, setIsTalking);
            await speakWithBrowserTTS(botReply, setIsTalking);
          });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isRecording, startRecording, stopRecording]);

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

      {isActive && <Recette
        title="Burger du chef"
        ingredients={[
          "3 pommes",
          "1 pâte feuilletée",
          "2 cuillères à soupe de sucre",
          "1 pincée de cannelle",
        ]}
      /> }
    </div>
  );
};

export default App;
