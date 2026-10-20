/* ==========================================================================
   BEYOND — config.example.js
   --------------------------------------------------------------------------
   Supabase connection for the members area.

   ON YOUR COMPUTER: copy this file to js/config.js and fill in the two values
   (the same as VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env).
   js/config.js is listed in .gitignore, so it never goes to GitHub.

   ON THE LIVE SITE: you don't upload js/config.js. The "Deploy site" GitHub
   workflow writes it while publishing, from the repository secrets
   SUPABASE_URL and SUPABASE_ANON_KEY.

   Only ever use the "anon public" key here, NEVER the "service_role" key.
   ========================================================================== */

window.BEYOND_CONFIG = {
  supabaseUrl:     "",   // e.g. "https://abcdefgh.supabase.co"
  supabaseAnonKey: ""    // the "anon public" key
};
