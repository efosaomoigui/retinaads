# Retinaad Website

Static Vercel package for the Retinaad public website.

The current bundle was built with RetiBazaar links pointed at:

```text
https://retibazaar.vercel.app
```

## Push To Remote

After the empty remote repository is created, run:

```bash
git remote add origin <RETINAAD_REPOSITORY_URL>
git push -u origin main
```

## Vercel

Import this repository into its own Vercel project. The included `vercel.json`
uses `npm run build`, outputs `dist`, and rewrites all routes to `index.html`.

This Vercel deployment is static. The included Node server files remain useful
for non-Vercel persistent Node hosting if forms and `/admin` need to run.
