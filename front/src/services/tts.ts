const speakWithElevenLabs = async (
    text: string,
    setIsTalking: React.Dispatch<React.SetStateAction<boolean>>
  ): Promise<void> => {
    const ELEVENLABS_API_KEY = "sk_26810bcf886cbb4d0e00086079fe40ddcc401799242bab90";
    const voiceId = "QEj0heL4nQHjaGrihlr0";
  
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          stability: 0.3,
          similarity_boost: 0.75,
        },
      }),
    });
  
    if (!res.ok) {
      console.error("Failed to get TTS audio");
      return;
    }
  
    const audioBlob = await res.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
  
    return new Promise((resolve) => {
      audio.onplay = () => {
        console.log("AUDIO PLAY");
        setIsTalking(true);
      };
      audio.onended = () => {
        console.log("AUDIO ENDED");
        setIsTalking(false);
        resolve();
      };
      audio.onerror = (err) => {
        console.error("Audio error", err);
        setIsTalking(false);
        resolve();
      };
  
      audio.play().catch((err) => {
        console.error("Audio play failed", err);
        setIsTalking(false);
        resolve();
      });
    });
  };

  const speakWithBrowserTTS = (
    text: string,
    setIsTalking: React.Dispatch<React.SetStateAction<boolean>>
  ): Promise<void> => {
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.volume = 1;
  
      // 🔽 Attendre que les voix soient chargées
      const setVoice = () => {
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find(v => 
          v.name.includes("Siri") && v.lang === "en-US"
        );
  
        if (preferred) {
          utterance.voice = preferred;
        } else {
          console.warn("Voix Google en-US non trouvée. Utilisation de la voix par défaut.");
        }
  
        utterance.onstart = () => setIsTalking(true);
        utterance.onend = () => {
          setIsTalking(false);
          resolve();
        };
        utterance.onerror = (err) => {
          console.error("TTS error:", err);
          setIsTalking(false);
          resolve();
        };
  
        speechSynthesis.speak(utterance);
      };
  
      // 👇 Certaines plateformes ne chargent pas les voix immédiatement
      if (speechSynthesis.getVoices().length === 0) {
        speechSynthesis.onvoiceschanged = setVoice;
      } else {
        setVoice();
      }
    });
  };


  const speakWithOpenAI = async (
    text: string,
    setIsTalking: React.Dispatch<React.SetStateAction<boolean>>
  ): Promise<void> => {
    const OPENAI_API_KEY = ""
    if (!OPENAI_API_KEY) {
      console.error("Missing OPENAI_API_KEY");
      return;
    }
  
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": '*',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "tts-1",
        voice: "alloy", // or any available chef-style voice
        input: text,
        instructions: [
          // Adopt a Michelin-starred executive-chef persona
          "Speak with calm authority and refined confidence, like a Michelin-starred executive chef addressing a masterclass.",
          // Tone and accent
          "Keep diction crisp, measured and deliberate; add a light French inflection on French culinary terms (e.g., mirepoix, beurre blanc).",
          // Pacing
          "Maintain a steady, unhurried pace, pausing briefly before key steps as if demonstrating technique at the pass.",
          // Vocabulary & imagery
          "Use precise culinary vocabulary and vivid yet elegant sensory adjectives that convey expertise rather than flamboyance.",
          // Style limits
          "Avoid slang or overt humor; allow professionalism and passion for gastronomy to shine through."
        ].join(" ")
      }),
    });
  
    if (!res.ok) {
      console.error("Failed to get OpenAI TTS audio", await res.text());
      return;
    }
  
    const audioBlob = await res.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
  
    return new Promise((resolve) => {
      audio.onplay = () => {
        setIsTalking(true);
      };
      audio.onended = () => {
        setIsTalking(false);
        resolve();
      };
      audio.onerror = (err) => {
        console.error("Audio error", err);
        setIsTalking(false);
        resolve();
      };
      audio.play().catch((err) => {
        console.error("Audio play failed", err);
        setIsTalking(false);
        resolve();
      });
    });
  };
  
  export { speakWithBrowserTTS, speakWithElevenLabs, speakWithOpenAI };
