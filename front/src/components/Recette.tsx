import React from "react";

type RecetteProps = {
  title: string;
  ingredients: string[];
  instructions: string[];
};

const Recette: React.FC<RecetteProps> = ({ title, ingredients, instructions }) => {
  return (
    <div className="absolute right-[5%] top-1/2 -translate-y-1/2  bg-[#f4d6a0] border-4 border-[#8b4f2d] rounded-xl p-6 w-[420px] shadow-lg font-serif text-[#5a2e1b]">
      <h2 className="text-3xl font-bold text-center mb-4">{title}</h2>

      <div className="mb-4">
        <h3 className="text-xl font-bold mb-2 flex items-center">
          <span className="mr-2">📏</span> Ingredients
        </h3>
        <ul className="list-disc list-inside">
          {ingredients.map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="text-xl font-bold mb-2 flex items-center">
          <span className="mr-2">👨‍🍳</span> Instructions
        </h3>
        <ol className="list-decimal list-inside space-y-1">
          {instructions.map((step, idx) => (
            <li key={idx}>{step}</li>
          ))}
        </ol>
      </div>
    </div>
  );
};

export default Recette;
