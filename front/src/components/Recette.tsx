import React from 'react';
import Burger from './burger';

// Référence unique de toutes les couches disponibles, dans l’ordre « de bas en haut ».
const INGREDIENT_NAMES = [
  'bottom_bread',
  'chedar',
  'steak',
  'salad',
  'upper_bread',
] as const;

type IngredientIndex = number; // 0 → bottom_bread, 1 → steak, etc.

type RecetteProps = {
  title: string;
  ingredients: IngredientIndex[];
  highlightIndex?: number;
};

const Recette: React.FC<RecetteProps> = ({
  title,
  ingredients,
  highlightIndex = -1,
}) => {
  // Conversion des index numériques vers les noms d’ingrédients attendus par <Burger />
  const order = ingredients
    .map((i) => INGREDIENT_NAMES[i])

  return (
    <div className="absolute right-[5%] top-1/2 -translate-y-1/2 bg-[#f4d6a0] border-4 border-[#8b4f2d] rounded-xl px-6 pt-20 pb-6 w-[420px] shadow-lg font-serif text-[#5a2e1b] overflow-visible">
      <h2 className="text-3xl font-bold text-center mb-4 z-10 relative">{title}</h2>

      <div className="relative z-0 -mt-10">
        <Burger order={order} highlightIndex={highlightIndex} />
      </div>
    </div>
  );
};

export default Recette;
