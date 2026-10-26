export interface EarthsKitchenMenuItem {
  id: string;
  name: string;
  category: EarthsKitchenCategory;
  price: number;
  description?: string;
  macros?: {
    calories?: number;
    protein?: number;
    fat?: number;
    carbs?: number;
  };
  supportsAddons?: boolean;
}

export type EarthsKitchenCategory =
  | 'Caffeine Filled Pre-Workout'
  | 'Collagen & Gut Healing Shakes'
  | 'Protein Shakes'
  | 'Coffee Based'
  | 'Matcha'
  | 'Protein Based Coffee'
  | 'Hot Beverages'
  | 'Mocktails'
  | 'Water';

export interface EarthsKitchenAddon {
  id: string;
  name: string;
  price: number;
  description?: string;
}

export const EARTHS_KITCHEN_CATEGORIES: EarthsKitchenCategory[] = [
  'Caffeine Filled Pre-Workout',
  'Collagen & Gut Healing Shakes',
  'Protein Shakes',
  'Coffee Based',
  'Matcha',
  'Protein Based Coffee',
  'Hot Beverages',
  'Mocktails',
  'Water',
];

export const EARTHS_KITCHEN_ADDONS: EarthsKitchenAddon[] = [
  {
    id: 'addon-milk-alt',
    name: 'Milk Alternative',
    price: 40,
    description: 'Almond, Coconut, or Oat milk substitute',
  },
  {
    id: 'addon-creatine',
    name: 'Creatine Scoop',
    price: 60,
    description: '5g pure micronized creatine monohydrate',
  },
  {
    id: 'addon-toppings',
    name: 'Extra Toppings (Chia / Flax / Shaved Coconut)',
    price: 30,
    description: 'Price based on selection',
  },
];

export const EARTHS_KITCHEN_MENU: EarthsKitchenMenuItem[] = [
  // 1. Caffeine Filled Pre-Workout
  {
    id: 'ek-big-matcha-energy',
    name: 'Big Matcha Energy',
    category: 'Caffeine Filled Pre-Workout',
    price: 200,
    description: 'Matcha, banana, protein powder, honey and milk.',
    macros: { calories: 334, protein: 32, fat: 8, carbs: 36 },
    supportsAddons: true,
  },
  {
    id: 'ek-pre-pump',
    name: 'Pre-Pump',
    category: 'Caffeine Filled Pre-Workout',
    price: 210,
    description: 'Espresso shot, raw cocoa powder, banana, protein powder, milk & honey.',
    macros: { calories: 330, protein: 31, fat: 8, carbs: 35 },
    supportsAddons: true,
  },
  {
    id: 'ek-pre-workout-scoop',
    name: 'Pre-workout',
    category: 'Caffeine Filled Pre-Workout',
    price: 100,
    description: 'Scoop of your flavour of choice of pre-workout.',
    supportsAddons: true,
  },
  {
    id: 'ek-protein-shake-scoop',
    name: 'Protein Shake',
    category: 'Caffeine Filled Pre-Workout',
    price: 160,
    description: 'Scoop of your flavour of choice of protein.',
    supportsAddons: true,
  },

  // 2. Collagen & Gut Healing Shakes
  {
    id: 'ek-hormone-harmony',
    name: 'Hormone Harmony',
    category: 'Collagen & Gut Healing Shakes',
    price: 230,
    description: 'Banana, collagen powder, almond milk, cinnamon and honey.',
    macros: { calories: 223, protein: 13, fat: 4, carbs: 39 },
    supportsAddons: true,
  },
  {
    id: 'ek-skin-booster',
    name: 'Skin Booster',
    category: 'Collagen & Gut Healing Shakes',
    price: 230,
    description: 'Banana, pineapple, coconut milk, honey, beetroot powder and collagen powder.',
    macros: { calories: 255, protein: 12.2, fat: 5, carbs: 49 },
    supportsAddons: true,
  },
  {
    id: 'ek-gut-healer',
    name: 'Gut Healer',
    category: 'Collagen & Gut Healing Shakes',
    price: 230,
    description: 'Sea moss powder, blueberry, strawberry, coconut milk, flaxseed, shaved coconut, honey.',
    macros: { calories: 166, protein: 2, fat: 6.5, carbs: 28 },
    supportsAddons: true,
  },
  {
    id: 'ek-fat-burner',
    name: 'Fat Burner',
    category: 'Collagen & Gut Healing Shakes',
    price: 230,
    description: 'Green tea, coconut milk, lemon juice, fresh ginger, pineapple, collagen powder, chia seeds and honey.',
    macros: { calories: 196, protein: 12, fat: 4, carbs: 32 },
    supportsAddons: true,
  },

  // 3. Protein Shakes
  {
    id: 'ek-berryland',
    name: 'Berryland',
    category: 'Protein Shakes',
    price: 200,
    description: 'Strawberry, banana, protein powder and milk.',
    macros: { calories: 310, protein: 30, fat: 6, carbs: 30 },
    supportsAddons: true,
  },
  {
    id: 'ek-choconana',
    name: 'Choconana',
    category: 'Protein Shakes',
    price: 200,
    description: 'Raw cocoa powder, banana, protein powder, milk and honey.',
    macros: { calories: 360, protein: 34, fat: 9, carbs: 39 },
    supportsAddons: true,
  },
  {
    id: 'ek-nutz-for-gainz',
    name: 'Nutz for Gainz',
    category: 'Protein Shakes',
    price: 220,
    description: 'Peanut butter, banana, oats, protein powder, honey & milk.',
    macros: { calories: 716, protein: 48, fat: 36, carbs: 73 },
    supportsAddons: true,
  },
  {
    id: 'ek-testosterone-booster',
    name: 'Testosterone Booster',
    category: 'Protein Shakes',
    price: 210,
    description: 'Maca root, ginseng, cinnamon, banana, protein powder, honey & milk.',
    macros: { calories: 441, protein: 35, fat: 9.5, carbs: 60 },
    supportsAddons: true,
  },
  {
    id: 'ek-dark-glow',
    name: 'Dark Glow',
    category: 'Protein Shakes',
    price: 210,
    description: 'Activated charcoal, coconut cream, banana, protein powder, honey, milk and coconut shavings.',
    macros: { calories: 424, protein: 33, fat: 16, carbs: 36 },
    supportsAddons: true,
  },
  {
    id: 'ek-the-blues',
    name: 'The Blues',
    category: 'Protein Shakes',
    price: 210,
    description: 'Blue spirulina powder, cinnamon, banana, protein powder, honey & milk.',
    macros: { calories: 351, protein: 32, fat: 8, carbs: 35 },
    supportsAddons: true,
  },
  {
    id: 'ek-blueblast',
    name: 'Blueblast',
    category: 'Protein Shakes',
    price: 220,
    description: 'Blueberry, strawberry, protein powder, honey and milk.',
    macros: { calories: 300, protein: 30, fat: 6, carbs: 22 },
    supportsAddons: true,
  },
  {
    id: 'ek-acai-berry',
    name: 'Acai Berry',
    category: 'Protein Shakes',
    price: 210,
    description: 'Acai, strawberry, protein powder, honey, milk.',
    macros: { calories: 290, protein: 30, fat: 9, carbs: 18 },
    supportsAddons: true,
  },

  // 4. Coffee Based
  {
    id: 'ek-espresso-single',
    name: 'Espresso (Single)',
    category: 'Coffee Based',
    price: 55,
    description: 'Single shot freshly pulled espresso.',
  },
  {
    id: 'ek-espresso-double',
    name: 'Espresso (Double)',
    category: 'Coffee Based',
    price: 75,
    description: 'Double shot freshly pulled espresso.',
  },
  {
    id: 'ek-turkish-single',
    name: 'Turkish Coffee (Single)',
    category: 'Coffee Based',
    price: 45,
    description: 'Traditional single Turkish coffee.',
  },
  {
    id: 'ek-turkish-double',
    name: 'Turkish Coffee (Double)',
    category: 'Coffee Based',
    price: 55,
    description: 'Traditional double Turkish coffee.',
  },
  {
    id: 'ek-cortado',
    name: 'Cortado',
    category: 'Coffee Based',
    price: 80,
    description: 'Equal parts espresso and steamed milk.',
    supportsAddons: true,
  },
  {
    id: 'ek-latte',
    name: 'Latte',
    category: 'Coffee Based',
    price: 110,
    description: 'Smooth espresso with steamed milk.',
    supportsAddons: true,
  },
  {
    id: 'ek-flat-white',
    name: 'Flat White',
    category: 'Coffee Based',
    price: 90,
    description: 'Double ristretto with velvety microfoam.',
    supportsAddons: true,
  },
  {
    id: 'ek-banana-latte',
    name: 'Banana Latte',
    category: 'Coffee Based',
    price: 140,
    description: 'Signature banana-infused espresso latte.',
    supportsAddons: true,
  },
  {
    id: 'ek-spanish-latte',
    name: 'Spanish Latte',
    category: 'Coffee Based',
    price: 120,
    description: 'Sweetened condensed milk & espresso latte.',
    supportsAddons: true,
  },
  {
    id: 'ek-white-mocha',
    name: 'White Mocha',
    category: 'Coffee Based',
    price: 120,
    description: 'Rich white chocolate & espresso with milk.',
    supportsAddons: true,
  },
  {
    id: 'ek-cappuccino',
    name: 'Cappuccino',
    category: 'Coffee Based',
    price: 100,
    description: 'Classic espresso topped with airy milk foam.',
    supportsAddons: true,
  },
  {
    id: 'ek-americano',
    name: 'Americano',
    category: 'Coffee Based',
    price: 80,
    description: 'Rich espresso diluted with hot or iced water.',
  },

  // 5. Matcha
  {
    id: 'ek-spanish-matcha',
    name: 'Spanish Matcha',
    category: 'Matcha',
    price: 160,
    description: 'Ceremonial grade matcha with sweetened milk.',
    supportsAddons: true,
  },
  {
    id: 'ek-cloud-coconut-matcha',
    name: 'Cloud Coconut Matcha',
    category: 'Matcha',
    price: 180,
    description: 'Refreshing coconut water topped with ceremonial matcha cloud foam.',
    supportsAddons: true,
  },
  {
    id: 'ek-honey-matcha',
    name: 'Honey Matcha',
    category: 'Matcha',
    price: 160,
    description: 'Ceremonial matcha sweetened with pure natural honey.',
    supportsAddons: true,
  },
  {
    id: 'ek-spiced-banana-matcha',
    name: 'Spiced Banana Matcha',
    category: 'Matcha',
    price: 160,
    description: 'Ceremonial matcha blended with banana and warm spices.',
    supportsAddons: true,
  },

  // 6. Protein Based Coffee
  {
    id: 'ek-vanilla-protein-cold-foam-latte',
    name: 'Vanilla Protein Cold Foam Latte',
    category: 'Protein Based Coffee',
    price: 180,
    description: 'Contains 18g of protein. Espresso over ice with vanilla protein cold foam.',
    macros: { protein: 18 },
    supportsAddons: true,
  },
  {
    id: 'ek-chocolate-protein-cold-foam-latte',
    name: 'Chocolate Protein Cold Foam Latte',
    category: 'Protein Based Coffee',
    price: 180,
    description: 'Contains 18g of protein. Espresso over ice with chocolate protein cold foam.',
    macros: { protein: 18 },
    supportsAddons: true,
  },

  // 7. Hot Beverages
  {
    id: 'ek-green-tea',
    name: 'Green Tea',
    category: 'Hot Beverages',
    price: 80,
    description: 'Antioxidant-rich soothing hot green tea.',
  },
  {
    id: 'ek-digest-aid-tea',
    name: 'Digest Aid Tea',
    category: 'Hot Beverages',
    price: 90,
    description: 'Herbal infusion formulated to support digestion.',
  },
  {
    id: 'ek-chai-cinnamon-tea',
    name: 'Chai Cinnamon Tea',
    category: 'Hot Beverages',
    price: 80,
    description: 'Warming spiced chai with aromatic cinnamon.',
  },
  {
    id: 'ek-diet-support-tea',
    name: 'Diet Support Tea',
    category: 'Hot Beverages',
    price: 90,
    description: 'Metabolism-supporting herbal tea blend.',
  },

  // 8. Mocktails
  {
    id: 'ek-hydration-station',
    name: 'Hydration Station',
    category: 'Mocktails',
    price: 110,
    description: 'Coconut water, lemon, cucumber & apple.',
    macros: { calories: 185 },
  },
  {
    id: 'ek-go-green',
    name: 'Go Green',
    category: 'Mocktails',
    price: 110,
    description: 'Kiwi, celery, cucumber & apple.',
    macros: { calories: 190 },
  },
  {
    id: 'ek-ice-spice',
    name: 'Ice Spice',
    category: 'Mocktails',
    price: 60,
    description: 'Ginger, carrot, black pepper & apple.',
    macros: { calories: 70 },
  },
  {
    id: 'ek-blood-orange',
    name: 'Blood Orange',
    category: 'Mocktails',
    price: 110,
    description: 'Carrot, orange, beetroot & apple.',
    macros: { calories: 210 },
  },
  {
    id: 'ek-black-lemonade',
    name: 'Black Lemonade',
    category: 'Mocktails',
    price: 110,
    description: 'Activated charcoal, lemon & honey.',
    macros: { calories: 110 },
  },
  {
    id: 'ek-immunity-shot',
    name: 'Immunity Shot',
    category: 'Mocktails',
    price: 60,
    description: 'Ginger, lemon & apple.',
    macros: { calories: 80 },
  },
  {
    id: 'ek-pink-banana',
    name: 'Pink Banana',
    category: 'Mocktails',
    price: 110,
    description: 'Banana, strawberry and milk.',
    macros: { calories: 258 },
    supportsAddons: true,
  },
  {
    id: 'ek-apple-juice',
    name: 'Apple Juice',
    category: 'Mocktails',
    price: 170,
    description: 'Freshly squeezed apple juice.',
    macros: { calories: 156 },
  },
  {
    id: 'ek-orange-juice',
    name: 'Orange',
    category: 'Mocktails',
    price: 110,
    description: 'Fresh orange juice.',
    macros: { calories: 153 },
  },
  {
    id: 'ek-whats-up-doc',
    name: 'Whats up Doc',
    category: 'Mocktails',
    price: 120,
    description: 'Fresh carrot & orange juice blend.',
    macros: { calories: 153 },
  },

  // 9. Water
  {
    id: 'ek-small-water',
    name: 'Small Water',
    category: 'Water',
    price: 15,
    description: 'Chilled mineral water (Small).',
  },
  {
    id: 'ek-large-water',
    name: 'Large Water',
    category: 'Water',
    price: 25,
    description: 'Chilled mineral water (Large).',
  },
];
