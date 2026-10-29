# Dream Japan — JFT Mock Test (Multi-Page Refactor)

A premium, responsive multi-page refactor of the JFT Mock Test app.

## Setup
1. Upload all files to the root of your GitHub Pages repo.
2. Ensure your Firebase project has:
   - Auth → Email/Password + Google enabled
   - Firestore rules from `firestore.rules`
   - Admin user (`deepakrajpant978@gmail.com`) **email verified**
3. Media: keep `photos/` and `audio/` in the `deepakrajpant/photo` repo. Paths in questions like `photos/q1.jpg` resolve via `REPO_BASE`.

## Files That Must Stay At Root
`*.html` at root + `css/` + `js/`. Do not move.

## Known Limitations
- **Google sign-in on iOS Safari** may open a new tab; use email login as fallback.
- **Question edits** require an *email-verified* admin — unverified accounts can read but not write to `jftoctnovset`.
- **Images/audio** are cached by browser; if you replace a file on GitHub, append `?v=2` in the question field to bust the cache.
- **Exam refresh**: progress is preserved via `sessionStorage`, but if the browser session ends, the attempt is lost (by design).
- **Multi-tab**: only one exam can be active per tab; opening two tabs may cause race conditions on submit.
- **Back button**: on the exam page it's intercepted; elsewhere it navigates normally.
