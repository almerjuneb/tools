# AJB Tools

My personal home base for small tools I use and build.

## Add a tool description

Add a `tool.json` file beside a tool's `index.html` to show a short summary on its dashboard card:

```json
{
	"description": "A concise summary of what this tool does."
}
```

The description is included in the local tool list and the Vercel build. If a tool has no description, the dashboard uses a brief default.
