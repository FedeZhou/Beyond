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
        founders square    800 x 800 px
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
    email: "info@beyondicmc.com"                   // forwarded to Gmail by Cloudflare Email Routing (see the README)
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
     EDIT HERE: Application forms (Become a mentor / Become a mentee)
     Applications are saved in Supabase and emailed to you and to the person
     who applied (see the README, "Applications and the admin portal").
     turnstileSiteKey: the PUBLIC "site key" of your free Cloudflare Turnstile
       widget (the "are you a person?" check). Leave "" to hide it.
     ------------------------------------------------------------------------ */
  applications: {
    turnstileSiteKey: ""                     // PLACEHOLDER, e.g. "0x4AAAAAAA..."
  },

  /* ------------------------------------------------------------------------
     EDIT HERE: Members area (login.html, members.html, my-card.html, join.html, reset-password.html)
     The Supabase address and key are NOT here: they live in js/config.js,
     which is kept out of GitHub (see js/config.example.js and the README).
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
     EDIT HERE: The Team (About page)
     Each person gets a card like the members directory, with the LinkedIn
     logo of the Home mentor cards.
     role:       small label on top, e.g. "Founder", "Co-founder"
     name:       full name
     position:   job title and company in one line, like the mentor cards,
            e.g. "Product Owner @ ABB E-mobility". Leave "" to hide.
     city / country:       shown as "City, Country". Leave "" to hide.
     linkedin:   the full address of the profile, e.g.
            "https://www.linkedin.com/in/anna-chen". Leave "" to hide the logo.
     photo: put the image in assets/img/founders/ and write its path, e.g.
            "assets/img/founders/federico-zhou.jpg". Leave "" to show the placeholder.
            Square photos (1:1, e.g. 800 x 800 px) look best.
     photoPosition (optional): which part of the photo to keep when it is
            cropped to a square, e.g. "50% 10%" keeps the top (the face).
     Add a person: copy a block { ... } and keep the comma between blocks.
     ------------------------------------------------------------------------ */
  founders: [
    {
      role:       "Founder",
      name:       "Federico Zhou",
      position:   "Product Owner @ ABB E-mobility",
      city:       "Delft",
      country:    "Netherlands",
      linkedin:   "https://www.linkedin.com/in/federico-zhou/",                           // PLACEHOLDER
      photo:      "assets/img/founders/federico-zhou.png"
    },
    {
      role:       "Co-founder",
      name:       "Lihao Liu",
      position:   "Quantitative Developer @ QRT",
      city:       "Paris",
      country:    "France",
      linkedin:   "https://www.linkedin.com/in/lihaoliu01/",                           // PLACEHOLDER
      photo:      "assets/img/founders/lihao-liu.jpg"
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
        members: "Login",               // when logged out
        directory: "Directory",         // when logged in
        profile: "My profile"           // when logged in
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
        error:     "Sorry, something went wrong and your application was not sent. Please try again, or write to us at {email}.",
        invalid:   "Some answers could not be accepted. Please check the form and try again.",
        duplicate: "You have already sent us an application with this email, and we are still reading it. We will be in touch soon.",
        tooMany:   "Too many applications from this connection. Please try again later, or write to us at {email}.",
        captcha:   "The \"are you a person?\" check did not work. Please try it again.",
        captchaMissing: "Please complete the \"are you a person?\" check just above the button."
      },
      members: {
        signIn:        "Log in",
        signingIn:     "Logging in…",
        signInWrong:   "This email and password don't match. Please try again, or choose a new password.",
        signInTooMany: "Too many sign-in attempts. Please try again in a few minutes.",
        signInError:   "Sorry, something went wrong. Please try again, or write to us at {email}.",
        resetSend:     "Email me a link",
        resetSent:     "If this email belongs to a Beyond member, a link to choose a new password is on its way. Check your inbox and your spam folder.",
        resetWait:     "You can ask for another link in {s} seconds.",
        passwordShort: "Please choose a password of at least {min} characters.",
        passwordMismatch: "The two passwords are different.",
        passwordSaved: "Your new password is saved.",
        passwordError: "Your password could not be saved. Please try again, or ask for a new link.",
        joinHello:     "Welcome to Beyond, {name}!",
        joinHelloNoName: "Welcome to Beyond!",
        joinInvalid:   "This join link is not valid. Please check that you copied the whole address from the email, or write to us at {email}.",
        joinUsed:      "This join link was already used. Log in with your email and password.",
        joinExpired:   "This join link has expired. Write to us at {email} and we will send you a new one.",
        joinExisting:  "Good news: this email already has an account with us, so you don't need a new password. Log in with the password you already use for it, or choose a new one with \"Forgot your password?\".",
        joinError:     "Sorry, something went wrong. Please try again, or write to us at {email}.",
        joinSaving:    "Creating your account…",
        notActive:     "Your account is not active. If you think this is a mistake, write to us at {email}.",
        loading:       "Loading…",
        loadError:     "The directory could not be loaded. Please check your connection and try again.",
        mentor:        "Mentor",
        mentee:        "Mentee",
        team:          "Beyond team",
        linkExpired:   "This link has expired or was already used. Ask for a new one on the login page.",
        resetNoLink:   "To choose a new password, open the link we emailed you. No email? Ask for one on the login page.",
        count:         "{n} members",
        countOne:      "1 member",
        empty:         "No members match your search.",
        refreshWait:   "Already up to date. You can refresh again in a moment.",
        studies:       "Studies",
        experience:    "Experience",
        welcome:       "Welcome to Beyond! We filled in your card from your application. Check it, add a photo if you like, and save it to appear in the directory.",
        saving:        "Saving…",
        saved:         "Saved. Your card is up to date.",
        saveError:     "Your card could not be saved. Please try again.",
        saveWait:      "Please wait a few seconds before saving again.",
        saveTooMany:   "You have made many changes in a short time. Please try again later.",
        photoType:     "Please choose an image file (JPG, PNG or HEIC).",
        photoTooBig:   "This image is too large. Please choose one under 15 MB.",
        photoUnreadable: "This image could not be read. Please try another one.",
        atLeastOne:    "Please add at least one line."
      }
    }
  }
};
