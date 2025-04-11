// src/App.tsx (MODIFIÉ pour contrôler le stream avec ESPACE)
import React, { useState, useEffect, useCallback, useRef } from "react"; // Ajout de useRef
import OldTvScreen from "./components/OldTvScreen";
import { GlassesStyle, glassesMap } from "./constants/glasses";
import { MouthState, mouthsMap } from "./constants/mouths";
import { PupilState, pupilsMap } from "./constants/pupils";
import { useAnimatedEyes } from "./hooks/useAnimatedEyes";
import { useAnimatedMouth } from "./hooks/useAnimatedMouth";
import { useRealtimeTranscription } from "./hooks/useRealtimeTranscription";

// --- NOUVEAU: Constante pour la touche ---
const TRANSCRIPTION_KEY = " "; // Touche Espace

// Listes des états disponibles (inchangées)
const availableGlassesStyles: GlassesStyle[] = Object.keys(
  glassesMap
) as GlassesStyle[];
const availablePupilStates: PupilState[] = Object.keys(
  pupilsMap
) as PupilState[];
const availableMouthStates: MouthState[] = Object.keys(
  mouthsMap
) as MouthState[];

function App() {
  // États et hooks existants (inchangés)
  const [glassesStyle, setGlassesStyle] = useState<GlassesStyle>("neutral");
  const {
    pupilState,
    eyeOffsetX,
    eyeOffsetY,
    currentPupilAscii,
    setPupilStateBase,
    moveEyes,
    resetEyePosition,
    isBlinking,
    previousPupilState,
    isAutonomous,
    toggleAutonomousMode,
  } = useAnimatedEyes("center");
  const {
    mouthState,
    baseMouthState,
    setMouthStateBase,
    toggleTalking,
    isTalkingContinuously,
  } = useAnimatedMouth({ initialMouthState: "neutral" });

  // Hook de Transcription (inchangé)
  const {
    isStreaming,
    isTalking,
    statusMessage,
    transcriptionText,
    translationText,
    startStreaming,
    stopStreaming,
  } = useRealtimeTranscription();

  // --- NOUVEAU: Ref pour éviter les déclenchements multiples sur keydown ---

  const keydownTriggeredRef = useRef(false);
  // --- NOUVEAU: Ref pour suivre l'état de l'animation bouche
  const isTalkingContinuouslyRef = useRef(isTalkingContinuously);
  // --- NOUVEAU: Effet pour mettre à jour la ref ---
  useEffect(() => {
    isTalkingContinuouslyRef.current = isTalkingContinuously;
  }, [isTalkingContinuously]);

  // --- NOUVEAU: Effet pour gérer les événements clavier pour le streaming ---
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Si c'est la bonne touche, qu'on n'a pas déjà déclenché et qu'on n'est pas déjà en train de streamer
      if (
        event.key === TRANSCRIPTION_KEY &&
        !keydownTriggeredRef.current &&
        !isStreaming
      ) {
        keydownTriggeredRef.current = true; // Marquer comme déclenché pour cette pression
        console.log("App: Spacebar Down - Starting stream...");
        startStreaming(); // Démarre le stream
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === TRANSCRIPTION_KEY) {
        keydownTriggeredRef.current = false; // Permettre un nouveau déclenchement au prochain keydown
        // Si on était en train de streamer quand la touche est relâchée
        if (isStreaming) {
          console.log("App: Spacebar Up - Stopping stream...");
          stopStreaming(); // Arrête le stream
        } else {
          console.log("App: Spacebar Up - Stream already stopped.");
        }
      }
    };

    // Ajoute les écouteurs globaux
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    // Nettoyage : retire les écouteurs
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      // Sécurité: si on démonte pendant que la touche est enfoncée
      if (isStreaming) {
        console.log(
          "App: Unmounting while key might be pressed - Stopping stream..."
        );
        stopStreaming();
      }
    };
    // Dépendances: les fonctions start/stop et l'état isStreaming
  }, [startStreaming, stopStreaming, isStreaming]);

  // Fonction getButtonClass (inchangée)
  const getButtonClass = (
    currentState: string | number | boolean,
    buttonState: string | number | boolean,
    isDisabled: boolean = false
  ): string => {
    const baseClasses =
      "px-3 py-1 rounded text-xs transition-colors text-white min-w-[60px] text-center";
    const activeSwitchClasses = "bg-cyan-600 font-semibold hover:bg-cyan-500";
    const activeClasses = "bg-emerald-600 font-semibold";
    const inactiveClasses = "bg-zinc-600 hover:bg-zinc-500";
    const disabledClasses =
      "bg-zinc-700 text-zinc-500 opacity-50 cursor-not-allowed";
    if (isDisabled) return `${baseClasses} ${disabledClasses}`;
    if (
      typeof currentState === "boolean" &&
      typeof buttonState === "boolean" &&
      buttonState === true
    ) {
      return `${baseClasses} ${
        currentState ? activeSwitchClasses : inactiveClasses
      }`;
    }
    if (typeof currentState === "string" || typeof currentState === "number") {
      return `${baseClasses} ${
        currentState === buttonState ? activeClasses : inactiveClasses
      }`;
    }
    return `${baseClasses} ${inactiveClasses}`;
  };

  useEffect(() => {
    // Fonction utilitaire pour arrêter l'animation bouche si elle est active
    const stopMouthIfNeeded = () => {
      // Utilise la ref pour lire la valeur la plus récente
      if (isTalkingContinuouslyRef.current) {
        // << Lire la Ref ici
        console.log(
          "App: Stopping mouth animation (speech ended/cancelled/error)."
        );
        toggleTalking(); // Appelle la fonction toggle (stable)
      }
    };

    if (transcriptionText.trim() !== "") {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(transcriptionText);
        utterance.lang = "en-US";

        utterance.onstart = () => {
          // Lire la Ref ici aussi pour vérifier l'état actuel
          if (!isTalkingContinuouslyRef.current) {
            // << Lire la Ref ici
            console.log("App: Speech started - Activating mouth animation.");
            toggleTalking();
          }
        };

        utterance.onend = () => {
          console.log("App: Speech ended - Deactivating mouth animation.");
          stopMouthIfNeeded();
        };

        utterance.onerror = (event) => {
          console.error("SpeechSynthesisUtterance Error:", event);
          stopMouthIfNeeded();
        };

        window.speechSynthesis.speak(utterance);
      } else {
        console.error("La synthèse vocale n'est pas supportée.");
      }
    } else {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      stopMouthIfNeeded();
    }

    return () => {
      // Le nettoyage reste le même, annuler la parole déclenchera onend/onerror
      if ("speechSynthesis" in window && window.speechSynthesis.speaking) {
        console.log("App: Unmounting during speech - Cancelling speech.");
        // L'arrêt de l'animation se fera via les callbacks déclenchés par cancel()
        window.speechSynthesis.cancel();
      }
    };
    // Dépendances: SEULEMENT le texte transcrit !
  }, [transcriptionText]);

  return (
    <div className="relative min-h-screen bg-black flex flex-col">
      {/* Écran principal (inchangé) */}
      <div className="flex-grow flex items-center justify-center">
        <OldTvScreen
          glassesStyle={glassesStyle}
          pupilAscii={currentPupilAscii}
          mouthState={mouthState}
          eyeOffsetX={eyeOffsetX}
          eyeOffsetY={eyeOffsetY}
        />
      </div>
      {/* Affichage Transcription/Traduction (inchangé) */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-full max-w-2xl p-2 bg-black/70 rounded">
        <p className="text-center text-sm text-emerald-300 font-mono whitespace-pre-wrap">
          {transcriptionText || "..."}
        </p>
        {translationText && (
          <p className="text-center text-xs text-cyan-300 font-mono mt-1 whitespace-pre-wrap">
            {translationText}
          </p>
        )}
      </div>
      {/* Zone de contrôle (MODIFICATION MINIME) */}
      <div className="absolute top-0 right-0 z-10 flex flex-wrap justify-center gap-x-8 gap-y-4 p-4 bg-zinc-800/90 rounded-lg shadow-lg max-w-3xl backdrop-blur-sm">
        {/* --- Section Contrôles de Streaming --- */}
        <div className="flex flex-col gap-2 items-center w-full sm:w-auto">
          <span className="text-white font-bold text-sm mb-1 uppercase tracking-wider">
            Transcription
          </span>
          {/* --- MODIFIÉ: Le bouton affiche l'état mais ne déclenche plus rien au clic --- */}
          <button
            // onClick={isStreaming ? stopStreaming : startStreaming} // << ONCLICK SUPPRIMÉ/DÉSACTIVÉ
            onClick={() =>
              console.log("Le bouton est contrôlé par la touche [ESPACE]")
            } // Optionnel: log au clic
            className={`w-full px-4 py-2 rounded text-white font-semibold transition-colors text-sm ${
              isStreaming
                ? "bg-red-600 hover:bg-red-500" // Style si actif
                : "bg-green-600 hover:bg-green-500" // Style si inactif
            } cursor-default`} // << Changé cursor-pointer en cursor-default
            aria-label={
              isStreaming
                ? "Streaming en cours (contrôlé par Espace)"
                : "Prêt à streamer (maintenir Espace)"
            }
            aria-pressed={isStreaming} // Indique l'état actif
            // disabled // On peut aussi le désactiver visuellement/fonctionnellement
          >
            {isStreaming ? "Streaming..." : "Maintenir [ESPACE]"}{" "}
            {/* Texte indiquant comment faire */}
          </button>
          {/* Affichage du message de statut depuis le hook (Préfixé) */}
          <p
            className="text-zinc-400 text-[10px] mt-1 h-4 text-center"
            aria-live="polite"
          >
            {/* Optionnel: Ajouter une instruction permanente */}
            {/* Maintenez [ESPACE] - {statusMessage} */}
            {statusMessage} {/* Ou juste afficher le message du hook */}
          </p>
        </div>

        {/* --- LE RESTE DES SECTIONS EST INCHANGÉ --- */}

        {/* Section Pupilles (Base) + Mode Auto */}
        <div className="flex flex-col gap-2 items-center">
          <span className="text-white font-bold text-sm mb-1 uppercase tracking-wider">
            Pupilles
          </span>
          {availablePupilStates.map((state) => {
            const isDisabled = isBlinking && previousPupilState !== state;
            return (
              <button
                key={`pupil-${state}`}
                onClick={() => setPupilStateBase(state)}
                className={getButtonClass(pupilState, state, isDisabled)}
                disabled={isDisabled}
                title={isDisabled ? "Animation clignement en cours" : ""}
              >
                {state}
              </button>
            );
          })}
          <span className="text-white font-bold text-xs mt-2 uppercase tracking-wider">
            Auto
          </span>
          <button
            onClick={toggleAutonomousMode}
            className={getButtonClass(isAutonomous, true)}
          >
            {isAutonomous ? "On" : "Off"}
          </button>
        </div>

        {/* Section Bouche (Base) + Switch Animation Manuelle */}
        {/* Section Bouche (Base) + Switch Animation Manuelle */}
        <div className="flex flex-col gap-2 items-center">
          <span className="text-white font-bold text-sm mb-1 uppercase tracking-wider">
            Bouche
          </span>
          {availableMouthStates.map((state) => (
            <button
              key={`mouth-${state}`}
              onClick={() => setMouthStateBase(state)}
              // Désactivé si l'animation bouche (déclenchée par la synthèse) est en cours
              className={getButtonClass(
                baseMouthState,
                state,
                isTalkingContinuously // << OK : désactivation visuelle si anim bouche active
              )}
              disabled={isTalkingContinuously} // << OK : désactivation fonctionnelle si anim bouche active
              title={isTalkingContinuously ? "Synthèse vocale en cours" : ""} // << Titre mis à jour
            >
              {state}
            </button>
          ))}
          {/* Bouton Switch pour Animation Manuelle */}
          <span className="text-white font-bold text-xs mt-2 uppercase tracking-wider">
            Anim.
          </span>
          {/* --- MODIFIÉ : Bouton Anim. désactivé si la synthèse parle --- */}
          <button
            onClick={() => {
              // Empêche le clic manuel si la synthèse est active
              if (!window.speechSynthesis?.speaking) {
                toggleTalking();
              } else {
                console.log(
                  "Cannot toggle manual animation while speech synthesis is active."
                );
              }
            }}
            // La classe de style peut rester basée sur isTalkingContinuously,
            // mais l'état 'disabled' doit vérifier la synthèse vocale active.
            // On ajoute window.speechSynthesis?.speaking à la condition de désactivation de getButtonClass
            className={`${getButtonClass(
              isTalkingContinuously,
              true,
              window.speechSynthesis?.speaking
            )}`}
            disabled={window.speechSynthesis?.speaking} // Désactive fonctionnellement le bouton si la synthèse est active
            title={
              window.speechSynthesis?.speaking
                ? "Synthèse vocale en cours"
                : isTalkingContinuously
                ? "Animation manuelle active"
                : "Démarrer animation manuelle"
            } // Titre mis à jour
          >
            {isTalkingContinuously ? "On" : "Off"}
          </button>
        </div>

        {/* Section Glasses (inchangée) */}
        <div className="flex flex-col gap-2 items-center">
          <span className="text-white font-bold text-sm mb-1 uppercase tracking-wider">
            Lunettes
          </span>
          {availableGlassesStyles.map((state) => (
            <button
              key={`glasses-${state}`}
              onClick={() => setGlassesStyle(state)}
              className={getButtonClass(glassesStyle, state)}
            >
              {state}
            </button>
          ))}
        </div>

        {/* Section Position Yeux (inchangée) */}
        <div className="flex flex-col gap-2 items-center">
          <span className="text-white font-bold text-sm mb-1 uppercase tracking-wider">
            Position Yeux
          </span>
          <div className="grid grid-cols-3 gap-1">
            <button
              onClick={() => moveEyes(-1, -1)}
              className={getButtonClass("↖", "↖", isAutonomous)}
              disabled={isAutonomous}
            >
              ↖
            </button>
            <button
              onClick={() => moveEyes(0, -1)}
              className={getButtonClass("↑", "↑", isAutonomous)}
              disabled={isAutonomous}
            >
              ↑
            </button>
            <button
              onClick={() => moveEyes(1, -1)}
              className={getButtonClass("↗", "↗", isAutonomous)}
              disabled={isAutonomous}
            >
              ↗
            </button>
            <button
              onClick={() => moveEyes(-1, 0)}
              className={getButtonClass("←", "←", isAutonomous)}
              disabled={isAutonomous}
            >
              ←
            </button>
            <button
              onClick={resetEyePosition}
              className={`${getButtonClass(
                "Reset",
                "Reset",
                isAutonomous
              )} bg-blue-600 hover:bg-blue-500 ${
                isAutonomous ? "opacity-50 cursor-not-allowed" : ""
              }`}
              disabled={isAutonomous}
            >
              Reset
            </button>
            <button
              onClick={() => moveEyes(1, 0)}
              className={getButtonClass("→", "→", isAutonomous)}
              disabled={isAutonomous}
            >
              →
            </button>
            <button
              onClick={() => moveEyes(-1, 1)}
              className={getButtonClass("↙", "↙", isAutonomous)}
              disabled={isAutonomous}
            >
              ↙
            </button>
            <button
              onClick={() => moveEyes(0, 1)}
              className={getButtonClass("↓", "↓", isAutonomous)}
              disabled={isAutonomous}
            >
              ↓
            </button>
            <button
              onClick={() => moveEyes(1, 1)}
              className={getButtonClass("↘", "↘", isAutonomous)}
              disabled={isAutonomous}
            >
              ↘
            </button>
          </div>
        </div>
      </div>{" "}
      {/* Fin zone de contrôle */}
    </div>
  );
}

export default App;
