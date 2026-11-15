export type GoalType = 'emagrecimento' | 'hipertrofia' | 'definicao' | 'saude';
export type ActivityLevel = 'sedentario' | 'leve' | 'moderado' | 'intenso' | 'atleta';
export type BiologicalSex = 'masculino' | 'feminino';
export type MealCategory = 'cafe' | 'almoco' | 'lanche' | 'jantar' | 'ceia';
export type WorkoutLevel = 'iniciante' | 'intermediario' | 'avancado';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  age: number;
  sex: BiologicalSex;
  height_cm: number;
  current_weight_kg: number;
  target_weight_kg: number;
  activity_level: ActivityLevel;
  goal: GoalType;
  dietary_restrictions: string[];
  workout_level: WorkoutLevel;
  home_equipment: string[];
  daily_calorie_target: number;
  protein_target_g: number;
  carbs_target_g: number;
  fat_target_g: number;
  water_target_ml: number;
  avatar_url?: string | null;
  onboarding_completed: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface MealFoodItem {
  name: string;
  portion: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface MealEntry {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  category: MealCategory;
  title: string;
  description?: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number;
  image_url?: string | null;
  items?: MealFoodItem[];
  ai_analyzed?: boolean;
  created_at: string;
}

export interface GeneratedMealPlanItem {
  category: MealCategory;
  time: string;
  title: string;
  description: string;
  ingredients: string[];
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface MealPlan {
  id: string;
  user_id: string;
  title: string;
  goal: GoalType;
  total_calories: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  meals: GeneratedMealPlanItem[];
  notes: string;
  created_at: string;
}

export type WorkoutCategoryName =
  | 'Corpo inteiro'
  | 'Abdômen'
  | 'Peito'
  | 'Braços'
  | 'Pernas'
  | 'Glúteos'
  | 'Costas'
  | 'Emagrecimento'
  | 'Alongamento'
  | 'Cardio';

export type WorkoutExerciseStage = 'warmup' | 'main' | 'cooldown';

export interface WorkoutExercise {
  id: string;
  name: string;
  muscle_group: string;
  target_muscles?: string[];
  sets: number;
  reps_or_duration: string;
  duration_seconds: number;
  rest_seconds: number;
  instructions: string;
  correct_position?: string;
  common_mistakes?: string;
  tips?: string;
  demo_archetype?: TutorialArchetype;
  stage?: WorkoutExerciseStage;
}

export interface WorkoutProgram {
  id: string;
  user_id?: string | null;
  title: string;
  category: string;
  level: WorkoutLevel;
  duration_minutes: number;
  estimated_calories: number;
  equipment: string[];
  description: string;
  warmup?: WorkoutExercise[];
  exercises: WorkoutExercise[];
  cooldown?: WorkoutExercise[];
  muscle_focus?: string[];
  is_ai_generated?: boolean;
  is_custom?: boolean;
  video_url?: string | null;
  created_at?: string;
}

export interface WorkoutLog {
  id: string;
  user_id: string;
  workout_id: string;
  workout_title: string;
  date: string; // YYYY-MM-DD
  duration_minutes: number;
  calories_burned: number;
  exercises_completed: number;
  skipped_exercises?: number;
  plan_id?: string | null;
  plan_day_number?: number | null;
  perceived_difficulty?: 'facil' | 'ideal' | 'intenso' | null;
  warmup_done?: boolean;
  cooldown_done?: boolean;
  notes?: string;
  created_at: string;
}

export interface TrainingPlanDay {
  day_number: number;
  is_rest_day: boolean;
  title: string;
  focus_category: WorkoutCategoryName;
  workout_id: string;
  duration_minutes: number;
  estimated_calories: number;
  intensity_multiplier: number;
  notes: string;
}

export interface TrainingPlan {
  id: string;
  user_id: string;
  title: string;
  duration_days: 7 | 14 | 30 | 60;
  level: WorkoutLevel;
  goal: GoalType | string;
  current_day: number;
  completed_days: number[];
  schedule: TrainingPlanDay[];
  active: boolean;
  started_at: string;
  updated_at?: string;
}

export interface WorkoutPreferences {
  user_id: string;
  favorite_exercise_ids: string[];
  substituted_exercises: Record<string, string>;
  preferred_level: WorkoutLevel;
  preferred_duration_min: number;
  focus_muscles: string[];
  voice_enabled: boolean;
  sound_enabled: boolean;
  countdown_seconds: number;
  rest_seconds: number;
  adaptive_multiplier: number;
  reminder_enabled: boolean;
  reminder_time: string;
  reminder_days: number[];
  reminder_frequency: 'diario' | 'dias_selecionados' | 'alternado';
  rest_time_reminder: string;
  updated_at?: string;
}

export interface WeightLog {
  id: string;
  user_id: string;
  date: string;
  weight_kg: number;
  waist_cm?: number | null;
  chest_cm?: number | null;
  hip_cm?: number | null;
  arm_cm?: number | null;
  notes?: string;
  created_at: string;
}

export interface WaterLog {
  id: string;
  user_id: string;
  date: string;
  amount_ml: number;
  updated_at: string;
}

export interface ProgressPhoto {
  id: string;
  user_id: string;
  date: string;
  weight_kg?: number | null;
  caption: string;
  image_url: string;
  created_at: string;
}

export interface CoachMessage {
  id: string;
  user_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface DashboardSummary {
  date: string;
  calories_consumed: number;
  calories_burned: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  water_ml: number;
  workouts_today: number;
  weekly_calories: Array<{
    date: string;
    label: string;
    consumed: number;
    burned: number;
    target: number;
  }>;
  weight_history: WeightLog[];
  streak_days: number;
}

export type TutorialArchetype =
  | 'squat'
  | 'jump_squat'
  | 'sumo_squat'
  | 'bulgarian'
  | 'lunge'
  | 'calf_raise'
  | 'jumping_jack'
  | 'high_knees'
  | 'mountain_climber'
  | 'burpee'
  | 'pushup'
  | 'incline_pushup'
  | 'diamond_pushup'
  | 'tricep_dip'
  | 'bicep_curl'
  | 'plank'
  | 'glute_bridge'
  | 'donkey_kick'
  | 'fire_hydrant'
  | 'superman'
  | 'dead_bug'
  | 'crunch'
  | 'russian_twist'
  | 'leg_raise'
  | 'side_plank'
  | 'bicycle_crunch'
  | 'bent_row'
  | 'shoulder_press'
  | 'lateral_raise'
  | 'renegade_row'
  | 'arm_circles'
  | 'torso_twist'
  | 'cat_camel'
  | 'child_pose'
  | 'cobra_stretch'
  | 'hamstring_stretch'
  | 'mobility_twist'
  | 'custom';

export interface PoseJoint2D {
  x: number;
  y: number;
}

export interface SkeletonPose2D {
  head: PoseJoint2D;
  neck: PoseJoint2D;
  hip: PoseJoint2D;
  shoulderL: PoseJoint2D;
  elbowL: PoseJoint2D;
  wristL: PoseJoint2D;
  shoulderR: PoseJoint2D;
  elbowR: PoseJoint2D;
  wristR: PoseJoint2D;
  kneeL: PoseJoint2D;
  ankleL: PoseJoint2D;
  kneeR: PoseJoint2D;
  ankleR: PoseJoint2D;
}

export interface ExerciseTutorialSpec {
  archetype: TutorialArchetype;
  tempo_seconds: number;
  phase_labels: [string, string, string];
  target_zones: string[];
  preparation: string;
  steps: string[];
  breathing: string;
  common_mistake: string;
  custom_keyframes?: [SkeletonPose2D, SkeletonPose2D, SkeletonPose2D] | null;
}

export interface AppConfigInfo {
  storageBackend: 'supabase' | 'sqlite';
  supabaseConfigured: boolean;
  supabaseServiceRole?: boolean;
  geminiConfigured: boolean;
  trainingMigrationPending?: boolean;
}
