import { GherkinStreams } from '@cucumber/gherkin-streams';
import { IdGenerator } from '@cucumber/messages';
import * as messages from '@cucumber/messages';
import { Readable } from 'stream';
import * as fs from 'fs-extra';
import { glob } from 'glob';
import prettier from 'prettier';

/**
 * Processes feature files **one at a time** to avoid potential mapping issues.
 *
 * This function reads the contents of each specified feature file, performs necessary
 * transformations or updates, and writes the modified data back to the same file.
 *
 * **Supported path types**:
 * - **Absolute path** (e.g., `/home/user/project/features/login.feature`)
 * - **Relative path** (e.g., `./features/login.feature`)
 * - **Glob pattern** (e.g., `features/*.feature`)
 *
 * By handling files sequentially rather than concurrently, each file is updated without
 * interference from other file operations, helping prevent data corruption or conflicts.
 *
 * @param {string} filePathOrPattern - The absolute/relative path or glob pattern of the feature file(s) to process.
 * @returns {Promise<void>} A promise that resolves once all files matching the path or pattern have been processed and updated.
 *
 * @example
 * // Process a single file with a relative path
 * processFeatureFile('./features/login.feature')
 *   .then(() => console.log('Feature file processed successfully!'))
 *   .catch(error => console.error('Error processing feature file:', error));
 *
 * @example
 * // Process multiple files via a glob pattern
 * processFeatureFile('features/*.feature')
 *   .then(() => console.log('All feature files processed successfully!'))
 *   .catch(error => console.error('Error processing feature files:', error));
 */
export async function processFeatureFiles(filePathOrPattern: string): Promise<void> {
  const files = glob.sync(filePathOrPattern);
  const defaultOptions = {
    defaultDialect: 'en',
    newId: IdGenerator.uuid()
  };

  for (const filePath of files) {
    console.log(`📂 Processing: ${filePath}`);

    try {
      // ✅ Read and parse the feature file **individually**
      const stream = GherkinStreams.fromPaths([filePath], defaultOptions);
      const envelopes = await streamToArray(stream);

      for (const envelope of envelopes) {
        if (envelope.gherkinDocument && envelope.gherkinDocument.feature) {
          const feature = envelope.gherkinDocument.feature;

          let background: messages.Background | null = null;
          let rule: messages.Rule | null = null;
          let scenario: messages.Scenario | undefined;

          // 🏷 Preserve the original feature-level tags
          const featureTags: messages.Tag[] = [...(feature.tags || [])];
          // ✅ Extract Background and Scenario
          feature.children.forEach((child) => {
            if (child.background) {
              background = child.background; // Save background separately
            }
            if (child.rule) {
              rule = child.rule;
              rule.children.forEach((ruleChild) => {
                if (ruleChild.scenario && !scenario) {
                  scenario = ruleChild.scenario;
                }
              });
            } else if (child.scenario && !scenario) {
              scenario = child.scenario; // Grab first scenario (since only one is present)
            }
          });

          if (!scenario) continue; // Skip if no scenario found

          if (scenario.examples.length > 0) {
            // 🛠 It's a Scenario Outline with Examples → Modify it
            const updatedScenario = processScenarioOutline(scenario);
            if (updatedScenario) {
              let updatedFeatureContent = formatFeatureFile(feature, featureTags, background, rule, updatedScenario);
              updatedFeatureContent = await prettier.format(updatedFeatureContent, {
                parser: 'gherkin',
                plugins: ['prettier-plugin-gherkin']
              });
              // ✅ Write back to the original file
              fs.writeFileSync(filePath, updatedFeatureContent, 'utf8');
              console.log(`✅ Modified: ${filePath}`);
            }
          } else {
            // 📌 It's a regular Scenario → No modifications needed, but preserve tags
            let updatedFeatureContent = formatFeatureFile(feature, featureTags, background, rule, scenario);
            updatedFeatureContent = await prettier.format(updatedFeatureContent, {
              parser: 'gherkin',
              plugins: ['prettier-plugin-gherkin']
            });
            fs.writeFileSync(filePath, updatedFeatureContent, 'utf8');
            console.log(`⚡ Skipped (No Scenario Outline found, but tags preserved): ${filePath}`);
          }
        }
      }
    } catch (error) {
      console.error(`❌ Error processing file: ${filePath}`, error);
    }
  }
}

/**
 * Converts a readable stream into an array of messages.Envelope
 */
async function streamToArray(readableStream: Readable): Promise<messages.Envelope[]> {
  return new Promise<messages.Envelope[]>((resolve, reject) => {
    const items: messages.Envelope[] = [];
    readableStream.on('data', (item) => items.push(item));
    readableStream.on('error', (err: Error) => reject(err));
    readableStream.on('end', () => resolve(items));
  });
}

/**
 * Replaces placeholders in text with values from Examples.
 */
function replacePlaceholders(text: string, placeholderMap: Record<string, string>): string {
  return text.replace(/<([^>]+)>/g, (_, placeholder) => {
    return placeholderMap[placeholder] ?? `<${placeholder}>`; // Keep as is if no value found
  });
}

/**
 * Converts a Scenario Outline to a Scenario by replacing placeholders with Example values.
 */
function processScenarioOutline(scenario: messages.Scenario): messages.Scenario | null {
  if (scenario.examples.length === 0) {
    return null; // No Examples → No need to modify
  }

  const example = scenario.examples[0]; // Only 1 Example guaranteed
  if (!example.tableHeader || !example.tableBody || example.tableBody.length === 0) {
    return null; // Malformed Examples → Ignore
  }

  const placeholderMap: Record<string, string> = {};

  // ✅ Create a placeholder-value mapping using the first row of Examples
  example.tableHeader.cells.forEach((cell, i) => {
    placeholderMap[cell.value] = example.tableBody[0].cells[i]?.value || ''; // Use first row values
  });

  const newId = IdGenerator.uuid();

  // 🏷 **Move Example-level tags to Scenario level**
  const scenarioTags = [...(scenario.tags ?? []), ...(example.tags ?? [])];

  // ✅ Generate a new Scenario with replaced placeholders
  return {
    ...scenario,
    examples: [], // Remove Examples section
    name: replacePlaceholders(scenario.name, placeholderMap),
    steps: scenario.steps.map((step) => ({
      ...step,
      text: replacePlaceholders(step.text, placeholderMap),
      dataTable: step.dataTable
        ? {
            ...step.dataTable,
            rows: step.dataTable.rows.map((row) => ({
              ...row,
              cells: row.cells.map((cell) => ({
                ...cell,
                value: replacePlaceholders(cell.value, placeholderMap)
              }))
            }))
          }
        : undefined, // ✅ Preserve and replace Data Tables
      docString: step.docString
        ? { ...step.docString, content: replacePlaceholders(step.docString.content, placeholderMap) }
        : undefined // ✅ Preserve and replace DocStrings
    })),
    id: newId(), // Assign a new unique ID
    tags: scenarioTags // ✅ Preserve Scenario tags + Move Example tags
  };
}

/**
 * Formats a feature file with updated scenarios, background, and tags.
 */
function formatFeatureFile(
  feature: messages.Feature,
  featureTags: messages.Tag[],
  background: messages.Background | null,
  rule: messages.Rule | null,
  scenario: messages.Scenario
): string {
  let featureContent = '';

  // 🏷 Feature-level tags first
  if (featureTags.length > 0) {
    const tagsStr = featureTags.map((tag) => tag.name).join(' ');
    featureContent += `${tagsStr}\n`;
  }

  featureContent += `Feature: ${feature.name}\n\n`;
  if (feature.description) {
    featureContent += ` ${feature.description}\n\n`; // ✅ PRESERVE feature description
  }

  // ✅ Include Feature Background before all scenarios and Rules if present
  if (background) {
    featureContent += `Background: ${background.name}\n`; // ✅ PRESERVE background TITLE HERE
    if (background.description) {
      featureContent += ` ${background.description}\n`; // ✅ PRESERVE background description
    }
    background.steps.forEach((step) => {
      featureContent += `  ${step.keyword} ${step.text}\n`;
    });
    featureContent += `\n`;
  }

  // ✅ Include Rule if present
  if (rule) {
    if (rule.tags.length > 0) {
      featureContent += `${rule.tags.map((tag) => tag.name).join(' ')}\n`;
    }
    featureContent += `Rule: ${rule.name}\n\n`;
    if (rule.description) {
      featureContent += ` ${rule.description}\n\n`; // ✅ PRESERVE rule description
    }

    rule.children.forEach((ruleChild) => {
      if (ruleChild.background) {
        featureContent += `Background: ${ruleChild.background.name}\n`;
        if (ruleChild.background.description) {
          featureContent += ` ${ruleChild.background.description}\n`; // ✅ PRESERVE rule background description
        }
        ruleChild.background.steps.forEach((step) => {
          featureContent += `  ${step.keyword} ${step.text}\n`;
        });
        featureContent += `\n`;
      }
    });
  }

  // 🏷 Scenario-level tags
  const scenarioTags: messages.Tag[] = [...(scenario.tags || [])];
  if (scenarioTags.length > 0) {
    const scenarioTagsStr = scenarioTags.map((tag) => tag.name).join(' ');
    featureContent += `${scenarioTagsStr}\n`;
  }

  // ✅ Include the updated Scenario
  featureContent += `Scenario: ${scenario.name}\n`;
  if (scenario.description) {
    featureContent += ` ${scenario.description}\n`; // ✅ PRESERVE scenario description
  }

  // ✅ Include scenario steps with out merging backgrounds
  scenario.steps.forEach((step) => {
    featureContent += `  ${step.keyword} ${step.text}\n`;

    // ✅ Preserve Data Tables
    if (step.dataTable) {
      featureContent += formatDataTable(step.dataTable);
    }

    // ✅ Preserve DocStrings
    if (step.docString) {
      featureContent += formatDocString(step.docString);
    }
  });

  return featureContent;
}

/**
 * Formats a Data Table properly
 */
function formatDataTable(dataTable: messages.DataTable): string {
  let tableContent = '';
  dataTable.rows.forEach((row) => {
    tableContent += `    | ${row.cells.map((cell) => cell.value).join(' | ')} |\n`;
  });
  return tableContent;
}

/**
 * Formats a Gherkin DocString while preserving its original delimiter.
 *
 * ### Gherkin DocStrings:
 * In Gherkin, DocStrings allow multi-line string inputs and can be enclosed using:
 * - **Triple Quotes (`"""`)** (Default)
 * - **Triple Backticks (`` ``` ``)** (Alternative format)
 *
 * This function ensures:
 * ✅ **Original delimiter is preserved** (`"""` or `` ``` ``).
 * ✅ **Content is properly indented** (for readability).
 * ✅ **Unnecessary leading/trailing spaces are trimmed**.
 *
 * ---
 *
 * @param {messages.DocString} docString - The DocString object from the Gherkin AST.
 * @returns {string} - The formatted DocString as a string.
 *
 * ---
 *
 * ### **Example Usage**
 *
 * #### 📌 **Input (Triple Quotes)**
 * ```gherkin
 * Scenario: Fetch user data
 *   Given the API returns:
 *     """
 *     {
 *       "id": 1,
 *       "name": "John Doe"
 *     }
 *     """
 * ```
 * ✅ **Output (Preserved `"""` Delimiter)**
 * ```gherkin
 *     """
 *     {
 *       "id": 1,
 *       "name": "John Doe"
 *     }
 *     """
 * ```
 *
 * ---
 *
 * #### 📌 **Input (Triple Backticks)**
 * ```gherkin
 * Scenario: Fetch system logs
 *   Given the system logs contain:
 *     ```
 *     Error: Service Unavailable
 *     Code: 503
 *     ```
 * ```
 * ✅ **Output (Preserved ``` Delimiter)**
 * ```gherkin
 *     ```
 *     Error: Service Unavailable
 *     Code: 503
 *     ```
 * ```
 */
function formatDocString(docString: messages.DocString): string {
  const delimiter = docString.delimiter || '"""'; // Default to triple quotes
  return `    ${delimiter}\n    ${docString.content.trim()}\n    ${delimiter}\n`;
}
