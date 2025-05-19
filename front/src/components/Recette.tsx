import React from "react";
import Burger from "./burger";

type RecetteProps = {
  title: string;
  ingredients: string[];
};

const Recette: React.FC<RecetteProps> = ({ title, ingredients }) => {
  return (
    <div className="absolute right-[5%] top-1/2 -translate-y-1/2 bg-[#f4d6a0] border-4 border-[#8b4f2d] rounded-xl px-6 pt-20 pb-6 w-[420px] shadow-lg font-serif text-[#5a2e1b] overflow-visible">
      <h2 className="text-3xl font-bold text-center mb-4 z-10 relative">{title}</h2>

      <div className="relative z-0 -mt-10">
      <Burger highlightIndex={0} />
      </div>
    </div>
  );
};

export default Recette;
