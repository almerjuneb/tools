# AJB Tools

My personal home base for small tools I use and build.

## DeepSeek chat

The homepage chat uses a Vercel serverless function to keep the DeepSeek API key out of browser code. In the Vercel project settings, add `DEEPSEEK_API_KEY` as an environment variable for the environments you use, then redeploy. The chat endpoint is available at `/api/chat`.

The tools directory can still be built locally with `npm run build`; the chat requires a Vercel deployment with the API key configured.
