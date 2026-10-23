// BEYOND — settings for the Edge Functions, set once with
//   npx supabase secrets set NAME=value
// Every Beyond secret starts with BEYOND_, because the Supabase project (and so
// its list of secrets) is shared with another app. See the README.

export function env(name: string, fallback?: string): string {
  const value = Deno.env.get(name);
  if (value) return value;
  if (fallback !== undefined) return fallback;
  throw new Error("Missing secret " + name + " (see the README, Members area setup)");
}

// The address of the website, without a trailing slash,
// e.g. https://beyondicmc.com
export function siteUrl(): string {
  return env("BEYOND_SITE_URL").replace(/\/+$/, "");
}

export const JOIN_LINK_DAYS = 14;
