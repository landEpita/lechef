import { useEffect, useState } from "react";
import face from "../assets/face-2.png";
import moustache from "../assets/moustache.png";
import positions from "../assets/position.json";

const blinkSequence = [1, 2, 3, 2, 1, 0];
const talkingSequence = [1, 2, 3, 4];

type FaceProps = {
  isTalking: boolean;
};

const Face: React.FC<FaceProps> = ({ isTalking }) => {
  const [currentEyeIndex, setCurrentEyeIndex] = useState(0);
  const [currentMouthIndex, setCurrentMouthIndex] = useState(0); // bouche de base

  // --- Clignement automatique ---
  useEffect(() => {
    let timeoutIds: NodeJS.Timeout[] = [];

    const blink = () => {
      blinkSequence.forEach((index, i) => {
        const timeout = setTimeout(() => {
          setCurrentEyeIndex(index);
        }, i * 50);
        timeoutIds.push(timeout);
      });
    };

    const startBlinkLoop = () => {
      const delay = Math.random() * 5000 + 3000; // entre 3s et 8s
      const interval = setTimeout(() => {
        blink();
        startBlinkLoop();
      }, delay);
      timeoutIds.push(interval);
    };
    startBlinkLoop();

    return () => {
      timeoutIds.forEach(clearTimeout);
    };
  }, []);

  // --- Parole manuelle ---
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (isTalking) {
      let i = 0;
      intervalId = setInterval(() => {
        setCurrentMouthIndex(talkingSequence[i]);
        i = (i + 1) % talkingSequence.length;
      }, 120);
    } else {
      setCurrentMouthIndex(0); // bouche normale
    }

    return () => clearInterval(intervalId);
  }, [isTalking]);

  const eye = positions.eyes[currentEyeIndex];
  const mouth = positions.mouths[currentMouthIndex];

  return (
    <div
      className="relative"
      style={{ width: "537.08px", height: "710.68px" }}
    >
      {/* Image du visage */}
      <img
        src={face}
        alt="Face"
        className="absolute top-0 left-0 w-full h-full object-cover"
      />

      <img
        key={mouth.name}
        src={mouth.image}
        alt={mouth.name}
        className="absolute"
        style={{
          width: `${mouth.width}px`,
          height: `${mouth.height}px`,
          left: `${mouth.left}px`,
          top: `${mouth.top}px`,
        }}
      />

      <img
        key={eye.name}
        src={eye.image}
        alt={eye.name}
        className="absolute"
        style={{
          width: `${eye.width}px`,
          height: `${eye.height}px`,
          left: `${eye.left}px`,
          top: `${eye.top}px`,
        }}
      />

      {/* Moustache positionnée précisément */}
      <img
        src={moustache}
        alt="Moustache"
        className="absolute"
        style={{
          width: "206.99px",
          height: "118.17px",
          left: "165.58px",
          top: "283.68px",
        }}
      />
    </div>
  );
};

export default Face;
