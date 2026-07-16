# OpenCode Context Analysis Plugin

Provides a `/context` command that shows token usage breakdown by category (system, user, assistant, tools, reasoning) with bar chart visualization.

## Usage

```
/context                  # Standard analysis
```

## Setup

```bash
cd ~/.config/opencode/plugins/opencode-context-analysis
bun install --prefix vendor && bun run build
```

Register in `~/.config/opencode/opencode.json`:

```json
{
  "command": {
    "context": { "template": "{file:/home/colt/.config/opencode/plugins/opencode-context-analysis/commands/context.md}" }
  },
  "plugin": ["/home/colt/.config/opencode/plugins/opencode-context-analysis"]
}
```

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
cd vendor && bun add js-tiktoken @huggingface/transformers --ignore-scripts
```

## Build

```bash
bun run build    # runs tsc, output to dist/
```

No need to copy `tokenizer-aliases.json` — it's read from plugin root at runtime.

## Testing

Run the full test suite:

```bash
cd ~/.config/opencode/plugins/opencode-context-analysis
node test.mjs
```

This validates:
- Vendor dependencies installed
- `tokenizer-aliases.json` readable and configured
- Tiktoken encoder works (OpenAI models)
- HuggingFace tokenizer loads (non-OpenAI models, e.g. GLM for 9router)
- Dist files built

## Debugging Notes

### Plugin must have `index.ts` at ROOT, not `.opencode/`

The plugin loader expects `package.json` and `index.{ts,js}` at the plugin ROOT directory. Placing them inside `.opencode/` causes the loader to skip the plugin silently.

### Remove `exports` from package.json for file plugins

When a file-based plugin has an `exports` field in `package.json`, the entry resolver returns `undefined` for server-kind plugins. Keep `package.json` minimal — no `main`, no `exports`, no `types`.

### Two source files can exist — tsc compiles `.ts`, not `.mjs`

Both `tokenizer-registry.mjs` (root) and `plugins/tokenizer-registry.ts` existed. `tsc` compiles the `.ts` version into `dist/plugins/tokenizer-registry.js`. Editing only the `.mjs` had zero effect. Always edit the `.ts` file.

### `import.meta.url` resolves to dist location, not source root

When `tokenizer-registry.ts` compiles to `dist/plugins/tokenizer-registry.js`, `import.meta.url` points to `dist/plugins/`. Paths relative to plugin root use `path.join(moduleRoot, "..", "..")`.

### `model_to_encoding.json` missing in newer js-tiktoken

js-tiktoken no longer ships `model_to_encoding.json`. The plugin falls back to `BUILTIN_OPENAI_FALLBACK` (hardcoded map in `tokenizer-registry.ts`).

### Unknown providers get `kind: "approx"` fallback

Instead of throwing `TokenizerResolutionError` for unrecognized models/providers, the plugin returns `{ kind: "approx" }` which triggers `chars/4` estimation. Works with any provider without crashing.
