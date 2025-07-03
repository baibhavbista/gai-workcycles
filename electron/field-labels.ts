// Field label mapping for embedding tasks
// Maps SQL column names to human-readable question labels
export const FIELD_LABEL_MAP = {
  // sessions - planning
  plan_objective: "What am I trying to accomplish?",
  plan_importance: "Why is this important and valuable?",
  plan_done_definition: "How will I know this is complete?",
  plan_hazards: "Any risks / hazards? (Potential distractions, procrastination, etc.)",
  plan_misc_notes: "Anything else noteworthy?",
  
  // sessions - review
  review_accomplishments: "What did I get done in this session?",
  review_comparison: "How did this compare to my normal work output?",
  review_obstacles: "Did I get bogged down? Where?",
  review_successes: "What went well? How can I replicate this in the future?",
  review_takeaways: "Any other takeaways? Lessons to share with others?",
  
  // cycles - planning
  plan_goal: "What am I trying to accomplish this cycle?",
  plan_first_step: "How will I get started?",
  plan_hazards_cycle: "Any hazards present?",
  
  // cycles - review
  review_noteworthy: "Anything noteworthy?",
  review_distractions: "Any distractions?",
  review_improvement: "Things to improve for next cycle?"
} as const;

export type FieldColumn = keyof typeof FIELD_LABEL_MAP;

// Get human-readable label for a field column
export function getFieldLabel(column: string): string | undefined {
  return FIELD_LABEL_MAP[column as FieldColumn];
}

// Get all field columns that should be embedded
export function getEmbeddableFields(): FieldColumn[] {
  return Object.keys(FIELD_LABEL_MAP) as FieldColumn[];
}

// Check if a column should be embedded
export function isEmbeddableField(column: string): column is FieldColumn {
  return column in FIELD_LABEL_MAP;
} 