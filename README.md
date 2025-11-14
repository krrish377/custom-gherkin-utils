## Custom Gherkin Utils 🥒

**Custom Gherkin Utils** is a small library for **processing Gherkin `.feature` files**.  
It helps you:

- **Split feature files** that contain multiple `Scenario Outline` blocks into separate files
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

- **Node.js**: `>=20.9.0 <23.0.0` (verified on **Node 22.17.1**)  
- **npm**: `>=9.0.0`

The library is written in TypeScript and compiled to NodeNext-compatible JavaScript.

---

## 🔧 Basic Usage

The library exposes two main utilities:

- `performSetup` – prepares temporary spec files, optionally splitting multi-outline files  
- `processFeatureFiles` – converts `Scenario Outline`s into concrete `Scenario`s by applying `Examples`

### Example (TypeScript / NodeNext)

```ts
import { processFeatureFiles, performSetup } from "custom-gherkin-utils";

async function run() {
  await performSetup({
    cleanTmpSpecDirectory: true,
    sourceSpecDirectory: "./samplefiles",
    tmpSpecDirectory: "./tmp",
    tagExpression: "@ruleTag3", // Only keep scenarios matching this tag expression
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