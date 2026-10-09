# AJB Tools

My personal home base for small tools I use and build.
<<<<<<< HEAD

## Add a tool description

Add a `tool.json` file beside a tool's `index.html` to show a short summary on its dashboard card:

```json
{
	"description": "A concise summary of what this tool does."
}
```

The description is included in the local tool list and the Vercel build. If a tool has no description, the dashboard uses a brief default.

## Image and document tools

Image Studio and File Converter process your selected files in the browser; the files are not sent to this project or a server. They load their libraries and, for AI background removal, the model from public CDNs. Background removal uses `@imgly/background-removal` 1.6.0, which is licensed under AGPL-3.0. Review that license for your intended distribution; IMG.LY offers separate licensing options.

File Converter's PDF-to-DOCX mode embeds a high-resolution image of each PDF page to preserve its visual layout. Those pages are not editable Word text. It also converts PDF pages to a PNG ZIP and combines image batches into PDFs.

New tools are discovered from direct child folders containing `index.html` and `tool.json`. Add a short `description` field to `tool.json` to describe the tool on the dashboard.
=======
>>>>>>> 4c5b631ee76f13bc68f8934f028d98f3af903192
