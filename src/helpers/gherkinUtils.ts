import * as messages from '@cucumber/messages';

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
export function collectScenarioEntries(feature: messages.Feature): ScenarioEntry[] {
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
        ruleBackgrounds: []
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
          ruleBackgrounds
        });
      }
    }
  }

  return entries;
}

/**
 Expand scenario outline rows, preserving scenario name + placeholders
 Expands a Scenario Outline into multiple individual scenarios (one per example row).
*/
export function expandScenarioOutlineRows(scenario: messages.Scenario): messages.Scenario[] {
  // if no examples, or only one row total, just return as is
  if (!scenario.examples?.length) {
    return [scenario];
  }

  const expandedScenarios: messages.Scenario[] = [];

  for (const ex of scenario.examples) {
    for (const row of ex.tableBody ?? []) {
      expandedScenarios.push(cloneScenarioWithSingleRow(scenario, ex, row));
    }
  }

  return expandedScenarios;
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
  scenarioCopy.examples = original.examples
    ?.filter((exBlock) => exBlock.id === targetEx.id)
    .map((exBlock) => ({
      ...exBlock,
      tableBody: row ? [row] : [] // Keep only the single row
    }));

  return scenarioCopy;
}

/**
 * Deep clones a Scenario object.
 */
function deepCloneScenario(s: messages.Scenario): messages.Scenario {
  return JSON.parse(JSON.stringify(s)) as messages.Scenario;
}

/**
 * Gathers all relevant tags from Feature, Rule, Scenario, and Examples.
 */
export function gatherAllTagNames(
  feature: messages.Feature,
  rule: messages.Rule | undefined,
  scenario: messages.Scenario
): string[] {
  const featureTags = (feature.tags ?? []).map((t) => t.name);
  const ruleTags = rule ? (rule.tags ?? []).map((t) => t.name) : [];
  const scenarioTags = (scenario.tags ?? []).map((t) => t.name);
  const examplesTags = scenario.examples ? scenario.examples.flatMap((ex) => ex.tags?.map((t) => t.name) ?? []) : []; // ✅ Include Examples tags
  return [...featureTags, ...ruleTags, ...scenarioTags, ...examplesTags];
}
