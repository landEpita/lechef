// src/App.tsx (Adapté pour switch Parler)
import React, { useState, useCallback } from 'react';
import OldTvScreen from './components/OldTvScreen';
import { GlassesStyle, glassesMap } from './constants/glasses';
import { MouthState, mouthsMap } from './constants/mouths';
import { PupilState, pupilsMap } from './constants/pupils';
import { useAnimatedEyes } from './hooks/useAnimatedEyes';
// Importer le hook de bouche modifié
import { useAnimatedMouth } from './hooks/useAnimatedMouth';

// Listes des états disponibles pour les boutons (inchangées)
const availableGlassesStyles: GlassesStyle[] = Object.keys(glassesMap) as GlassesStyle[];
const availablePupilStates: PupilState[] = Object.keys(pupilsMap) as PupilState[];
const availableMouthStates: MouthState[] = Object.keys(mouthsMap) as MouthState[];

function App() {
    // États locaux du composant App (inchangé)
    const [glassesStyle, setGlassesStyle] = useState<GlassesStyle>('neutral');

    // Utilisation du hook des yeux (inchangé)
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
    } = useAnimatedEyes('center');

    // Utilisation du hook de la bouche (modifié)
    const {
        mouthState,             // État animé/actuel de la bouche pour l'affichage
        baseMouthState,         // État de base (pour l'highlight des boutons)
        setMouthStateBase,      // Fonction pour les boutons de bouche de base
        // Remplacé startTalking et isAnimating par:
        toggleTalking,          // Fonction pour basculer le mode parler continu
        isTalkingContinuously,  // Indique si l'animation "Parler" continue est en cours
    } = useAnimatedMouth({ initialMouthState: 'neutral' });

    // Fonction utilitaire pour les classes CSS des boutons (inchangée)
     const getButtonClass = (currentState: string | number | boolean, buttonState: string | number | boolean, isDisabled: boolean = false): string => {
       const baseClasses = "px-3 py-1 rounded text-xs transition-colors text-white min-w-[60px] text-center";
       // Style spécifique pour le switch actif
       const activeSwitchClasses = "bg-cyan-600 font-semibold hover:bg-cyan-500";
       const activeClasses = "bg-emerald-600 font-semibold";
       const inactiveClasses = "bg-zinc-600 hover:bg-zinc-500";
       const disabledClasses = "bg-zinc-700 text-zinc-500 opacity-50 cursor-not-allowed";

       if (isDisabled) return `${baseClasses} ${disabledClasses}`;

       // Cas spécifique pour le bouton switch "Parler Continu"
       if (typeof currentState === 'boolean' && typeof buttonState === 'boolean' && buttonState === true) {
            return `${baseClasses} ${currentState ? activeSwitchClasses : inactiveClasses}`;
       }
       // Cas général pour les autres boutons (y compris le switch Mode Auto Yeux)
        if (typeof currentState === 'boolean') {
             return `${baseClasses} ${currentState === buttonState ? activeClasses : inactiveClasses}`;
        }
       // Cas des boutons texte (pupilles, bouche base, glasses)
       return `${baseClasses} ${currentState === buttonState ? activeClasses : inactiveClasses}`;
    };


    // Rendu du composant
    return (
        <div className="relative min-h-screen bg-black">
            {/* Composant d'affichage principal (inchangé) */}
            <OldTvScreen
                glassesStyle={glassesStyle}
                pupilAscii={currentPupilAscii}
                mouthState={mouthState} // Vient de useAnimatedMouth (état animé/actuel)
                eyeOffsetX={eyeOffsetX}
                eyeOffsetY={eyeOffsetY}
            />

            {/* Zone de contrôle */}
            <div className="absolute top-0 right-0 z-10 flex flex-wrap justify-center gap-x-8 gap-y-4 p-4 bg-zinc-800/90 rounded-lg shadow-lg max-w-3xl backdrop-blur-sm">

                {/* Section Pupilles (Base) (inchangée) */}
                <div className="flex flex-col gap-2 items-center">
                    <span className="text-white font-bold text-sm mb-1 uppercase tracking-wider">Pupilles (Base)</span>
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
                </div>

                {/* Section Bouche (Base) + Switch Parler Continu */}
                <div className="flex flex-col gap-2 items-center">
                    <span className="text-white font-bold text-sm mb-1 uppercase tracking-wider">Bouche (Base)</span>
                    {/* Boutons pour sélectionner l'état de base de la bouche */}
                    {availableMouthStates.map((state) => (
                        <button
                            key={`mouth-${state}`}
                            onClick={() => setMouthStateBase(state)}
                            // Désactivé si l'animation "Parler Continu" est en cours
                            className={getButtonClass(baseMouthState, state, isTalkingContinuously)}
                            disabled={isTalkingContinuously}
                            title={isTalkingContinuously ? "Mode 'Parler Continu' actif" : ""}
                        >
                            {state}
                        </button>
                    ))}
                     {/* NOUVEAU: Bouton Switch pour Parler Continu */}
                    <button
                        onClick={toggleTalking} // Appelle la nouvelle fonction du hook
                        // Utilise getButtonClass avec l'état booléen isTalkingContinuously
                        // Le troisième argument (isDisabled) est false car ce bouton ne doit pas être désactivé par lui-même
                         // On passe 'true' comme buttonState pour activer le style spécifique du switch actif
                        className={`${getButtonClass(isTalkingContinuously, true, false)} mt-2`}
                    >
                        {/* Texte dynamique basé sur l'état */}
                        Parler: {isTalkingContinuously ? 'Activé' : 'Désactivé'}
                    </button>
                </div>

                {/* Section Glasses (inchangée) */}
                <div className="flex flex-col gap-2 items-center">
                    <span className="text-white font-bold text-sm mb-1 uppercase tracking-wider">Glasses</span>
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
                     <span className="text-white font-bold text-sm mb-1 uppercase tracking-wider">Position Yeux</span>
                     <div className="grid grid-cols-3 gap-1">
                         {/* Désactivé si isAutonomous (des yeux) est true */}
                         <button onClick={() => moveEyes(-1, -1)} className={getButtonClass(-1,-1, isAutonomous)} disabled={isAutonomous}>↖</button>
                         <button onClick={() => moveEyes(0, -1)} className={getButtonClass(0,-1, isAutonomous)} disabled={isAutonomous}>↑</button>
                         <button onClick={() => moveEyes(1, -1)} className={getButtonClass(1,-1, isAutonomous)} disabled={isAutonomous}>↗</button>
                         <button onClick={() => moveEyes(-1, 0)} className={getButtonClass(-1,0, isAutonomous)} disabled={isAutonomous}>←</button>
                         <button onClick={resetEyePosition} className={`${getButtonClass(0,0, isAutonomous)} bg-blue-600 hover:bg-blue-500 ${isAutonomous ? 'opacity-50 cursor-not-allowed' : ''}`} disabled={isAutonomous}>Reset</button>
                         <button onClick={() => moveEyes(1, 0)} className={getButtonClass(1,0, isAutonomous)} disabled={isAutonomous}>→</button>
                         <button onClick={() => moveEyes(-1, 1)} className={getButtonClass(-1,1, isAutonomous)} disabled={isAutonomous}>↙</button>
                         <button onClick={() => moveEyes(0, 1)} className={getButtonClass(0,1, isAutonomous)} disabled={isAutonomous}>↓</button>
                         <button onClick={() => moveEyes(1, 1)} className={getButtonClass(1,1, isAutonomous)} disabled={isAutonomous}>↘</button>
                     </div>
                     <div className="text-white text-xs mt-1"> X: {eyeOffsetX}, Y: {eyeOffsetY} </div>
                     {isAutonomous && <div className="text-cyan-400 text-xs mt-1">(Auto Yeux)</div>}
                 </div>

                {/* Bouton pour Mode Autonome (des yeux) (inchangé) */}
                 <div className="flex flex-col gap-2 items-center">
                     <span className="text-white font-bold text-sm mb-1 uppercase tracking-wider">Mode Auto (Yeux)</span>
                     <button
                         onClick={toggleAutonomousMode}
                         className={getButtonClass(isAutonomous, true)}
                     >
                         {isAutonomous ? 'Activé' : 'Désactivé'}
                     </button>
                 </div>

            </div> {/* Fin zone de contrôle */}
        </div>
    );
}

export default App;