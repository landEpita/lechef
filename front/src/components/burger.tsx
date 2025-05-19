import React, { useEffect, useState } from "react";

const baseWidth = 667;
const baseHeight = 700;

const ingredients = [
  {
    name: "bottom_bread",
    src: "/src/assets/burger/bottom_bread.png",
    width: 667,
    height: 351,
    left: 0,
    top: 273,
    angle: 0,
  },
  {
    name: "steak",
    src: "/src/assets/burger/steak.png",
    width: 608,
    height: 418,
    left: 30,
    top: 157,
    angle: 0,
  },
  {
    name: "chedar",
    src: "/src/assets/burger/chedar.png",
    width: 608,
    height: 608,
    left: 34,
    top: 47,
    angle: 0,
  },
  {
    name: "tomato",
    src: "/src/assets/burger/tomato.png",
    width: 574.73,
    height: 574.73,
    left: 47,
    top: 0,
    angle: 0,
  },
  {
    name: "salad",
    src: "/src/assets/burger/salad.png",
    width: 553,
    height: 100,
    left: 58,
    top: 230,
    angle: 0,
  },
  {
    name: "upper_bread",
    src: "/src/assets/burger/upper_bread.png",
    width: 575,
    height: 305,
    left: 47,
    top: 0,
    angle: 0,
  },
];

type BurgerProps = {
  highlightIndex?: number; // facultatif, -1 pour aucune flèche
};

const Burger: React.FC<BurgerProps> = ({ highlightIndex = -1 }) => {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setExpanded(true), 300);
    return () => clearTimeout(timeout);
  }, []);

  const centerIndex = Math.floor(ingredients.length / 2);
  const separation = 40;

  return (
    <div className="w-full max-w-full h-[520px] flex items-center justify-center">
      <div className="relative w-full aspect-[667/700]">
        {ingredients.map((item, index) => {
          const offsetMultiplier = index - centerIndex;
          const offsetY = expanded ? -offsetMultiplier * separation : 0;

          const topOffset = (item.top / baseHeight) * 100;
          const leftOffset = (item.left / baseWidth) * 100;
          const widthPercent = (item.width / baseWidth) * 100;

          return (
            <React.Fragment key={item.name}>
              <img
                src={item.src}
                alt={item.name}
                className="absolute transition-all duration-700 ease-out"
                style={{
                  width: `${widthPercent}%`,
                  height: `${(item.height / baseHeight) * 100}%`,
                  left: `${leftOffset}%`,
                  top: `calc(${topOffset}% + ${offsetY}px)`,
                  transform: `rotate(${item.angle}deg)`,
                  transformOrigin: "center center",
                }}
              />
              {index === highlightIndex && (
                <img
                src="/src/assets/arrow.png"
                alt="Flèche"
                className="absolute w-8 h-4 transition-all duration-700 ease-out"
                style={{
                  top: `calc(${topOffset}% + ${offsetY}px + ${(item.height / baseHeight / 2) * 100}% - 8px)`,
                  left: `calc(10px)`,
                }}
              />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default Burger;
