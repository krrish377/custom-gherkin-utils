import { GherkinStreams } from '@cucumber/gherkin-streams';
import * as messages from '@cucumber/messages';
import { IdGenerator } from '@cucumber/messages';
import parseTagExpression from '@cucumber/tag-expressions';
import * as fs from 'fs';
import * as glob from 'glob';
import * as path from 'path';
import { streamToArray } from '../../helpers/streamUtils';

interface TagExpressionNode {
  evaluate(tags: string[]): boolean;
}

/**
 * Parameters for unique-scenario splitting.
 *
 * Unlike row-level splitting (`performSetup`), each matching
 * `Scenario` or `Scenario Outline` is written once. Outline `Examples`
 * blocks that do not match `tagExpression` are omitted from the output.
 */
export interface UniqueScenarioSplitParams {
  /**
   * Folder containing source `.feature` files.
   * Recursively searched unless {@link UniqueScenarioSplitParams.singleFile} is set.
   */
  sourceSpecDirectory: string;
  /**
   * Folder where split `.feature` files are written.
   * Existing files in this folder are not removed by {@link splitUniqueScenariosByTag};
   * use {@link performUniqueScenarioSetup} with `cleanTmpSpecDirectory: true` for that.
   */
  tmpSpecDirectory: string;
  /**
   * Required [Cucumber tag expression](https://github.com/cucumber/tag-expressions)
   * evaluated against pickle tags (for example `@smoke and not @wip`).
   *
   * A scenario is included if any of its pickles match. For a `Scenario Outline`,
   * each `Examples` block is kept only if at least one of its rows produced a
   * matching pickle. Tags on a block apply to every row in that block.
   * An inherited Feature, Rule, or Scenario tag causes every block to match.
   */
  tagExpression: string;
  /**
   * Process this `.feature` file only, instead of scanning `sourceSpecDirectory`.
   */
  singleFile?: string;
  /**
   * Default Gherkin dialect for files without `# language:`.
   * A `# language:` comment in the source always wins.
   * Non-English output without that comment gets `# language: <xx>` prepended.
   */
  language?: string;
  /**
   * Optional glob patterns matched against full tag names, including `@`.
   * `*` matches any characters; `?` matches one character.
   *
   * Applied after filtering. Matching tags are removed from Feature, Rule,
   * Scenario, and Examples tag lines. A tag line that becomes empty is dropped.
   * Omitted or `[]` leaves tags unchanged. Tags in steps, comments, or
   * doc strings are not rewritten.
   *
   * @example
   * ```ts
   * removeTags: ['@internal', '@qa-*']
   * ```
   */
  removeTags?: string[];
}

interface ScenarioEntry {
  scenario: messages.Scenario;
  rule?: messages.Rule;
  featureChildIndex: number;
  ruleChildIndex?: number;
}

/**
 * Writes one complete, unique `Scenario` or `Scenario Outline` per output file.
 *
 * Prefer {@link performUniqueScenarioSetup} from consuming projects; this function
 * does not clean or create `tmpSpecDirectory` beyond `mkdir` recursive.
 *
 * Tag expressions are evaluated against Cucumber pickles, so inherited Feature,
 * Rule, Scenario, and Examples tags behave as they do in Cucumber. A matching
 * outline is emitted once, keeping only matching `Examples` blocks. Optional
 * {@link UniqueScenarioSplitParams.removeTags} is applied to the written text.
 *
 * @param params - Split, filter, and optional tag-stripping settings.
 * @returns Resolves when processing is complete. Warns and returns if no `.feature` files are found.
 * @throws {Error} If a source file contains invalid Gherkin (`Invalid Gherkin in …`).
 */
export async function splitUniqueScenariosByTag(params: UniqueScenarioSplitParams): Promise<void> {
  const featureFiles = getFeatureFiles(params).sort();
  if (featureFiles.length === 0) {
    console.warn('No .feature files found.');
    return;
  }

  const tagFilter = parseTagExpression(params.tagExpression) as TagExpressionNode;
  fs.mkdirSync(params.tmpSpecDirectory, { recursive: true });

  for (const filePath of featureFiles) {
    const source = fs.readFileSync(filePath, 'utf8');
    const envelopes = await streamToArray(
      GherkinStreams.fromPaths([filePath], {
        defaultDialect: params.language ?? 'en',
        newId: IdGenerator.uuid()
      })
    );
    const parseErrors = envelopes.flatMap((envelope) =>
      envelope.parseError ? [envelope.parseError.message] : []
    );
    if (parseErrors.length > 0) {
      throw new Error(`Invalid Gherkin in ${filePath}:\n${parseErrors.join('\n')}`);
    }

    const document = envelopes.find((envelope) => envelope.gherkinDocument)?.gherkinDocument;

    if (!document?.feature) {
      continue;
    }

    const matchingAstNodeIds = new Set<string>();
    for (const envelope of envelopes) {
      const pickle = envelope.pickle;
      if (pickle && tagFilter.evaluate(pickle.tags.map((tag) => tag.name))) {
        // The Scenario AST id is present for both Scenarios and every row of
        // a Scenario Outline. Other ids identify the selected Examples row.
        for (const astNodeId of pickle.astNodeIds) {
          matchingAstNodeIds.add(astNodeId);
        }
      }
    }

    const entries = collectScenarioEntries(document.feature);
    let outputIndex = 0;

    for (const entry of entries) {
      if (!matchingAstNodeIds.has(entry.scenario.id)) {
        continue;
      }

      outputIndex += 1;
      let output = extractSingleScenarioSource(source, document.feature, entry, matchingAstNodeIds);
      output = stripUnwantedTags(output, params.removeTags);
      const outputName = makeOutputName(filePath, params.sourceSpecDirectory, outputIndex);
      fs.writeFileSync(path.join(params.tmpSpecDirectory, outputName), output, 'utf8');
    }
  }
}

function getFeatureFiles(params: UniqueScenarioSplitParams): string[] {
  if (params.singleFile) {
    return [params.singleFile];
  }

  return glob.sync(path.join(params.sourceSpecDirectory, '**/*.feature'), {
    nodir: true
  });
}

function collectScenarioEntries(feature: messages.Feature): ScenarioEntry[] {
  const entries: ScenarioEntry[] = [];

  feature.children.forEach((featureChild, featureChildIndex) => {
    if (featureChild.scenario) {
      entries.push({
        scenario: featureChild.scenario,
        featureChildIndex
      });
      return;
    }

    featureChild.rule?.children.forEach((ruleChild, ruleChildIndex) => {
      if (ruleChild.scenario) {
        entries.push({
          scenario: ruleChild.scenario,
          rule: featureChild.rule,
          featureChildIndex,
          ruleChildIndex
        });
      }
    });
  });

  return entries;
}

function extractSingleScenarioSource(
  source: string,
  feature: messages.Feature,
  entry: ScenarioEntry,
  matchingAstNodeIds: Set<string>
): string {
  const lines = source.split(/\r?\n/);
  const featureChildren = feature.children;
  const featureStarts = featureChildren.map((child) => leadingStart(lines, childStart(child)));
  const firstFeatureChildStart = featureStarts[0] ?? lines.length + 1;
  const chunks = [sliceLines(lines, 1, firstFeatureChildStart - 1)];

  featureChildren.forEach((child, index) => {
    if (child.background) {
      chunks.push(
        sliceLines(lines, featureStarts[index], (featureStarts[index + 1] ?? lines.length + 1) - 1)
      );
    }
  });

  if (!entry.rule) {
    const start = featureStarts[entry.featureChildIndex];
    const end = (featureStarts[entry.featureChildIndex + 1] ?? lines.length + 1) - 1;
    chunks.push(buildScenarioChunk(lines, entry.scenario, start, end, matchingAstNodeIds));
  } else {
    const rule = entry.rule;
    const ruleStart = featureStarts[entry.featureChildIndex];
    const ruleEnd = (featureStarts[entry.featureChildIndex + 1] ?? lines.length + 1) - 1;
    const ruleStarts = rule.children.map((child) =>
      leadingStart(lines, childStart(child), ruleStart)
    );
    const firstRuleChildStart = ruleStarts[0] ?? ruleEnd + 1;

    chunks.push(sliceLines(lines, ruleStart, firstRuleChildStart - 1));

    rule.children.forEach((child, index) => {
      if (child.background) {
        chunks.push(
          sliceLines(lines, ruleStarts[index], (ruleStarts[index + 1] ?? ruleEnd + 1) - 1)
        );
      }
    });

    const scenarioIndex = entry.ruleChildIndex!;
    chunks.push(
      buildScenarioChunk(
        lines,
        entry.scenario,
        ruleStarts[scenarioIndex],
        (ruleStarts[scenarioIndex + 1] ?? ruleEnd + 1) - 1,
        matchingAstNodeIds
      )
    );
  }

  let output = chunks
    .map((chunk) => chunk.trimEnd())
    .filter(Boolean)
    .join('\n\n');

  if (feature.language !== 'en' && !/^\s*#\s*language\s*:/im.test(output)) {
    output = `# language: ${feature.language}\n${output}`;
  }

  return `${output}\n`;
}

/**
 * Returns the scenario source, keeping only the Examples blocks that produced
 * a matching pickle. Tags apply to a whole Examples block, so every row in a
 * block shares the same tag set and blocks are kept or dropped as a unit.
 */
function buildScenarioChunk(
  lines: string[],
  scenario: messages.Scenario,
  scenarioStart: number,
  scenarioEnd: number,
  matchingAstNodeIds: Set<string>
): string {
  const examples = scenario.examples;
  if (examples.length === 0) {
    return sliceLines(lines, scenarioStart, scenarioEnd);
  }

  const exampleStarts = examples.map((block) =>
    leadingStart(lines, blockStart(block), scenarioStart)
  );
  const parts = [sliceLines(lines, scenarioStart, exampleStarts[0] - 1)];

  examples.forEach((block, index) => {
    const matched = block.tableBody.some((row) => matchingAstNodeIds.has(row.id));
    if (!matched) {
      return;
    }
    parts.push(
      sliceLines(lines, exampleStarts[index], (exampleStarts[index + 1] ?? scenarioEnd + 1) - 1)
    );
  });

  return parts
    .map((part) => part.trimEnd())
    .filter(Boolean)
    .join('\n\n');
}

function blockStart(block: messages.Examples): number {
  const tagLines = block.tags.map((tag) => tag.location.line);
  return Math.min(block.location.line, ...tagLines);
}

function childStart(child: messages.FeatureChild | messages.RuleChild): number {
  const node = child.background ?? child.scenario ?? ('rule' in child ? child.rule : undefined);
  if (!node) {
    throw new Error('Unsupported empty Gherkin child.');
  }

  const tagLines = 'tags' in node ? node.tags.map((tag) => tag.location.line) : [];
  return Math.min(node.location.line, ...tagLines);
}

function leadingStart(lines: string[], nodeStart: number, lowerBound = 1): number {
  let lineIndex = nodeStart - 2;

  while (lineIndex >= lowerBound - 1) {
    const trimmed = lines[lineIndex].trim();
    if (trimmed !== '' && !trimmed.startsWith('#')) {
      break;
    }
    lineIndex -= 1;
  }

  return lineIndex + 2;
}

function sliceLines(lines: string[], start: number, end: number): string {
  return start <= end ? lines.slice(start - 1, end).join('\n') : '';
}

function stripUnwantedTags(source: string, patterns?: string[]): string {
  if (!patterns?.length) {
    return source;
  }

  const matchers = patterns.map(globToRegExp);
  const shouldRemove = (tag: string): boolean => matchers.some((matcher) => matcher.test(tag));
  const lines = source.split('\n');
  const rewritten: string[] = [];

  for (const line of lines) {
    if (!isTagLine(line)) {
      rewritten.push(line);
      continue;
    }

    const indent = line.match(/^\s*/)?.[0] ?? '';
    const kept = line.trim().split(/\s+/).filter((tag) => !shouldRemove(tag));
    if (kept.length > 0) {
      rewritten.push(`${indent}${kept.join(' ')}`);
    }
  }

  const output = rewritten.join('\n');
  return output.endsWith('\n') ? output : `${output}\n`;
}

function isTagLine(line: string): boolean {
  return /^\s*(@\S+)(\s+@\S+)*\s*$/.test(line);
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
}

function makeOutputName(filePath: string, sourceDirectory: string, index: number): string {
  const relativePath = path.relative(sourceDirectory, filePath);
  const pathForName = relativePath.startsWith('..') ? path.basename(filePath) : relativePath;
  const relativeWithoutExtension = pathForName.replace(/\.feature$/i, '');
  const safeBase = relativeWithoutExtension.split(path.sep).join('_');
  return `${safeBase}_${index}.feature`;
}
