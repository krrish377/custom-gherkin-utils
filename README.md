# Custom Gherkin Utils 🥒

🚀 **Custom Gherkin Utils** is a utility for **processing Gherkin feature files**, designed to:
- **Split feature files into multiple files** when they contain multiple `Scenario Outlines`
- **Convert `Scenario Outlines` into `Scenarios`** by replacing example placeholders- **Preserve all Gherkin capabilities**
---

## 📌 Features
✔️ **Converts `Scenario Outline` to `Scenario`**  
✔️ **Replaces `<placeholders>` with Example values**  
✔️ **Preserves `Feature` and `Scenario` Tags**  
✔️ **Keeps `Background` steps intact**  
✔️ **Maintains `Data Tables` (`| column | value |`)**  
✔️ **Preserves `Doc Strings` (`""" text """`)**  
✔️ **Handles `Rule:` blocks properly**  
✔️ **Removes `Examples:` after conversion**  
✔️ **Includes Jest tests for validation**  

---
## 🔧 Usage
```
import { processFeatureFiles, performSetup } from "custom-gherkin-utils";

async function run() {
  await performSetup({cleanTmpSpecDirectory: true, sourceSpecDirectory:'./samplefiles',tmpSpecDirectory:'./tmp', tagExpression: '@ruleTag3' }); // Split feature files in to individual ones
  
  await processFeatureFiles("./features/**/*.feature");  // Convert scenario outlines to scenario by replacing place holders
}

run();

```