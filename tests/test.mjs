import path from "path"
import fs from "fs/promises"
import { fileURLToPath, pathToFileURL } from "url"

const moduleRoot = path.dirname(fileURLToPath(import.meta.url))
const pluginRoot = path.resolve(moduleRoot, "..")
const vendorRoot = path.join(pluginRoot, "vendor", "node_modules")

const results = []

function pass(name) { results.push({ name, ok: true }) }
function fail(name, reason) { results.push({ name, ok: false, reason }) }

async function importFromVendor(pkg) {
  const pkgJsonPath = path.join(vendorRoot, pkg, "package.json")
  const raw = await fs.readFile(pkgJsonPath, "utf8")
  const manifest = JSON.parse(raw)
  const entry = manifest.module ?? manifest.main ?? "index.js"
  const entryPath = path.join(vendorRoot, pkg, entry)
  return import(pathToFileURL(entryPath).href)
}

async function testVendorDependencies() {
  console.log("--- Vendor Dependencies ---")

  try {
    const pkg = JSON.parse(await fs.readFile(path.join(vendorRoot, "js-tiktoken", "package.json"), "utf8"))
    console.log(`  js-tiktoken: ${pkg.version}`)
    pass("js-tiktoken installed")
  } catch {
    console.log("  js-tiktoken: MISSING")
    fail("js-tiktoken installed", "not found in vendor/node_modules")
  }

  try {
    const pkg = JSON.parse(await fs.readFile(path.join(vendorRoot, "@huggingface", "transformers", "package.json"), "utf8"))
    console.log(`  @huggingface/transformers: ${pkg.version}`)
    pass("@huggingface/transformers installed")
  } catch {
    console.log("  @huggingface/transformers: MISSING (optional, non-OpenAI models use chars/4 fallback)")
    fail("@huggingface/transformers installed", "not found in vendor/node_modules")
  }
}

async function testTokenizerAliases() {
  console.log("\n--- Tokenizer Aliases ---")

  const aliasesPath = path.join(pluginRoot, "tokenizer-aliases.json")
  let data
  try {
    data = JSON.parse(await fs.readFile(aliasesPath, "utf8"))
  } catch (err) {
    fail("tokenizer-aliases.json readable", err.message)
    return
  }

  const providers = data.providers || {}
  const transformers = data.transformers || {}
  console.log(`  Providers: ${Object.keys(providers).join(", ")}`)
  console.log(`  Transformers: ${Object.keys(transformers).length} model aliases`)
  pass("tokenizer-aliases.json readable")

  if (providers["9router"]) {
    console.log(`  9router -> ${providers["9router"]}`)
    pass("9router provider configured")
  } else {
    fail("9router provider configured", "9router not found in providers section")
  }
}

async function testTiktokenEncoder() {
  console.log("\n--- Tiktoken Encoder (OpenAI models) ---")

  try {
    const { encodingForModel, getEncoding } = await importFromVendor("js-tiktoken")

    let encoder
    try {
      encoder = encodingForModel("gpt-4o")
      console.log("  encodingForModel('gpt-4o'): OK")
      pass("tiktoken gpt-4o encoder")
    } catch {
      encoder = getEncoding("cl100k_base")
      console.log("  encodingForModel failed, fell back to cl100k_base")
      pass("tiktoken fallback encoder")
    }

    const tokens = encoder.encode("Hello, world!")
    console.log(`  encode("Hello, world!") -> ${tokens.length} tokens`)
    pass("tiktoken encode")
  } catch (err) {
    fail("tiktoken encoder", err.message)
  }
}

async function testHuggingFaceTokenizer() {
  console.log("\n--- HuggingFace Tokenizer (non-OpenAI models) ---")

  let AutoTokenizer
  try {
    const mod = await importFromVendor("@huggingface/transformers")
    AutoTokenizer = mod.AutoTokenizer
  } catch {
    console.log("  @huggingface/transformers not available, skipping")
    return
  }

  const testCases = [
    { provider: "9router", hub: "mlx-community/GLM-4.7-Flash-4bit" },
    { provider: "anthropic", hub: "Xenova/claude-tokenizer" },
  ]

  for (const { provider, hub } of testCases) {
    try {
      console.log(`  Loading ${hub}...`)
      const tokenizer = await AutoTokenizer.from_pretrained(hub)
      const enc = await tokenizer.encode("Hello, world!")
      console.log(`  ${provider} (${hub}): ${enc.length} tokens`)
      pass(`HF tokenizer ${provider}`)
    } catch (err) {
      fail(`HF tokenizer ${provider}`, err.message.substring(0, 120))
    }
  }
}

async function main() {
  console.log(`Plugin root: ${pluginRoot}`)
  console.log(`Vendor root: ${vendorRoot}\n`)

  await testVendorDependencies()
  await testTokenizerAliases()
  await testTiktokenEncoder()
  await testHuggingFaceTokenizer()

  console.log("\n--- Summary ---")
  const passed = results.filter(r => r.ok)
  const failed = results.filter(r => !r.ok)
  console.log(`  ${passed.length} passed, ${failed.length} failed`)

  if (failed.length > 0) {
    console.log("\nFailed:")
    for (const f of failed) {
      console.log(`  FAIL: ${f.name} - ${f.reason}`)
    }
    process.exit(1)
  }
}

main().catch(err => {
  console.error("Test runner error:", err)
  process.exit(1)
})
