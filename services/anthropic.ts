// ⚠️  SECURITY: EXPO_PUBLIC_* vars are bundled into the app binary.
// For production, proxy this through a Supabase Edge Function instead:
//   https://supabase.com/docs/guides/functions
//   The edge function calls Anthropic with a server-side key; the app calls the edge function.

import type { MealRelation } from '../hooks/useTodaySchedule';

const API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '';
// Note: user requested claude-sonnet-4-20250514, which has been superseded by claude-sonnet-4-6
const MODEL   = 'claude-sonnet-4-6';

export type ExtractedMedicine = {
  name:          string;
  dosage:        string;
  frequency:     string;
  meal_relation: MealRelation;
};

// Kept exactly as specified in the task requirements
const SYSTEM_PROMPT =
  'You are a medical prescription reader. Extract all medicines from the image. ' +
  'Return ONLY a JSON array with objects: {name, dosage, frequency, meal_relation}. ' +
  'Valid meal_relation values: before_meal, with_meal, after_meal, independent. ' +
  'Frequency should be a string like "Once daily", "Twice daily", or "Thrice daily". ' +
  'If you cannot read a medicine clearly, skip it.';

function toMealRelation(raw: unknown): MealRelation {
  if (raw === 'before_meal' || raw === 'with_meal' || raw === 'after_meal') return raw;
  return 'independent';
}

function parseResponse(text: string): ExtractedMedicine[] {
  // Strip markdown fences if present
  let clean = text.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/m, '').trim();

  // If the text contains prose around the JSON, extract just the array
  const arrayMatch = clean.match(/\[[\s\S]*\]/);
  if (arrayMatch) clean = arrayMatch[0];

  const arr = JSON.parse(clean);
  if (!Array.isArray(arr)) throw new Error('Claude did not return a JSON array');

  return arr
    .filter((item: unknown) => {
      if (typeof item !== 'object' || item === null) return false;
      const name = (item as Record<string, unknown>).name;
      return typeof name === 'string' && name.trim().length > 0;
    })
    .map((item: Record<string, unknown>): ExtractedMedicine => ({
      name:          String(item.name          ?? '').trim(),
      dosage:        String(item.dosage         ?? '').trim(),
      frequency:     String(item.frequency      ?? 'Once daily').trim(),
      meal_relation: toMealRelation(item.meal_relation),
    }));
}

export async function extractMedicinesFromImage(
  base64: string,
  mediaType: 'image/jpeg' | 'image/png' = 'image/jpeg'
): Promise<ExtractedMedicine[]> {
  if (!API_KEY) {
    throw new Error(
      'Anthropic API key not set.\n\nAdd EXPO_PUBLIC_ANTHROPIC_API_KEY to your .env file.'
    );
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: 1024,
      // Cache the system prompt — saves tokens on every subsequent scan
      system: [
        {
          type:          'text',
          text:          SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: [
            {
              type:   'image',
              source: { type: 'base64', media_type: mediaType, data: base64 },
            },
            {
              type: 'text',
              text: 'Extract all medicines from this prescription.',
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    let msg = `API error ${res.status}`;
    try {
      const body = await res.json();
      msg = (body as { error?: { message?: string } })?.error?.message ?? msg;
    } catch { /* ignore parse error */ }
    throw new Error(msg);
  }

  const data = await res.json() as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = data?.content?.[0]?.text;
  if (!text) throw new Error('Empty response from Claude');

  return parseResponse(text);
}
