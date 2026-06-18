// Shared types for parsed nutrition data.

export type ParsedItem = {
  name: string;
  quantity: string;
  // Estimated edible weight of this item, in grams. Used to scale USDA
  // FoodData Central per-100 g micronutrients. Optional (older entries / the
  // model may omit it).
  grams?: number;
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
  // Extended nutrients (AI-estimated; directional). 0 when not estimable.
  saturated_fat_g: number;
  cholesterol_mg: number;
  iron_mg: number;
  calcium_mg: number;
  magnesium_mg: number;
  vitamin_d_mcg: number;
  omega3_mg: number;
  // Distinct whole-plant foods in the meal (for plant-diversity goal).
  plants: string[];
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
  saturated_fat_g: number | null;
  cholesterol_mg: number | null;
  iron_mg: number | null;
  calcium_mg: number | null;
  magnesium_mg: number | null;
  vitamin_d_mcg: number | null;
  omega3_mg: number | null;
  plants: string[] | null;
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
  water_goal_mode: "auto" | "manual" | null;
  // Which metric keys to show on the home calorie card (null → default set).
  visible_metrics: string[] | null;
  height_in: number | null;
  goal: string;
  phase_modifiers: unknown; // jsonb; normalized via lib/phase-modifiers
  // Onboarding / personalization
  first_name: string | null;
  date_of_birth: string | null; // YYYY-MM-DD
  sex: string | null;
  onboarding_completed: boolean;
  // Smarter targets
  activity_level: string | null;
  target_mode: "manual" | "auto" | null;
  protein_per_kg: number | null;
  // Cycle automation
  // Timezone awareness (device clock, for local time-of-day display)
  timezone: string | null;
  previous_timezone: string | null;
  timezone_updated_at: string | null;
  // Location-based travel detection (IP geolocation + user confirmation)
  home_tz: string | null;
  home_label: string | null;
  home_lat: number | null;
  home_lng: number | null;
  current_tz: string | null;
  current_label: string | null;
  current_lat: number | null;
  current_lng: number | null;
  location_at: string | null;
  travel_status: "home" | "pending" | "traveling" | null;
  travel_started_at: string | null;
  travel_manual: boolean | null;
  track_cycle: boolean;
  last_period_start: string | null; // YYYY-MM-DD
  avg_cycle_length: number | null;
  avg_period_length: number | null;
  // Goal projection
  goal_weight_lbs: number | null;
  created_at: string;
};
