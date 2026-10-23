// BEYOND — the questions of the two application forms (mentor.html, mentee.html),
// and how each answer is checked. The "name" of each question is the name="..."
// of the field in the form. Labels are used in the emails.
//
// If you add or change a question in a form, change it here too (and in
// QUESTIONS in js/admin.js, so the admin portal shows it with a nice label).

export type Role = "mentor" | "mentee";

type Kind = "text" | "long" | "email" | "url" | "check";
type Question = { name: string; label: string; kind: Kind; min?: number; max: number; optional?: boolean };

// Saved in their own columns, for both forms
const COMMON: Question[] = [
  { name: "first_name", label: "Name",    kind: "text",  min: 1, max: 60 },
  { name: "last_name",  label: "Surname", kind: "text",  min: 1, max: 60 },
  { name: "email",      label: "Email",   kind: "email", min: 3, max: 254 },
  { name: "city",       label: "City",    kind: "text",  min: 1, max: 80 },
  { name: "country",    label: "Country", kind: "text",  min: 1, max: 80 },
];

// Saved together in "answers"
const ANSWERS: Record<Role, Question[]> = {
  mentor: [
    { name: "company",        label: "Company",                       kind: "text", min: 1,  max: 120 },
    { name: "position",       label: "Role",                          kind: "text", min: 1,  max: 120 },
    { name: "field",          label: "Field",                         kind: "text", min: 1,  max: 80 },
    { name: "field_other",    label: "Field (other)",                 kind: "text", max: 120, optional: true },
    { name: "highest_degree", label: "Highest degree and university", kind: "text", min: 1,  max: 200 },
    { name: "linkedin",       label: "LinkedIn",                      kind: "url",  min: 1,  max: 300 },
    { name: "motivation",     label: "Why do you want to become a mentor?", kind: "long", min: 30, max: 3000 },
  ],
  mentee: [
    { name: "school",         label: "School or university",          kind: "text", min: 1,  max: 120 },
    { name: "programme",      label: "Degree programme",              kind: "text", min: 1,  max: 120 },
    { name: "gpa",            label: "GPA",                           kind: "text", min: 1,  max: 40 },
    { name: "field",          label: "Field of interest",             kind: "text", min: 1,  max: 80 },
    { name: "field_other",    label: "Field of interest (more)",      kind: "text", max: 120, optional: true },
    { name: "goals",          label: "Aspirations and goals",         kind: "long", min: 30, max: 3000 },
    { name: "achievement",    label: "Proudest achievement",          kind: "long", min: 30, max: 3000 },
  ],
};

const CHECKS: Question[] = [
  { name: "age_confirmed", label: "I am 18 or older",                kind: "check", max: 0 },
  { name: "consent",       label: "I agree to the Terms and Privacy Policy", kind: "check", max: 0 },
];

export type Application = {
  role: Role;
  email: string;
  first_name: string;
  last_name: string;
  city: string;
  country: string;
  answers: Record<string, string>;
};

export function isRole(value: unknown): value is Role {
  return value === "mentor" || value === "mentee";
}

function clean(value: unknown, kind: Kind): string {
  if (typeof value !== "string") return "";
  // Long answers keep their line breaks; one-line answers don't
  const text = kind === "long" ? value.replace(/\r\n?/g, "\n") : value.replace(/\s+/g, " ");
  return text.trim();
}

function valid(q: Question, value: string): boolean {
  if (!value) return !!q.optional;
  if (value.length < (q.min || 0) || value.length > q.max) return false;
  if (q.kind === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  if (q.kind === "url") {
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  }
  return true;
}

// Checks what the website sent. Returns the application, or the names of the wrong fields.
export function parseApplication(role: Role, fields: Record<string, unknown>):
  { ok: true; application: Application } | { ok: false; invalid: string[] } {
  const invalid: string[] = [];
  const read = (q: Question) => {
    const value = clean(fields[q.name], q.kind);
    if (!valid(q, value)) invalid.push(q.name);
    return value;
  };

  const common: Record<string, string> = {};
  COMMON.forEach((q) => { common[q.name] = read(q); });

  const answers: Record<string, string> = {};
  ANSWERS[role].forEach((q) => { answers[q.name] = read(q); });
  // "Other" needs its explanation; otherwise the explanation is dropped
  if (answers.field === "Other") {
    if (!answers.field_other) invalid.push("field_other");
  } else {
    delete answers.field_other;
  }

  CHECKS.forEach((q) => { if (fields[q.name] !== true) invalid.push(q.name); });

  if (invalid.length) return { ok: false, invalid };
  return {
    ok: true,
    application: {
      role,
      email: common.email.toLowerCase(),
      first_name: common.first_name,
      last_name: common.last_name,
      city: common.city,
      country: common.country,
      answers,
    },
  };
}

// Every answer with its label, in form order: for the emails
export function answerList(app: Application): { label: string; value: string }[] {
  const list = COMMON.map((q) => ({ label: q.label, value: String((app as Record<string, unknown>)[q.name] || "") }));
  ANSWERS[app.role].forEach((q) => {
    const value = app.answers[q.name];
    if (value) list.push({ label: q.label, value });
  });
  return list;
}
