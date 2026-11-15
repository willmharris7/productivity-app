# productivity-app

React + TypeScript + Vite, deployed to GitHub Pages at
https://willmharris7.github.io/productivity-app/ by `.github/workflows/deploy.yml` on every
push to `main`. All user data lives in the user's Google Drive (see `src/drive.ts`); none is
in this repo.

## Ship every change live

After every change requested in this project, without asking first:

1. Don't run or test the app locally (no `npm run dev`, no local browser checks). CI runs
   `npm run build` (type check + build), and a failing build never deploys.
2. Commit the change to `main` with a short message describing it, then `git push`.
3. Wait for the deploy: `gh run list --limit 1` for the run ID, then
   `gh run watch <id> --exit-status`. If it fails, read the log with
   `gh run view <id> --log-failed`, fix the problem, and push again.
4. Check the live site: `curl -sf https://willmharris7.github.io/productivity-app/` and confirm
   it serves the new build (the `assets/index-*.js` name changes with each build; grep the
   bundle at `https://willmharris7.github.io/productivity-app/assets/<name>` for a string the
   change added). Pages can lag a minute behind the run; retry before reporting a problem.
5. If a browser tool is available (Claude in Chrome or the built-in browser), open the live
   site there and look at the change itself. The app is behind Google sign-in, so this only
   works in a browser where the user is already signed in.
6. Report what was deployed and how it was checked, including anything that couldn't be
   verified (for example, behavior behind the Google sign-in when no browser was available).

Never commit personal data (notes, calendars, CSVs, a `files/` folder) or the OAuth client
secret: the repo is public. Only push `main`.
