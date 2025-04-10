// src/App.tsx (MODIFIÉ pour utiliser useRealtimeTranscription)
import React, { useState, useEffect, useCallback } from 'react'; // Ajout de useEffect
import OldTvScreen from './components/OldTvScreen';
// Supprimer l'import de l'ancien StreamingControls si vous ne l'utilisez plus directement
// import StreamingControls from './components/StreamingControls';
import { GlassesStyle, glassesMap } from './constants/glasses';
import { MouthState, mouthsMap } from './constants/mouths';
import { PupilState, pupilsMap } from './constants/pupils';
import { useAnimatedEyes } from './hooks/useAnimatedEyes';
import { useAnimatedMouth } from './hooks/useAnimatedMouth';
import { useRealtimeTranscription } from './hooks/useRealtimeTranscription'; // << IMPORT du nouveau hook

// Listes des états disponibles (inchangées)
const availableGlassesStyles: GlassesStyle[] = Object.keys(glassesMap) as GlassesStyle[];
const availablePupilStates: PupilState[] = Object.keys(pupilsMap) as PupilState[];
const availableMouthStates: MouthState[] = Object.keys(mouthsMap) as MouthState[];

function App() {
    // États et hooks existants (inchangés)
    const [glassesStyle, setGlassesStyle] = useState<GlassesStyle>('neutral');
    const {
        pupilState, eyeOffsetX, eyeOffsetY, currentPupilAscii, setPupilStateBase,
        moveEyes, resetEyePosition, isBlinking, previousPupilState, isAutonomous,
        toggleAutonomousMode
    } = useAnimatedEyes('center');
    const {
        mouthState, baseMouthState, setMouthStateBase, toggleTalking, isTalkingContinuously
    } = useAnimatedMouth({ initialMouthState: 'neutral' });

    // --- Utilisation du Hook de Transcription Temps Réel ---
    const {
        isStreaming,
        isTalking,          // Alias pour isStreaming, fourni par le hook
        statusMessage,
        transcriptionText,  // Texte transcrit géré par le hook
        translationText,    // Texte traduit géré par le hook
        startStreaming,     // Fonction pour démarrer le stream
        stopStreaming       // Fonction pour arrêter le stream
    } = useRealtimeTranscription();

    // --- Effet pour synchroniser l'animation de la bouche avec l'état de streaming ---
    useEffect(() => {
        // Si le hook indique qu'on parle (stream actif) ET que l'animation de bouche n'est PAS déjà active
        if (isTalking && !isTalkingContinuously) {
            console.log("App: Stream active (isTalking=true), activating mouth animation.");
            toggleTalking(); // Active l'animation via le hook useAnimatedMouth
        }
        // Si le hook indique qu'on ne parle plus (stream inactif) ET que l'animation de bouche EST active
        else if (!isTalking && isTalkingContinuously) {
            console.log("App: Stream inactive (isTalking=false), deactivating mouth animation.");
            toggleTalking(); // Désactive l'animation via le hook useAnimatedMouth
        }
        // Si les états (isTalking et isTalkingContinuously) sont déjà synchronisés, on ne fait rien.
    }, [isTalking, isTalkingContinuously, toggleTalking]); // Dépend des états et de la fonction toggle


    // Fonction utilitaire getButtonClass (inchangée)
    const getButtonClass = (currentState: string | number | boolean, buttonState: string | number | boolean, isDisabled: boolean = false): string => {
         const baseClasses = "px-3 py-1 rounded text-xs transition-colors text-white min-w-[60px] text-center";
         const activeSwitchClasses = "bg-cyan-600 font-semibold hover:bg-cyan-500";
         const activeClasses = "bg-emerald-600 font-semibold";
         const inactiveClasses = "bg-zinc-600 hover:bg-zinc-500";
         const disabledClasses = "bg-zinc-700 text-zinc-500 opacity-50 cursor-not-allowed";

         if (isDisabled) return `${baseClasses} ${disabledClasses}`;

         // Cas spécifique pour les switches booléens (Mode Auto Yeux, Parler Continu Manuel)
         if (typeof currentState === 'boolean' && typeof buttonState === 'boolean' && buttonState === true) {
              return `${baseClasses} ${currentState ? activeSwitchClasses : inactiveClasses}`;
         }
        // // Le bouton Start/Stop Stream gérera son propre style plus bas

         // Cas des boutons d'état texte/nombre (Pupilles, Bouche Base, Glasses, Position Yeux)
         if (typeof currentState === 'string' || typeof currentState === 'number') {
            return `${baseClasses} ${currentState === buttonState ? activeClasses : inactiveClasses}`;
         }

         // Fallback pour les boutons de direction des yeux qui utilisent des nombres pour currentState/buttonState
         // On suppose ici que si ce n'est pas un booléen ou string, c'est pour les flèches (style inactif par défaut)
          return `${baseClasses} ${inactiveClasses}`;
     };


    return (
        <div className="relative min-h-screen bg-black flex flex-col">
            {/* Écran principal */}
            <div className="flex-grow flex items-center justify-center">
                <OldTvScreen
                    glassesStyle={glassesStyle}
                    pupilAscii={currentPupilAscii}
                    mouthState={mouthState} // Toujours depuis useAnimatedMouth
                    eyeOffsetX={eyeOffsetX}
                    eyeOffsetY={eyeOffsetY}
                />
            </div>

            {/* Affichage Transcription/Traduction (utilise l'état du hook) */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-full max-w-2xl p-2 bg-black/70 rounded">
                <p className="text-center text-sm text-emerald-300 font-mono whitespace-pre-wrap">
                    {transcriptionText || "..."} {/* Texte depuis le hook */}
                </p>
                 {translationText && ( // Affichage conditionnel de la traduction
                    <p className="text-center text-xs text-cyan-300 font-mono mt-1 whitespace-pre-wrap">
                        {translationText} {/* Texte depuis le hook */}
                    </p>
                )}
            </div>

            {/* Zone de contrôle */}
            <div className="absolute top-0 right-0 z-10 flex flex-wrap justify-center gap-x-8 gap-y-4 p-4 bg-zinc-800/90 rounded-lg shadow-lg max-w-3xl backdrop-blur-sm">

                {/* --- NOUVEAU: Contrôles de Streaming (simplifiés, utilisent le hook) --- */}
                <div className="flex flex-col gap-2 items-center w-full sm:w-auto">
                    <span className="text-white font-bold text-sm mb-1 uppercase tracking-wider">Transcription</span>
                    {/* Bouton Start/Stop utilisant les fonctions du hook */}
                    <button
                        onClick={isStreaming ? stopStreaming : startStreaming}
                        className={`w-full px-4 py-2 rounded text-white font-semibold transition-colors text-sm ${
                            isStreaming
                            ? "bg-red-600 hover:bg-red-500"
                            : "bg-green-600 hover:bg-green-500"
                        }`}
                        aria-label={isStreaming ? "Arrêter le streaming audio" : "Démarrer le streaming audio"}
                    >
                        {isStreaming ? "Stop Stream" : "Start Stream"}
                    </button>
                    {/* Affichage du message de statut depuis le hook */}
                    <p className="text-zinc-400 text-[10px] mt-1 h-4" aria-live="polite">
                        {statusMessage}
                    </p>
                 </div>

                {/* Section Pupilles (Base) + Mode Auto */}
                 <div className="flex flex-col gap-2 items-center">
                    <span className="text-white font-bold text-sm mb-1 uppercase tracking-wider">Pupilles</span>
                    {availablePupilStates.map((state) => {
                        const isDisabled = isBlinking && previousPupilState !== state;
                        return (
                            <button key={`pupil-${state}`} onClick={() => setPupilStateBase(state)}
                                className={getButtonClass(pupilState, state, isDisabled)} disabled={isDisabled}
                                title={isDisabled ? "Animation clignement en cours" : ""}>
                                {state}
                            </button>
                        );
                    })}
                     <span className="text-white font-bold text-xs mt-2 uppercase tracking-wider">Auto</span>
                     <button onClick={toggleAutonomousMode} className={getButtonClass(isAutonomous, true)} >
                         {isAutonomous ? 'On' : 'Off'}
                     </button>
                </div>

                {/* Section Bouche (Base) + Switch Animation Manuelle */}
                <div className="flex flex-col gap-2 items-center">
                    <span className="text-white font-bold text-sm mb-1 uppercase tracking-wider">Bouche</span>
                    {availableMouthStates.map((state) => (
                        <button key={`mouth-${state}`} onClick={() => setMouthStateBase(state)}
                            // Désactivé si l'animation (manuelle ou stream) est en cours
                            className={getButtonClass(baseMouthState, state, isTalkingContinuously)} disabled={isTalkingContinuously}
                            title={isTalkingContinuously ? "Animation bouche active" : ""}>
                            {state}
                        </button>
                    ))}
                    {/* Bouton Switch pour Animation Manuelle */}
                     <span className="text-white font-bold text-xs mt-2 uppercase tracking-wider">Anim.</span>
                    <button onClick={toggleTalking} className={`${getButtonClass(isTalkingContinuously, true, false)}`} >
                        {/* L'état isTalkingContinuously est géré par useAnimatedMouth, synchronisé via useEffect */}
                        {isTalkingContinuously ? 'On' : 'Off'}
                    </button>
                </div>

                {/* Section Glasses (inchangée) */}
                <div className="flex flex-col gap-2 items-center">
                    <span className="text-white font-bold text-sm mb-1 uppercase tracking-wider">Lunettes</span>
                    {availableGlassesStyles.map((state) => (
                        <button key={`glasses-${state}`} onClick={() => setGlassesStyle(state)} className={getButtonClass(glassesStyle, state)}>
                            {state}
                        </button>
                    ))}
                </div>

                {/* Section Position Yeux (inchangée, correction getButtonClass) */}
                 <div className="flex flex-col gap-2 items-center">
                     <span className="text-white font-bold text-sm mb-1 uppercase tracking-wider">Position Yeux</span>
                     <div className="grid grid-cols-3 gap-1">
                        {/* Utiliser les strings pour les boutons de direction avec getButtonClass */}
                        <button onClick={() => moveEyes(-1, -1)} className={getButtonClass('↖', '↖', isAutonomous)} disabled={isAutonomous}>↖</button>
                        <button onClick={() => moveEyes(0, -1)} className={getButtonClass('↑', '↑', isAutonomous)} disabled={isAutonomous}>↑</button>
                        <button onClick={() => moveEyes(1, -1)} className={getButtonClass('↗', '↗', isAutonomous)} disabled={isAutonomous}>↗</button>
                        <button onClick={() => moveEyes(-1, 0)} className={getButtonClass('←', '←', isAutonomous)} disabled={isAutonomous}>←</button>
                        <button onClick={resetEyePosition} className={`${getButtonClass('Reset', 'Reset', isAutonomous)} bg-blue-600 hover:bg-blue-500 ${isAutonomous ? 'opacity-50 cursor-not-allowed' : ''}`} disabled={isAutonomous}>Reset</button>
                        <button onClick={() => moveEyes(1, 0)} className={getButtonClass('→', '→', isAutonomous)} disabled={isAutonomous}>→</button>
                        <button onClick={() => moveEyes(-1, 1)} className={getButtonClass('↙', '↙', isAutonomous)} disabled={isAutonomous}>↙</button>
                        <button onClick={() => moveEyes(0, 1)} className={getButtonClass('↓', '↓', isAutonomous)} disabled={isAutonomous}>↓</button>
                        <button onClick={() => moveEyes(1, 1)} className={getButtonClass('↘', '↘', isAutonomous)} disabled={isAutonomous}>↘</button>
                     </div>
                     {/* Affichage X, Y et Auto Yeux gérés dans section Pupilles/Yeux */}
                 </div>

                 {/* Suppression de l'ancienne section Mode Auto Yeux qui est maintenant groupée avec Pupilles */}

            </div> {/* Fin zone de contrôle */}
        </div>
    );
}

export default App;