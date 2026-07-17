# OpenCode Context Analysis Plugin

Provides a `/context` command that shows token usage breakdown by category (system, user, assistant, tools, reasoning) with bar chart visualization.

<img width="1230" height="759" alt="image" src="https://github.com/user-attachments/assets/dd1837f5-1fda-4625-8259-0bfb6fd7619e" />
Note: Tool output is currently prepended to the agent's response, as there is no known way to either call the tool without involving the agent or display the tool output in a collapsible window (similar to the Thought block).

## Usage

```
/context                  # Standard analysis
```

## Setup

```bash
cd ~/.config/opencode/plugins/opencode-context-analysis
npm install --prefix vendor
```

Register in `~/.config/opencode/opencode.json`:

```json
{
  "command": {
    "context": { "template": "{file:$HOME/.config/opencode/plugins/opencode-context-analysis/commands/context.md}" }
  },
  "plugin": ["$HOME/.config/opencode/plugins/opencode-context-analysis"]
}
```

Restart OpenCode and type `/context`.

## Tokenizer Aliases

`tokenizer-aliases.json` maps providers and model names to HuggingFace tokenizer repos. Two sections:

- **`providers`**: maps provider IDs (e.g. `"9router"`, `"anthropic"`) to tokenizer hub repos. Used when no model-specific match is found.
- **`transformers`**: maps model names (e.g. `"claude-opus-4"`, `"deepseek-r1"`) to tokenizer hub repos. Checked first by model name similarity.

Both sections produce `{ kind: "transformers", hub: "<repo>" }` specs, which load tokenizers dynamically via `@huggingface/transformers`'s `AutoTokenizer.from_pretrained()`.

### Updating aliases

Add a new provider:

```json
"providers": {
  "9router": "mlx-community/GLM-4.7-Flash-4bit"
}
```

Add a new model:

```json
"transformers": {
  "my-model-name": "org/tokenizer-repo"
}
```

No rebuild needed — aliases are read at runtime via `fs.readFile`.

## Vendor Dependencies

| Package | Path | Required |
|---------|------|----------|
| `js-tiktoken` | `vendor/node_modules/js-tiktoken/` | Yes (OpenAI models) |
| `@huggingface/transformers` | `vendor/node_modules/@huggingface/transformers/` | Yes (non-OpenAI models) |

Install:

```bash
cd vendor && npm install --ignore-scripts
```

Without vendor deps, the plugin degrades gracefully: OpenAI models use a hardcoded fallback map, non-OpenAI models fall back to `chars/4` estimation. Token counts will be less accurate but the plugin still works.

## Testing

Integration tests (vendor deps, aliases, encoders):

```bash
node tests/test.mjs
```

⚠️ The unit test wipes `vendor/node_modules/` with mock fixtures. Run integration tests first, or reinstall vendor deps after.

Unit tests (tokenizer resolution logic):

```bash
npx tsx --test tests/tokenizer-resolution.test.mjs
```



## Debugging Notes

### Plugin must have `index.ts` at ROOT, not `.opencode/`

The plugin loader expects `package.json` and `index.{ts,js}` at the plugin ROOT directory. Placing them inside `.opencode/` causes the loader to skip the plugin silently.

### Remove `exports` from package.json for file plugins

When a file-based plugin has an `exports` field in `package.json`, the entry resolver returns `undefined` for server-kind plugins. Keep `package.json` minimal — no `main`, no `exports`, no `types`.

### `import.meta.url` resolves to `src/`, not root

`tokenizer-registry.ts` lives in `src/`, so `import.meta.url` points to `src/`. Paths relative to plugin root use `path.join(moduleRoot, "..")`.

### `model_to_encoding.json` missing in newer js-tiktoken

js-tiktoken no longer ships `model_to_encoding.json`. The plugin falls back to `BUILTIN_OPENAI_FALLBACK` (hardcoded map in `tokenizer-registry.ts`).

### Unknown providers get `kind: "approx"` fallback

Instead of throwing `TokenizerResolutionError` for unrecognized models/providers, the plugin returns `{ kind: "approx" }` which triggers `chars/4` estimation. Works with any provider without crashing.
