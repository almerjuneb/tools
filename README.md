# AJB Tools

My personal home base for small tools I use and build.

## Add a tool

Create a folder directly inside this repository and put an `index.html` file in it. Keep the tool's CSS, JavaScript, images, and other assets inside that folder, using relative paths. For example:

```text
tools/
  index.html
  new-tool/
    index.html
    style.css
```

The build finds each direct child folder that contains an `index.html`, copies it into the deploy output, and adds it to the dashboard. Commit and push the new folder; Vercel will show it after that deployment finishes. Vercel serves a built snapshot, so folders added to GitHub do not appear on the live site until a new deployment runs.

## Deploy with GitHub and Vercel

1. Push this repository to GitHub.
2. In Vercel, import the GitHub repository and deploy it. The included `vercel.json` runs `npm run build` and publishes the `dist` directory.
3. Connect the Vercel project to the repository's production branch. New pushes will trigger deployments automatically.

No application dependencies are required. Vercel uses Node.js 18 or newer for the build. To use the dashboard locally on Windows, run `run-dashboard.bat`; it serves the live folder list at `http://127.0.0.1:8765/`.