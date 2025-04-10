// src/hooks/useRealtimeTranscription.ts
import { useState, useRef, useEffect, useCallback } from "react";

// --- Constantes ---
const WEBSOCKET_URL = "ws://localhost:8000/api/stream/ws"; // Vérifiez si c'est toujours correct
const TIMESLICE_MS = 500; // Envoyer des chunks toutes les 500ms (ajustable)

// --- Interface pour les valeurs retournées par le hook ---
interface UseRealtimeTranscriptionReturn {
    isStreaming: boolean;           // Le streaming est-il actif ?
    isTalking: boolean;             // Alias pour isStreaming, pour l'animation bouche
    statusMessage: string;          // Message pour l'utilisateur
    transcriptionText: string;      // Texte transcrit reçu
    translationText: string;        // Texte traduit reçu (si applicable)
    startStreaming: () => void;     // Fonction pour démarrer
    stopStreaming: () => void;      // Fonction pour arrêter
}

export function useRealtimeTranscription(): UseRealtimeTranscriptionReturn {
    // --- États Internes du Hook ---
    const [isStreaming, setIsStreaming] = useState(false);
    const [statusMessage, setStatusMessage] = useState("Prêt à streamer");
    const [transcriptionText, setTranscriptionText] = useState("");
    const [translationText, setTranslationText] = useState(""); // Si utilisé

    // --- Références ---
    const socketRef = useRef<WebSocket | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioStreamRef = useRef<MediaStream | null>(null);
    // Pour éviter des appels multiples rapides start/stop
    const isBusyRef = useRef(false);

    // --- Arrêt et Nettoyage ---
    const stopStreaming = useCallback(() => {
        if (isBusyRef.current) {
            console.warn("useRealtimeTranscription: Stop request ignored, already busy.");
            return;
        }
        isBusyRef.current = true;
        console.log(">>> useRealtimeTranscription: stopStreaming CALLED <<<");

        const recorder = mediaRecorderRef.current;
        const socket = socketRef.current;
        const stream = audioStreamRef.current;

        // Set state immediately for UI responsiveness
        setIsStreaming(false);
        setStatusMessage("Arrêt du stream...");

        // 1. Arrêter MediaRecorder
        if (recorder && recorder.state === "recording") {
            try {
                recorder.ondataavailable = null;
                recorder.onerror = null;
                recorder.onstop = null; // Important de détacher avant stop() parfois
                recorder.stop();
                console.log("useRealtimeTranscription: MediaRecorder stopped.");
            } catch (e) {
                console.error("Error stopping MediaRecorder:", e);
            }
        }
        mediaRecorderRef.current = null;

        // 2. Fermer WebSocket
        if (socket) {
            // Détacher les listeners AVANT de fermer pour éviter des appels de onclose non désirés
            socket.onopen = null;
            socket.onmessage = null;
            socket.onerror = null;
            socket.onclose = null; // Détacher notre propre handler onclose

            if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
                try {
                    // Envoyer un message de fin optionnel au backend avant de fermer
                    // if (socket.readyState === WebSocket.OPEN) {
                    //     socket.send(JSON.stringify({ type: 'stop' }));
                    // }
                    socket.close(1000, "Client stopped streaming");
                    console.log("useRealtimeTranscription: WebSocket connection closing.");
                } catch (e) {
                    console.error("Error closing WebSocket:", e);
                }
            }
        }
        socketRef.current = null;

        // 3. Libérer le micro
        if (stream) {
            stream.getTracks().forEach((track) => track.stop());
            console.log("useRealtimeTranscription: Microphone stream tracks stopped.");
        }
        audioStreamRef.current = null;

        // Réinitialiser les textes (optionnel, selon le besoin)
        // setTranscriptionText("");
        // setTranslationText("");
        setStatusMessage("Stream arrêté.");
        console.log(">>> useRealtimeTranscription: stopStreaming FINISHED <<<");
        // Un petit délai pour éviter les clics trop rapides qui pourraient interférer
        setTimeout(() => { isBusyRef.current = false; }, 200);

    }, []); // Pas de dépendances externes nécessaires pour stop


    // --- Démarrage Streaming ---
    const startStreaming = useCallback(async () => {
        if (isStreaming || isBusyRef.current) {
            console.warn("useRealtimeTranscription: Start request ignored, already streaming or busy.");
            return;
        }
        isBusyRef.current = true;
        console.log("useRealtimeTranscription: Attempting to start...");
        setStatusMessage("Préparation...");

        // Nettoyage préventif au cas où l'état précédent serait incohérent
        if (mediaRecorderRef.current || socketRef.current || audioStreamRef.current) {
             console.warn("useRealtimeTranscription: Previous resources detected. Cleaning up before start...");
             // Appel direct car on est déjà dans une fonction `useCallback`
              const recorder = mediaRecorderRef.current;
              const socket = socketRef.current;
              const stream = audioStreamRef.current;
              if (recorder && recorder.state === "recording") try { recorder.stop(); } catch(e){}
              if (socket) try { socket.close(1000, "Cleaning up before restart"); } catch(e){}
              if (stream) stream.getTracks().forEach(t => t.stop());
              mediaRecorderRef.current = null;
              socketRef.current = null;
              audioStreamRef.current = null;
        }


        setTranscriptionText(""); // Reset transcription on start
        setTranslationText(""); // Reset translation on start
        setStatusMessage("Demande accès micro...");

        try {
            // 1. Accès Microphone
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioStreamRef.current = stream;
            setStatusMessage("Micro OK. Connexion WS...");

            // 2. Créer WebSocket
            const socket = new WebSocket(WEBSOCKET_URL);
            socketRef.current = socket; // Assigner avant les listeners

            // --- Setup Listeners ---
            socket.onopen = () => {
                if (socketRef.current !== socket) return; // Stale connection check
                console.log("useRealtimeTranscription: WS onopen");
                setStatusMessage("Connecté. Démarrage enregistrement...");
                try {
                    // 4. Créer et démarrer MediaRecorder
                    const options = { mimeType: "audio/webm;codecs=opus" };
                    let actualMimeType = options.mimeType;
                    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                        console.warn(`mimeType ${options.mimeType} non supporté, essai par défaut.`);
                        actualMimeType = ""; // Laisser navigateur choisir
                    }
                    console.log("useRealtimeTranscription: Using MediaRecorder mimeType:", actualMimeType || "(Browser default)");

                    const recorder = new MediaRecorder(stream, actualMimeType ? options : undefined);
                    mediaRecorderRef.current = recorder; // Assigner avant listeners

                    recorder.ondataavailable = (event) => {
                         // Vérifier si le socket est toujours le bon et ouvert
                        if (socketRef.current === socket && socket.readyState === WebSocket.OPEN && event.data.size > 0) {
                            //console.log(`Sending chunk: ${event.data.size} bytes`); // DEBUG
                            socket.send(event.data); // Envoi direct du Blob
                        } else if (event.data.size > 0) {
                           // console.warn("ondataavailable: Socket not ready or changed, chunk dropped.");
                        }
                    };

                    recorder.onerror = (event) => {
                        console.error("useRealtimeTranscription: MediaRecorder error:", event);
                        setStatusMessage("Erreur enregistrement.");
                        stopStreaming(); // Nettoyer
                    };

                     recorder.onstop = () => {
                         console.log("useRealtimeTranscription: MediaRecorder stopped (onstop event).");
                         // Potentiellement envoyer un dernier chunk vide ou un signal ? Pour l'instant, non.
                     };

                    recorder.start(TIMESLICE_MS);
                    setIsStreaming(true);
                    setStatusMessage("Streaming en cours...");
                    console.log("useRealtimeTranscription: MediaRecorder started.");
                    isBusyRef.current = false; // Ready for stop command now

                } catch (recorderError) {
                    console.error("useRealtimeTranscription: ERROR creating/starting MediaRecorder:", recorderError);
                    setStatusMessage("Erreur MediaRecorder.");
                    stopStreaming(); // Nettoyer
                     isBusyRef.current = false;
                }
            }; // Fin de onopen

            socket.onmessage = (event) => {
                 if (socketRef.current !== socket) return; // Stale connection check
                try {
                    const data = JSON.parse(event.data);
                    //console.log("Message received:", data); // DEBUG
                    if (data.transcription !== undefined) {
                        setTranscriptionText(prev => {
                           // Simple remplacement, ou concaténation si backend envoie des segments?
                           // Pour l'instant, on remplace par le dernier reçu.
                           // Si le backend envoie des transcriptions finales de segments:
                           // return prev + " " + data.transcription;
                           // Si le backend renvoie la transcription complète à chaque fois:
                           return data.transcription;
                        });
                    }
                    if (data.translation !== undefined) {
                         setTranslationText(data.translation); // Remplacer
                    }
                     // Ajouter ici la gestion d'autres types de messages du serveur si besoin
                    // if (data.type === 'final_transcription') { ... }
                    // if (data.type === 'error') { ... }

                } catch (error) {
                    console.error("useRealtimeTranscription: Error parsing WS message or updating state:", error);
                     // Peut-être afficher un message d'erreur à l'utilisateur ?
                     // setStatusMessage("Erreur de communication serveur.");
                }
            };

            socket.onerror = (error) => {
                 // Vérifier si c'est toujours la connexion active avant de réagir
                if (socketRef.current === socket) {
                     console.error("useRealtimeTranscription: WS error:", error);
                     setStatusMessage("Erreur WebSocket.");
                     stopStreaming(); // Tenter de nettoyer
                } else {
                    console.warn("useRealtimeTranscription: Ignoring error from stale WebSocket connection.");
                }

            };

            socket.onclose = (event) => {
                 // Vérifier si la fermeture concerne la connexion active et si elle n'était pas intentionnelle (initiée par stopStreaming)
                if (socketRef.current === socket) {
                    console.log(`useRealtimeTranscription: WS closed - Code: ${event.code}, Reason: ${event.reason}`);
                     // Ne pas appeler stopStreaming() ici pour éviter une boucle si stopStreaming a causé la fermeture
                     // Seulement mettre à jour l'état si le streaming était censé être actif
                     if (isStreaming) {
                        setStatusMessage(`Déconnecté: ${event.reason || event.code}`);
                        setIsStreaming(false);
                         // On ne nullifie pas les refs ici car stopStreaming devrait déjà l'avoir fait si fermeture manuelle
                         // S'il s'agit d'une fermeture inattendue, il faut peut-être forcer le nettoyage
                         if (mediaRecorderRef.current || audioStreamRef.current) {
                            console.warn("WS closed unexpectedly while streaming, forcing cleanup.");
                             if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
                                try { mediaRecorderRef.current.stop(); } catch(e){}
                             }
                             if (audioStreamRef.current) {
                                audioStreamRef.current.getTracks().forEach(t => t.stop());
                             }
                             mediaRecorderRef.current = null;
                             audioStreamRef.current = null;
                         }

                     } else {
                         setStatusMessage("Stream arrêté."); // Message final si stopStreaming a bien fonctionné
                     }
                     socketRef.current = null; // Assurer que la ref est nulle après fermeture
                     isBusyRef.current = false; // Débloquer en cas de fermeture inattendue

                } else {
                     console.log("useRealtimeTranscription: Ignoring close event from stale WebSocket connection.");
                 }

            };

        } catch (error) {
            console.error("useRealtimeTranscription: Failed getUserMedia or WebSocket setup:", error);
             if ((error as Error).name === 'NotAllowedError') {
                setStatusMessage("Erreur: Accès micro refusé.");
             } else if ((error as Error).name === 'NotFoundError') {
                 setStatusMessage("Erreur: Aucun micro détecté.");
             } else {
                setStatusMessage("Erreur démarrage: " + (error as Error).message);
             }
            // Nettoyer si getUserMedia ou la connexion WS échoue
            if (audioStreamRef.current) {
                 audioStreamRef.current.getTracks().forEach((track) => track.stop());
                 audioStreamRef.current = null;
            }
            if (socketRef.current) {
                 // Détacher listeners avant de fermer
                 socketRef.current.onopen = null; socketRef.current.onmessage = null;
                 socketRef.current.onerror = null; socketRef.current.onclose = null;
                 if (socketRef.current.readyState !== WebSocket.CLOSED) {
                    try { socketRef.current.close(); } catch (e) {}
                 }
                 socketRef.current = null;
            }
             isBusyRef.current = false; // Débloquer après erreur
        }
    }, [isStreaming, stopStreaming]); // stopStreaming est stable

    // --- Effet de Nettoyage Global ---
    // S'assure que tout est arrêté si le composant qui utilise le hook est démonté
    useEffect(() => {
        return () => {
            console.log("useRealtimeTranscription: Cleanup on unmount.");
             // Appel de stopStreaming qui contient déjà la logique de nettoyage
             // Mais il faut s'assurer que les refs sont bien celles du moment du démontage
             const recorder = mediaRecorderRef.current;
             const socket = socketRef.current;
             const stream = audioStreamRef.current;

             if (recorder && recorder.state === "recording") try { recorder.stop(); } catch(e){}
             if (socket) try { socket.close(1000, "Component unmounted"); } catch(e){}
             if (stream) stream.getTracks().forEach(t => t.stop());

             mediaRecorderRef.current = null;
             socketRef.current = null;
             audioStreamRef.current = null;
        };
    }, []); // Exécuté seulement au montage et démontage

    // --- Retourner les valeurs et fonctions ---
    return {
        isStreaming,
        isTalking: isStreaming, // L'animation bouche suit directement l'état du streaming
        statusMessage,
        transcriptionText,
        translationText,
        startStreaming,
        stopStreaming,
    };
}