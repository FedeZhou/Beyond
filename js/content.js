/* ==========================================================================
   BEYOND — content.js
   --------------------------------------------------------------------------
   THIS IS THE FILE YOU EDIT.
   Mentors, founders, projects, form links, email and the
   short interface texts (menu labels, form messages) all live here.

   Rules of thumb:
   - Only change the text between the quotes "like this".
   - Keep the commas at the end of each line/block.
   - Save the file and refresh the browser to see the change.
   - The long story text is NOT here: it is in about.html (and the short
     version in index.html), inside the blocks marked "EDIT: STORY TEXT".
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
    { label: "Cookie Policy",  url: "#" },          // PLACEHOLDER
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
     photo: put the image in assets/img/ and write its path, e.g.
            "assets/img/founder.jpg". Leave "" to show the placeholder.
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
            Landscape images (16:9, e.g. 800 x 450 px) look best.
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
        mentee: "Become a mentee"
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
      }
    }
  }
};
