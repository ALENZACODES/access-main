import type { Prompt } from "./types";

/**
 * Prompt catalog. `field_id` values are the intended sci-fields keys; the
 * sci-fields set is not in this bundle, so confirm the exact ids on merge.
 * Wording is neutral: no medical terms, no advice.
 */
export const PROMPTS: readonly Prompt[] = [
  {
    id: "elevator",
    field_id: "elevator_working",
    observed: true,
    text: { en: "Elevator working?", fr: "Ascenseur en service ?" },
  },
  {
    id: "washroom",
    field_id: "washroom_usable_for_transfer",
    observed: true,
    text: {
      en: "Washroom usable for your transfer?",
      fr: "Toilettes utilisables pour votre transfert ?",
    },
  },
  {
    id: "snowbank",
    field_id: "curb_snowbank_present",
    observed: true,
    text: { en: "Snowbank at the curb?", fr: "Banc de neige au bord du trottoir ?" },
  },
  {
    id: "door",
    field_id: "door_usable",
    observed: true,
    text: { en: "Door usable?", fr: "Porte utilisable ?" },
  },
  {
    id: "staff",
    field_id: "staff_helped_observed",
    observed: true,
    text: { en: "Did staff help?", fr: "Le personnel a-t-il aid\u00e9 ?" },
  },
];

export function findPrompt(id: string): Prompt | undefined {
  return PROMPTS.find((p) => p.id === id);
}
