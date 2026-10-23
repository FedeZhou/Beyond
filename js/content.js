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
     EDIT HERE: Legal links (footer, and the tick box on the application forms)
     url: the page or document for each one, e.g. "privacy.html".
     Delete a line to hide that link.
     ------------------------------------------------------------------------ */
  legal: [
    { id: "privacy", label: "Privacy Policy", url: "#" },   // PLACEHOLDER
    { id: "terms",   label: "Terms of Use",   url: "#" }    // PLACEHOLDER
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
     EDIT HERE: Mentors (Home page, row of cards with arrows)
     Each card shows a photo, the field, role and location, and a
     LinkedIn logo that opens the person's profile.
     field:    their area, e.g. "Computer Science", "Quantum Physics",
               "Trading". Shown as a small label on top. Leave "" to hide it.
     role:     the job title, e.g. "Data Scientist"
     location: city and country, e.g. "Munich, Germany"
     Add as many as you like: copy a block { ... }. The row scrolls with arrows,
     and always ends with a card inviting visitors to join.
     photo: put the image in assets/img/mentors/ and write its path, e.g.
            "assets/img/mentors/anna.jpg". Leave "" for the placeholder.
            Square photos (1:1, e.g. 800 x 800 px) look best.
     photoPosition (optional): which part of the photo to keep when it is
            cropped to a square, e.g. "50% 10%" keeps the top (the face),
            "50% 50%" the centre. Leave it out for the default.
     linkedin: the full address of the profile, e.g.
            "https://www.linkedin.com/in/anna-chen". Leave "" to hide the logo.
     The PHOTOS below are real; the TEXT is still placeholder: replace each
     card's field, role, location and linkedin with that person's own.
     ------------------------------------------------------------------------ */
  mentors: [
    {
      photo:      "assets/img/mentors/kaixi-matteo-chen.jpg",   // TEXT BELOW IS PLACEHOLDER
      field:      "High Performance Computing",
      role:       "Deep Learning Compiler Engineer @ NVIDIA",
      location:   "Amsterdam, NL",
      linkedin:   "https://www.linkedin.com/in/kaixi-matteo-chen-5334b6198/"                                       // PLACEHOLDER
    },
    {
      photo:      "assets/img/mentors/alessia-lin.jpg",   // TEXT BELOW IS PLACEHOLDER
      field:      "Data Science",
      role:       "Data Scientist @ Microsoft",
      location:   "London, UK",
      linkedin:   "https://www.linkedin.com/in/alessialin/"                                       // PLACEHOLDER
    },
    {
      photo:      "assets/img/mentors/andrea-jiang.jpg",   // TEXT BELOW IS PLACEHOLDER
      field:      "Computer Science",
      role:       "Software Engineer @ Amazon (AWS)",
      location:   "Amsterdam, NL",
      linkedin:   "https://www.linkedin.com/in/jiang-jia-hao-andrea/"                                       // PLACEHOLDER
    },
    {
      photo:      "assets/img/mentors/chengchen-zhu.jpg",   // TEXT BELOW IS PLACEHOLDER
      field:      "Medical Physics",
      role:       "PhD candidate @ ETH Zurich & Insel Gruppe",
      location:   "Bern, CH",
      linkedin:   "https://www.linkedin.com/in/chengchen-zhu-4073ab231/"                                       // PLACEHOLDER
    },
    {
      photo:      "assets/img/mentors/giovanni-zhang.jpg",   // TEXT BELOW IS PLACEHOLDER
      field:      "Quantum Computing",
      role:       "Researcher @ ETH Zurich",
      location:   "Zurich, CH",
      linkedin:   "https://www.linkedin.com/in/giovanni-zhang-297932170/"                                       // PLACEHOLDER
    },
    {
      photo:      "assets/img/mentors/yifei-fu.jpg",   // TEXT BELOW IS PLACEHOLDER
      field:      "Mechanical Engineering",
      role:       "R&D Engineer @ Climeworks",
      location:   "Zurich, CH",
      linkedin:   "https://www.linkedin.com/in/yifei-fu-y1f31/"                                       // PLACEHOLDER
    },
    {
      photo:      "assets/img/mentors/jessica-wu.jpg",   // TEXT BELOW IS PLACEHOLDER
      field:      "Mathematics and Finance",
      role:       "Equity Analyst @ North Rock",
      location:   "London, UK",
      linkedin:   "https://www.linkedin.com/in/jixi-jessica-wu-732219170/"                                       // PLACEHOLDER
    },
    {
      photo:      "assets/img/mentors/leonardo-zheng.jpg",   // TEXT BELOW IS PLACEHOLDER
      field:      "Mathematics",
      role:       "PhD Candidate @ Imperial College",
      location:   "London, UK",
      linkedin:   "https://www.linkedin.com/in/leonardo-zheng-067928227/"                                       // PLACEHOLDER
    },
    {
      photo:      "assets/img/mentors/xuanqiang-angelo-huang.jpg",   // TEXT BELOW IS PLACEHOLDER
      field:      "Computer Science",
      role:       "Research @ University of Oxford",
      location:   "Oxford, UK",
      linkedin:   "https://www.linkedin.com/in/angelo-huang/?isSelfProfile=false"                                       // PLACEHOLDER
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
      membersRow: {
        previous:  "Previous members",
        next:      "Next members",
        moreTitle: "…and many more",
        moreLink:  "Join us"
      },
      mentorLabels: {
        linkedin:   "LinkedIn profile"
      },
      portraitOf: "Portrait of {name}",
      visit:      "Visit",
      form: {
        required:  "Please fill in this field.",
        choose:    "Please choose an option.",
        email:     "Please enter a valid email address, like name@example.com.",
        url:       "Please enter the full link, starting with https://",
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
