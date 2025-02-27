# Custom Gherkin Utils 🥒

🚀 **Custom Gherkin Utils** is a utility for **processing Gherkin feature files**, primarily designed for **converting Scenario Outlines into Scenarios** by replacing example placeholders. It also **preserves Data Tables, Doc Strings, Rule Blocks, Backgrounds, and Tags** while maintaining the original feature file structure.

---

## 📌 Features
✔️ **Converts `Scenario Outline` to `Scenario`**  
✔️ **Replaces `<placeholders>` with Example values**  
✔️ **Preserves `Feature` and `Scenario` Tags**  
✔️ **Keeps `Background` steps intact**  
✔️ **Maintains `Data Tables` (`| column | value |`)**  
✔️ **Preserves `Doc Strings` (`""" text """`)**  
❌ **Handles `Rule:` blocks properly**  
✔️ **Removes `Examples:` after conversion**  
✔️ **Includes Jest tests for validation**  

---

## 🚀 Installation
Clone this repository and install dependencies:
```sh
git clone https://github.com/your-username/custom-gherkin-utils.git
cd custom-gherkin-utils
npm install
