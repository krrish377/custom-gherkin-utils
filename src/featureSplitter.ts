import * as messages from '@cucumber/messages';
import * as fs from 'fs';
import * as path from 'path';
import * as glob from 'glob';
import { Readable } from 'stream';

// Gherkin streams
import { GherkinStreams } from '@cucumber/gherkin-streams';

// For typed Gherkin AST objects and ID generator
import { IdGenerator } from '@cucumber/messages';

// Tag expression parser
import parseTagExpression from '@cucumber/tag-expressions';

/**
 * Converts a Readable stream of `messages.Envelope` into an array.
 */
async function streamToArray(readable: Readable): Promise<messages.Envelope[]> {
  return new Promise<messages.Envelope[]>((resolve, reject) => {
    const items: messages.Envelope[] = [];
    readable.on('data', (item) => items.push(item));
    readable.on('error', (err) => reject(err));
    readable.on('end', () => resolve(items));
  });
}

/** Minimal interface if `@cucumber/tag-expressions` has no .d.ts */
interface TagExpressionNode {
  evaluate(tags: string[]): boolean;
}

/**
 * Parameters for splitting:
 * - sourceSpecDirectory: folder containing .feature files
 * - tmpSpecDirectory: output folder
 * - singleFile?: optional single .feature
 * - language?: optional # language: <xx>
 * - tagExpression?: optional scenario filter
 */
export interface SplitParams {
  sourceSpecDirectory: string;
  tmpSpecDirectory: string;
  singleFile?: string;
  language?: string;
  tagExpression?: string;
  cleanTmpSpecDirectory: boolean;
}

/**
 * Splits each scenario (including scenario outlines) into a separate .feature file.
 * If a scenario outline has multiple rows, we produce multiple scenario outlines—
 * each with exactly one row. The scenario outline's name stays the same, placeholders
 * remain unexpanded, and we forcibly apply the feature-level background to all scenarios.
 */
export async function splitScenarioOutlinesByRows(params: SplitParams): Promise<void> {
  const {
    sourceSpecDirectory,
    tmpSpecDirectory,
    singleFile,
    language,
    tagExpression,
  } = params;

  // 1) Gather .feature files (recursively). If you only want top-level, use `/*.feature`
  let featureFiles: string[] = [];
  if (singleFile) {
    featureFiles = [singleFile];
  } else {
    const path = `${sourceSpecDirectory}/*.feature`;
    featureFiles = glob.sync(path);
  }

  if (!featureFiles.length) {
    console.warn('No .feature files found.');
    return;
  }

  // 2) Optional tag expression filter
  let tagFilter: TagExpressionNode | null = null;
  if (tagExpression) {
    tagFilter = parseTagExpression(tagExpression) as TagExpressionNode;
  }

  // 3) Gherkin Streams config
  const gherkinOptions = {
    defaultDialect: 'en',
    newId: IdGenerator.uuid(),
  };

  // 4) Parse each file, expand scenario outlines, filter, and write
  for (const filePath of featureFiles) {
    console.log(`\n📂 Processing: ${filePath}`);

    // Parse .feature -> stream -> array of Envelope
    const envelopeStream = GherkinStreams.fromPaths([filePath], gherkinOptions);
    const envelopes = await streamToArray(envelopeStream);

    // Find gherkinDocument
    const docEnv = envelopes.find((env) => env.gherkinDocument);
    if (!docEnv?.gherkinDocument?.feature) {
      console.warn(`No Feature found in: ${filePath}`);
      continue;
    }

    const feature = docEnv.gherkinDocument.feature;
    const scenarioEntries = collectScenarioEntries(feature);

    let scenarioCount = 0;

    for (const entry of scenarioEntries) {
      // Expand scenario outlines that have multiple rows
      const expansions = expandScenarioOutlineRows(entry.scenario);

      // For each expanded scenario, optionally filter by tag expression
      for (const scenarioCandidate of expansions) {
        const combinedTags = gatherAllTagNames(feature, entry.rule, scenarioCandidate);
        if (tagFilter && !tagFilter.evaluate(combinedTags)) {
          continue; // skip if it doesn't match
        }

        scenarioCount++;
        // Build the single-scenario .feature text
        const scenarioText = buildSingleScenarioFeature(
          feature,
          entry.rule,
          scenarioCandidate,
          entry.featureBackgrounds,
          entry.ruleBackgrounds,
          language
        );

        // e.g. "Login_1.feature"
        const outName = makeOutputName(filePath, scenarioCount);
        fs.writeFileSync(path.join(tmpSpecDirectory, outName), scenarioText, 'utf8');
        console.log(`   -> Wrote scenario #${scenarioCount} to ${outName}`);
      }
    }

    if (scenarioCount === 0) {
      console.log(`   -> No scenarios matched or found in file: ${filePath}`);
    }
  }
}

// --------------------------------------------------------------------------
// A) Collect scenario entries, forcibly applying Feature-level BG to all
// --------------------------------------------------------------------------

interface ScenarioEntry {
  scenario: messages.Scenario;
  rule?: messages.Rule;
  featureBackgrounds: messages.Background[];
  ruleBackgrounds: messages.Background[];
}

/**
 * Gathers top-level or rule-based scenarios from the Feature,
 * forcibly applying the Feature-level background to all scenarios.
 */
function collectScenarioEntries(feature: messages.Feature): ScenarioEntry[] {
  const entries: ScenarioEntry[] = [];
  const featureChildren = feature.children ?? [];

  // feature-level backgrounds
  const featureBackgrounds = featureChildren
    .filter((c) => c.background)
    .map((c) => c.background!) as messages.Background[];

  // scenario or rule
  const scenarioOrRule = featureChildren.filter((c) => c.scenario || c.rule);

  for (const child of scenarioOrRule) {
    if (child.scenario) {
      entries.push({
        scenario: child.scenario,
        rule: undefined,
        featureBackgrounds,
        ruleBackgrounds: [],
      });
    } else if (child.rule) {
      const rule = child.rule;
      const ruleChildren = rule.children ?? [];

      // rule-level backgrounds
      const ruleBackgrounds = ruleChildren
        .filter((r) => r.background)
        .map((r) => r.background!) as messages.Background[];

      // scenarios in the rule
      for (const rc of ruleChildren.filter((x) => x.scenario)) {
        entries.push({
          scenario: rc.scenario!,
          rule,
          featureBackgrounds,
          ruleBackgrounds,
        });
      }
    }
  }

  return entries;
}

// --------------------------------------------------------------------------
// B) Expand scenario outline rows, preserving scenario name + placeholders
// --------------------------------------------------------------------------

function expandScenarioOutlineRows(scenario: messages.Scenario): messages.Scenario[] {
  // if no examples, or only one row total, just return as is
  if (!scenario.examples?.length) {
    return [scenario];
  }

  let totalRows = 0;
  scenario.examples.forEach((ex) => {
    totalRows += ex.tableBody?.length ?? 0;
  });
  if (totalRows <= 1) {
    return [scenario];
  }

  // We'll produce multiple scenario outlines if there's multiple rows
  const expansions: messages.Scenario[] = [];

  // For each examples block, for each row => produce a scenario copy
  for (const ex of scenario.examples) {
    if (!ex.tableBody?.length) {
      expansions.push(cloneScenarioWithSingleRow(scenario, ex, null));
      continue;
    }
    for (const row of ex.tableBody) {
      expansions.push(cloneScenarioWithSingleRow(scenario, ex, row));
    }
  }

  return expansions;
}

/**
 * Create a scenario copy that keeps exactly `row` in `targetEx` block,
 * removing rows from other blocks or from the same block (except `row`).
 * We do *not* rename the scenario or expand placeholders in steps.
 */
function cloneScenarioWithSingleRow(
  original: messages.Scenario,
  targetEx: messages.Examples,
  row: messages.TableRow | null
): messages.Scenario {
  const scenarioCopy = deepCloneScenario(original);

 // Ensure we only modify the Examples block that we are focusing on
 scenarioCopy.examples = scenarioCopy.examples?.map((exBlock, index) => {
    if (exBlock.id === targetEx.id) {
      // Create a new Example block where only this row is retained
      return {
        ...exBlock,
        tableBody: row ? [row] : [], // Keep only the single row
      };
    } else {
      // Remove all rows from all other Examples blocks
      return {
        ...exBlock,
        tableBody: [], // Ensure tableBody is always an array, not null
      };
    }
  }) ?? [];

  /*if (!scenarioCopy.examples) {
    return scenarioCopy;
  }

  scenarioCopy.examples.forEach((exBlock) => {
    if (exBlock === targetEx) {
      // keep only the single `row`
      if (!row) {
        exBlock.tableBody = [];
      } else {
        exBlock.tableBody = [row];
      }
    }
  });*/

  return scenarioCopy;
}

function deepCloneScenario(s: messages.Scenario): messages.Scenario {
  return JSON.parse(JSON.stringify(s)) as messages.Scenario;
}

// --------------------------------------------------------------------------
// C) Build single-scenario .feature
// --------------------------------------------------------------------------

function buildSingleScenarioFeature(
  feature: messages.Feature,
  rule: messages.Rule | undefined,
  scenario: messages.Scenario,
  featureBackgrounds: messages.Background[],
  ruleBackgrounds: messages.Background[],
  lang?: string
): string {
  const lines: string[] = [];

  // # language: <xx> if not 'en'
  if (lang && lang.toLowerCase() !== 'en') {
    lines.push(`# language: ${lang}`);
  }

  // Feature tags
  if (feature.tags?.length) {
    lines.push(feature.tags.map((t) => t.name).join(' '));
  }
  lines.push(`Feature: ${feature.name}`);
  if (feature.description) {
    lines.push(...feature.description.split('\n'));
  }
  lines.push('');

  // forcibly apply feature-level backgrounds
  featureBackgrounds.forEach((bg) => {
    lines.push(...buildBackgroundLines(bg));
    lines.push('');
  });

  // If scenario is in a Rule
  if (rule) {
    if (rule.tags?.length) {
      lines.push(rule.tags.map((t) => t.name).join(' '));
    }
    lines.push(`Rule: ${rule.name}`);
    if (rule.description) {
      lines.push(...rule.description.split('\n'));
    }
    lines.push('');

    // rule-level backgrounds
    ruleBackgrounds.forEach((bg) => {
      lines.push(...buildBackgroundLines(bg));
      lines.push('');
    });
  }

  lines.push(...buildScenarioText(scenario));

  return lines.join('\n') + '\n';
}

function buildBackgroundLines(bg: messages.Background): string[] {
  const out: string[] = [];
  out.push(`Background: ${bg.name}`);
  if (bg.description) {
    out.push(...bg.description.split('\n'));
  }
  for (const step of bg.steps ?? []) {
    out.push(buildStepLine(step));
  }
  return out;
}

function buildScenarioText(scenario: messages.Scenario): string[] {
  const out: string[] = [];

  // scenario tags
  if (scenario.tags?.length) {
    out.push(scenario.tags.map((t) => t.name).join(' '));
  }
  // "Scenario:" or "Scenario Outline:"
  out.push(`${scenario.keyword}: ${scenario.name}`);
  if (scenario.description) {
    out.push(...scenario.description.split('\n'));
  }

  for (const step of scenario.steps ?? []) {
    out.push(buildStepLine(step));
  }

  // keep examples if scenario outline
  if (scenario.examples?.length) {
    scenario.examples.forEach((ex) => {
      out.push(...buildExamplesBlock(ex));
    });
  }

  return out;
}

function buildStepLine(step: messages.Step): string {
  let text = `${step.keyword}${step.text ?? ''}`;
  if (step.docString?.content) {
    text += `\n"""\n${step.docString.content}\n"""`;
  }
  if (step.dataTable?.rows?.length) {
    for (const row of step.dataTable.rows) {
      const cells = row.cells.map((c) => c.value).join(' | ');
      text += `\n| ${cells} |`;
    }
  }
  return text;
}

function buildExamplesBlock(ex: messages.Examples): string[] {
  const lines: string[] = [];

  if (ex.tags?.length) {
    lines.push(ex.tags.map((t) => t.name).join(' '));
  }
  lines.push(`Examples: ${ex.name}`);
  if (ex.description) {
    lines.push(...ex.description.split('\n'));
  }

  if (ex.tableHeader?.cells?.length) {
    const hdr = ex.tableHeader.cells.map((c) => c.value).join(' | ');
    lines.push(`| ${hdr} |`);
  }
  if (ex.tableBody?.length) {
    for (const row of ex.tableBody) {
      const rowVals = row.cells.map((c) => c.value).join(' | ');
      lines.push(`| ${rowVals} |`);
    }
  }
  return lines;
}

// --------------------------------------------------------------------------
// D) Tag Gathering
// --------------------------------------------------------------------------

function gatherAllTagNames(
  feature: messages.Feature,
  rule: messages.Rule | undefined,
  scenario: messages.Scenario
): string[] {
  const featureTags = (feature.tags ?? []).map((t) => t.name);
  const ruleTags = rule ? (rule.tags ?? []).map((t) => t.name) : [];
  const scenarioTags = (scenario.tags ?? []).map((t) => t.name);
  return [...featureTags, ...ruleTags, ...scenarioTags];
}

// --------------------------------------------------------------------------
// E) Utility: naming the output file, e.g. "MyFeature_1.feature"
// --------------------------------------------------------------------------

function makeOutputName(filePath: string, index: number): string {
  const base = path.basename(filePath, '.feature');
  return `${base}_${index}.feature`;
}
