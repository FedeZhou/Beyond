/* ==========================================================================
   BEYOND — content.js
   --------------------------------------------------------------------------
   THIS IS THE FILE YOU EDIT.
   Mentors, founders, projects, form links, email, the members area settings
   and the short interface texts (menu labels, form messages) all live here.

   Rules of thumb:
   - Only change the text between the quotes "like this".
   - Keep the commas at the end of each line/block.
   - Save the file and refresh the browser to see the change.
   - The long story text is NOT here: it is in about.html (and the short
     version in index.html), inside the blocks marked "EDIT: STORY TEXT".

   Adding photos (Home and About pages):
   1. Edit the text here: mentors, founders, projects.
   2. Crop the photo to the right shape:
        mentors  square    800 x 800 px
        founders portrait  800 x 1000 px
        projects landscape 1200 x 675 px
   3. Compress it at https://squoosh.app (aim for under ~150 KB).
   4. Name the file in lowercase with hyphens, no spaces or accents,
      e.g. anna-chen.jpg (capital letters can break the photo online).
   5. Put it in its folder: assets/img/mentors/, founders/ or projects/.
   6. Write its path here, e.g. photo: "assets/img/mentors/anna-chen.jpg"
   7. Refresh the page. A grey placeholder means the path is wrong.
   8. Get each mentor's written OK (an email is enough) before publishing
      their photo and details.
   ========================================================================== */

window.BEYOND = {

  /* ------------------------------------------------------------------------
     EDIT HERE: General
     ------------------------------------------------------------------------ */
  site: {
    name: "Beyond"
  },

  contact: {
    email: "hello@beyond-placeholder.org"          // PLACEHOLDER: your real contact email
  },

  /* ------------------------------------------------------------------------
     EDIT HERE: Legal links (footer, second row)
     url: the page or document for each one, e.g. "privacy.html".
     Delete a line to hide that link.
     ------------------------------------------------------------------------ */
  legal: [
    { label: "Privacy Policy", url: "#" },          // PLACEHOLDER
    { label: "Terms of Use",   url: "#" }           // PLACEHOLDER
  ],

  /* ------------------------------------------------------------------------
     EDIT HERE: Form links (where applications are sent)
     Create two free forms on https://formspree.io and paste their links here.
     While a link still contains "YOUR_", the form runs in demo mode:
     it shows the thank-you message but sends nothing.
     ------------------------------------------------------------------------ */
  forms: {
    mentor: "https://formspree.io/f/YOUR_MENTOR_FORM_ID",   // PLACEHOLDER
    mentee: "https://formspree.io/f/YOUR_MENTEE_FORM_ID"    // PLACEHOLDER
  },

  /* ------------------------------------------------------------------------
     EDIT HERE: Members area (members.html and my-card.html)
     The Supabase address and key are NOT here: they live in js/config.js,
     which is kept out of GitHub (see js/config.example.js and the README).
     Without that file, the members pages run in demo mode with sample cards.
     ------------------------------------------------------------------------ */
  members: {
    maxStudies:      3,                     // lines of Studies per card (also set in supabase/schema.sql)
    maxExperience:   3                      // lines of Experience per card (also set in supabase/schema.sql)
  },

  // Image used whenever a person has no photo yet.
  placeholderPhoto: "assets/img/placeholder-person.svg",

  // Image used whenever a project has no image yet.
  placeholderImage: "assets/img/placeholder-image.svg",

  /* ------------------------------------------------------------------------
     EDIT HERE: Mentors (Home page, sliding row of cards)
     Each card shows a photo, the current role and location at the top,
     then Studied and Experience.
     Add as many as you like: copy a block { ... }, and the row keeps looping.
     photo: put the image in assets/img/mentors/ and write its path, e.g.
            "assets/img/mentors/anna.jpg". Leave "" for the placeholder.
            Square photos (1:1, e.g. 800 x 800 px) look best.
     ALL MENTORS BELOW ARE PLACEHOLDERS: replace them with real people.
     ------------------------------------------------------------------------ */
  mentors: [
    {
      photo:      "",
      studied:    "Politecnico di Milano, MSc Aerospace Engineering",
      experience: "Internship at the European Space Agency",
      role:       "Propulsion engineer",
      location:   "Munich, Germany"
    },
    {
      photo:      "",
      studied:    "Università di Padova, Medicine and Surgery",
      experience: "Research year at Karolinska Institutet",
      role:       "Cardiology resident",
      location:   "Milan, Italy"
    },
    {
      photo:      "",
      studied:    "Scuola Normale Superiore di Pisa, MSc Mathematics",
      experience: "Visiting student at ETH Zürich",
      role:       "PhD candidate in Applied Mathematics",
      location:   "Paris, France"
    },
    {
      photo:      "",
      studied:    "Università Bocconi, BSc Economics and Finance",
      experience: "Summer analyst at an investment bank",
      role:       "Investment banking analyst",
      location:   "London, UK"
    },
    {
      photo:      "",
      studied:    "Sapienza Università di Roma, MSc Physics",
      experience: "Summer student programme at CERN",
      role:       "Researcher in particle physics",
      location:   "Geneva, Switzerland"
    },
    {
      photo:      "",
      studied:    "Politecnico di Torino, MSc Computer Engineering",
      experience: "Software engineering internship in Dublin",
      role:       "Machine learning engineer",
      location:   "Zürich, Switzerland"
    }
  ],

  /* ------------------------------------------------------------------------
     EDIT HERE: Founder and Co-founder (About page)
     photo: put the image in assets/img/founders/ and write its path, e.g.
            "assets/img/founders/federico-zhou.jpg". Leave "" to show the placeholder.
            Portrait photos (4:5, e.g. 800 x 1000 px) look best.
     bio:   one line per paragraph, inside the [ ] brackets.
     linkedin / email: optional, leave "" to hide.
     ------------------------------------------------------------------------ */
  founders: [
    {
      role:     "Founder",
      name:     "[FOUNDER NAME]",
      photo:    "",
      bio: [
        "[Short bio, replace this text. For example: where you grew up, what you studied, and what you do today.]",
        "[Optional second paragraph. For example: why you started Beyond, FullyFunded and Thesis Away.]"
      ],
      linkedin: "",
      email:    ""
    },
    {
      role:     "Co-founder",
      name:     "[CO-FOUNDER NAME]",
      photo:    "",
      bio: [
        "[Short bio, replace this text. For example: where you grew up, what you studied, and what you do today.]",
        "[Optional second paragraph. For example: what you hope Beyond will mean for the next generation.]"
      ],
      linkedin: "",
      email:    ""
    }
  ],

  /* ------------------------------------------------------------------------
     EDIT HERE: Our other projects (About page)
     image: put the image in assets/img/projects/ and write its path, e.g.
            "assets/img/projects/fullyfunded.jpg". Leave "" for the placeholder.
            Landscape images (16:9, e.g. 1200 x 675 px) look best.
     ------------------------------------------------------------------------ */
  projects: [
    {
      tag:         "Our inspiration",
      name:        "Lead the Future",
      image:       "",
      description: "The STEM mentorship community that changed our founder's path, and the model that inspired Beyond.",
      url:         "#"                              // PLACEHOLDER
    },
    {
      tag:         "Also by our founder",
      name:        "FullyFunded",
      image:       "",
      description: "Fully financed opportunities for talented students who don't have the financial means.",
      url:         "#"                              // PLACEHOLDER
    },
    {
      tag:         "Also by our founder",
      name:        "Thesis Away",
      image:       "",
      description: "Helping students go abroad and live an intercultural exchange while writing their thesis.",
      url:         "#"                              // PLACEHOLDER
    }
  ],

  /* ------------------------------------------------------------------------
     Languages
     When the Italian version exists (pages inside an /it/ folder), add:
       { code: "it", label: "IT" }
     and a language switch will appear in the header automatically.
     ------------------------------------------------------------------------ */
  languages: [
    { code: "en", label: "EN" }
  ],

  /* ------------------------------------------------------------------------
     EDIT HERE: Short interface texts, per language
     To add Italian: copy the whole "en: { ... }" block, rename it "it",
     and translate the text in quotes.
     ------------------------------------------------------------------------ */
  strings: {
    en: {
      tagline: "Italian-Chinese Mentorship Community",
      nav: {
        home:   "Home",
        about:  "About",
        mentor: "Become a mentor",
        mentee: "Become a mentee",
        members: "Members"
      },
      menu:         "Menu",
      close:        "Close",
      mainNavLabel: "Main",
      languageLabel:"Language",
      homeLink:     "Beyond, home page",
      footer: {
        rights:  "All rights reserved.",
        legal:   "Legal"
      },
      mentorLabels: {
        studied:    "Studied",
        experience: "Experience",
        now:        "Now"
      },
      portraitOf: "Portrait of {name}",
      visit:      "Visit",
      form: {
        required:  "Please fill in this field.",
        choose:    "Please choose an option.",
        email:     "Please enter a valid email address, like name@example.com.",
        tooShort:  "Please write a little more (at least {min} characters).",
        checkbox:  "Please tick this box to continue.",
        generic:   "Please check this field.",
        sending:   "Sending…",
        demoNote:  "Demo mode: this form is not connected yet, so nothing will be sent. Add your Formspree link in js/content.js.",
        error:     "Sorry, something went wrong and your application was not sent. Please try again, or write to us at {email}."
      },
      members: {
        demoNote:      "Demo mode: the members area is not connected to Supabase yet, so these are sample cards. Add your Supabase details in js/config.js (see the README).",
        sendLink:      "Send me a sign-in link",
        signInSent:    "If this email belongs to a Beyond member, a sign-in link is on its way. Check your inbox and your spam folder.",
        signInWait:    "You can ask for another link in {s} seconds.",
        signInTooMany: "Too many sign-in requests. Please try again in a few minutes.",
        signInError:   "Sorry, something went wrong. Please try again, or write to us at {email}.",
        notActive:     "Your account is not active. If you think this is a mistake, write to us at {email}.",
        loading:       "Loading…",
        loadError:     "The directory could not be loaded. Please check your connection and try again.",
        mentor:        "Mentor",
        mentee:        "Mentee",
        team:          "Beyond team",
        linkExpired:   "This sign-in link has expired or was already used. Enter your email to get a new one.",
        count:         "{n} members",
        countOne:      "1 member",
        empty:         "No members match your search.",
        refreshWait:   "Already up to date. You can refresh again in a moment.",
        studies:       "Studies",
        experience:    "Experience",
        welcome:       "Welcome to Beyond! Fill in your card so other members can find you.",
        saving:        "Saving…",
        saved:         "Saved. Your card is up to date.",
        saveError:     "Your card could not be saved. Please try again.",
        saveWait:      "Please wait a few seconds before saving again.",
        saveTooMany:   "You have made many changes in a short time. Please try again later.",
        demoSave:      "Demo mode: nothing was saved.",
        photoType:     "Please choose an image file (JPG, PNG or HEIC).",
        photoTooBig:   "This image is too large. Please choose one under 15 MB.",
        photoUnreadable: "This image could not be read. Please try another one.",
        atLeastOne:    "Please add at least one line."
      }
    }
  }
};
