## Custom Gherkin Utils 🥒

**Custom Gherkin Utils** is a small library for **processing Gherkin `.feature` files**.  
It helps you:

- **Split feature files** that contain multiple `Scenario Outline` blocks into separate files
- **Split by tag into unique scenarios**, keeping only the `Examples` blocks that match
- **Convert `Scenario Outline` to concrete `Scenario`s** by replacing example placeholders
- **Preserve all standard Gherkin constructs** (tags, backgrounds, rules, data tables, docstrings)

This project is tested and verified to work on **Node.js 22**.

---

## ✅ Features

- **Scenario Outline → Scenario conversion**  
- **Replaces `<placeholders>` with `Examples` values**  
- **Preserves `Feature` and `Scenario` tags**  
- **Keeps `Background` steps intact**  
- **Maintains data tables** (e.g. `| column | value |`)  
- **Preserves docstrings** (e.g. `""" some text """`)  
- **Handles `Rule:` blocks correctly**  
- **Removes `Examples:` blocks after conversion**  

---

## 📦 Installation

Install via npm:

```bash
npm install custom-gherkin-utils
```

Or with Yarn:

```bash
yarn add custom-gherkin-utils
```

---

## 🧩 Node & npm Support

- **Node.js**: `>=20.9.0` (verified on **Node 22.17.1**)  
- **npm**: `>=9.0.0`

The library is written in TypeScript and compiled to NodeNext-compatible JavaScript.

---

## 🔧 Basic Usage

The library exposes three main utilities:

- `performSetup` – prepares temporary spec files, optionally splitting multi-outline files  
- `performUniqueScenarioSetup` – creates one complete scenario definition per file using a tag expression
- `processFeatureFiles` – converts `Scenario Outline`s into concrete `Scenario`s by applying `Examples`

### Example (TypeScript / NodeNext)

```ts
import {
  performSetup,
  performUniqueScenarioSetup,
  processFeatureFiles,
} from "custom-gherkin-utils";

async function run() {
  await performSetup({
    cleanTmpSpecDirectory: true,
    sourceSpecDirectory: "./samplefiles",
    tmpSpecDirectory: "./tmp",
    tagExpression: "@ruleTag3", // Only keep scenarios matching this tag expression
  });

  await performUniqueScenarioSetup({
    cleanTmpSpecDirectory: true,
    sourceSpecDirectory: "./samplefiles",
    tmpSpecDirectory: "./unique-scenarios",
    tagExpression: "@smoke and not @wip",
    removeTags: ["@internal", "@qa-*"], // optional: strip matching tags from output
  });

  // Convert scenario outlines to scenarios by replacing placeholders
  await processFeatureFiles("./features/**/*.feature");
}

run().catch((err) => {
  console.error("Error while processing features:", err);
  process.exit(1);
});
```

> **Note**: Adjust `sourceSpecDirectory`, `tmpSpecDirectory`, and the `glob` passed to  
> `processFeatureFiles` to match your project’s folder structure.

---

## 📚 API Overview

### `performSetup(options: SplitParams): Promise<void>`

Prepares a temporary folder of `.feature` files, where each scenario (or scenario outline row) is written into its own file.

- **`sourceSpecDirectory`**: folder that contains your original `.feature` files  
- **`tmpSpecDirectory`**: output folder where split `.feature` files will be written  
- **`cleanTmpSpecDirectory`**: when `true`, the temp folder is removed before writing new files  
- **`singleFile?`**: optional path to a single `.feature` file to process instead of the whole folder  
- **`language?`**: optional Gherkin language (adds `# language: xx` header when not `en`)  
- **`tagExpression?`**: optional [Cucumber tag expression](https://github.com/cucumber/tag-expressions) used to filter scenarios  

Use this before running tools that expect one scenario per file.

### `performUniqueScenarioSetup(options: UniqueScenarioSetupParams): Promise<void>`

Filters using standard Cucumber tag-expression and pickle semantics, then writes each
matching `Scenario` or `Scenario Outline` exactly once, as a single self-contained file.

A matching outline keeps only the `Examples` blocks that matched; blocks that did not
match are removed. Because Gherkin tags apply to a whole `Examples` block, blocks are
kept or dropped as a unit, with all of their rows. When the match comes from an
inherited `Feature`, `Rule`, or `Scenario` tag, every block matches and all are kept.

Feature/Rule backgrounds, inherited tags, comments, dialect keywords, data tables,
and doc strings are preserved.

- **`tagExpression`**: required Cucumber tag expression
- **`sourceSpecDirectory`**, **`tmpSpecDirectory`**, and **`cleanTmpSpecDirectory`**:
  same meanings as `performSetup`
- **`singleFile?`**: process one file instead of recursively finding `.feature` files
- **`language?`**: default dialect for sources without a `# language:` declaration
- **`removeTags?`**: optional glob patterns (`*` / `?`) matched against full tag names
  including `@`. Matching tags are removed from Feature, Rule, Scenario, and
  Examples tag lines after filtering. Omitted or `[]` leaves tags unchanged.
  Tags that appear in steps, comments, or doc strings are not rewritten.

### `processFeatureFiles(pattern: string): Promise<void>`

Converts `Scenario Outline` definitions into concrete `Scenario`s for all files matching a path or glob:

- **`pattern`**: absolute path, relative path, or glob (for example `./features/**/*.feature`)  

Behavior:

- Expands placeholders (`<foo>`) using the **first row** in `Examples`  
- Moves `Examples`-level tags up to the `Scenario`  
- Preserves feature tags, backgrounds, rules, data tables, and docstrings  
- Writes the transformed content **back to the same files**

You can run this as part of a build step, pre-test hook, or a migration script for your feature files.

---

## 📄 License

This project is licensed under the **MIT License**.  
See the `LICENSE` file for details.