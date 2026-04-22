import { COUNTRY_IDS } from "./countries";

type ParsedFilters = {
  gender?: string;
  age_group?: string;
  country_id?: string;
  min_age?: number;
  max_age?: number;
};

export function parseNLQuery(q: string): ParsedFilters | null {
  const text = q.toLowerCase().trim();
  const filters: ParsedFilters = {};
  let recognized = false;

  // Gender — check "male and female" / "both" first to avoid partial matches
  if (/\b(male\s+and\s+female|female\s+and\s+male|both\s+genders?|all\s+genders?)\b/.test(text)) {
    recognized = true;
  } else if (/\b(female|females|woman|women|girl|girls)\b/.test(text)) {
    filters.gender = "female";
    recognized = true;
  } else if (/\b(male|males|man|men|boy|boys)\b/.test(text)) {
    filters.gender = "male";
    recognized = true;
  }

  // "young" maps to min_age/max_age, not age_group
  if (/\byoung\b/.test(text)) {
    filters.min_age = 16;
    filters.max_age = 24;
    recognized = true;
  }

  // Age groups (only if "young" not matched for teenager/adult overlap)
  if (/\b(child|children|kid|kids)\b/.test(text)) {
    filters.age_group = "child";
    recognized = true;
  } else if (/\b(teenager|teenagers|teen|teens|adolescent|adolescents)\b/.test(text)) {
    filters.age_group = "teenager";
    recognized = true;
  } else if (/\b(adult|adults)\b/.test(text)) {
    filters.age_group = "adult";
    recognized = true;
  } else if (/\b(senior|seniors|elderly|elder|elders|old people|old)\b/.test(text)) {
    filters.age_group = "senior";
    recognized = true;
  }

  // Age ranges
  const minAgeMatch = text.match(
    /\b(?:above|over|older than|at least)\s+(\d+)\b/
  );
  if (minAgeMatch) {
    filters.min_age = parseInt(minAgeMatch[1], 10);
    recognized = true;
  }

  const maxAgeMatch = text.match(
    /\b(?:below|under|younger than|at most)\s+(\d+)\b/
  );
  if (maxAgeMatch) {
    filters.max_age = parseInt(maxAgeMatch[1], 10);
    recognized = true;
  }

  // Country — look for "from|in|of <country name>"
  const countryMatch = text.match(
    /\b(?:from|in|of)\s+([a-z\s''é\-]+?)(?:\s*$|\s+(?:who|that|with|aged|above|below|over|under|older|younger))/
  );
  if (countryMatch) {
    const candidate = countryMatch[1].trim();
    const countryId = COUNTRY_IDS[candidate];
    if (countryId) {
      filters.country_id = countryId;
      recognized = true;
    }
  }

  // Fallback: try matching any country name anywhere in the text
  if (!filters.country_id) {
    for (const [name, id] of Object.entries(COUNTRY_IDS)) {
      if (text.includes(name)) {
        filters.country_id = id;
        recognized = true;
        break;
      }
    }
  }

  return recognized ? filters : null;
}
