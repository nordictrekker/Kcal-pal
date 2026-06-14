// Shared types for parsed nutrition data.

export type ParsedItem = {
  name: string;
  quantity: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type ParsedNutrition = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  serving_size: string;
  items: ParsedItem[];
  assumptions: string[];
  // Present on photo (vision) parses; optional elsewhere.
  confidence?: number;
};

export type Meal = "breakfast" | "lunch" | "dinner" | "snack";
export type FoodSource = "text" | "photo" | "barcode";

export type FoodEntry = {
  id: string;
  user_id: string;
  consumed_at: string;
  meal: Meal | null;
  description: string;
  source: FoodSource;
  photo_url: string | null;
  barcode: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  serving_size: string | null;
  raw_ai_response: unknown;
  edited_by_user: boolean;
  created_at: string;
};

export type Profile = {
  user_id: string;
  daily_calorie_target: number;
  daily_protein_target_g: number;
  daily_carb_target_g: number;
  daily_fat_target_g: number;
  daily_fiber_target_g: number;
  daily_water_target_ml: number;
  height_in: number | null;
  goal: string;
  phase_modifiers: unknown; // jsonb; normalized via lib/phase-modifiers
  created_at: string;
};
