import { GherkinStreams } from '@cucumber/gherkin-streams';
import * as messages from '@cucumber/messages';
import { IdGenerator } from '@cucumber/messages';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { performUniqueScenarioSetup } from '../src';

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFeature(dir: string, relativePath: string, contents: string): string {
  const filePath = path.join(dir, relativePath);
  fs.ensureDirSync(path.dirname(filePath));
  fs.writeFileSync(filePath, contents);
  return filePath;
}

async function runSplit(options: {
  source: Record<string, string>;
  tagExpression: string;
  singleFile?: string;
  language?: string;
  removeTags?: string[];
}): Promise<{ sourceDir: string; outputDir: string; files: string[] }> {
  const sourceDir = makeTempDir('unique-scenario-source-');
  const outputDir = makeTempDir('unique-scenario-output-');
  for (const [relativePath, contents] of Object.entries(options.source)) {
    writeFeature(sourceDir, relativePath, contents);
  }

  await performUniqueScenarioSetup({
    sourceSpecDirectory: sourceDir,
    tmpSpecDirectory: outputDir,
    cleanTmpSpecDirectory: true,
    tagExpression: options.tagExpression,
    language: options.language,
    removeTags: options.removeTags,
    singleFile: options.singleFile ? path.join(sourceDir, options.singleFile) : undefined
  });

  return {
    sourceDir,
    outputDir,
    files: fs.readdirSync(outputDir).filter((file) => file.endsWith('.feature')).sort()
  };
}

function readOutput(outputDir: string, fileName: string): string {
  return fs.readFileSync(path.join(outputDir, fileName), 'utf8');
}

async function parseFeature(filePath: string): Promise<messages.Envelope[]> {
  const envelopes: messages.Envelope[] = [];
  for await (const envelope of GherkinStreams.fromPaths([filePath], {
    defaultDialect: 'en',
    newId: IdGenerator.uuid()
  })) {
    envelopes.push(envelope);
  }
  return envelopes;
}

async function expectValidGherkin(filePath: string, pickleCount: number): Promise<void> {
  const parsed = await parseFeature(filePath);
  expect(parsed.find((envelope) => envelope.parseError)).toBeUndefined();
  expect(parsed.filter((envelope) => envelope.pickle)).toHaveLength(pickleCount);
}

describe('performUniqueScenarioSetup', () => {
  it('keeps only the Examples blocks that match the tag expression', async () => {
    const { outputDir, files } = await runSplit({
      tagExpression: '@selected',
      source: {
        'pruned.feature': `Feature: Examples filtering
  Scenario Outline: Mixed examples
    Given <value>

    @other
    Examples: Not selected
      | value |
      | one   |

    @selected
    Examples: Selected
      | value |
      | two   |
      | three |

    @alsoOther
    Examples: Also not selected
      | value |
      | four  |
`
      }
    });

    expect(files).toEqual(['pruned_1.feature']);
    const output = readOutput(outputDir, files[0]);
    expect(output).toContain('Scenario Outline: Mixed examples');
    expect(output).toContain('@selected\n    Examples: Selected');
    expect(output).toContain('| two   |');
    expect(output).toContain('| three |');
    expect(output).not.toContain('Examples: Not selected');
    expect(output).not.toContain('Examples: Also not selected');
    expect(output).not.toContain('| one   |');
    expect(output).not.toContain('| four  |');
    await expectValidGherkin(path.join(outputDir, files[0]), 2);
  });

  it('keeps every Examples block when the match comes from an inherited tag', async () => {
    const { outputDir, files } = await runSplit({
      tagExpression: '@suite',
      source: {
        'inheritedExamples.feature': `@suite
Feature: Inherited match
  Scenario Outline: All blocks run
    Given <value>

    @first
    Examples:
      | value |
      | one   |

    @second
    Examples:
      | value |
      | two   |
`
      }
    });

    const output = readOutput(outputDir, files[0]);
    expect(output).toContain('@first');
    expect(output).toContain('@second');
    expect(output).toContain('| one   |');
    expect(output).toContain('| two   |');
    await expectValidGherkin(path.join(outputDir, files[0]), 2);
  });

  it('emits one complete outline when any of its Cucumber pickles matches', async () => {
    const sourceDir = makeTempDir('unique-scenario-source-');
    const outputDir = makeTempDir('unique-scenario-output-');
    const source = `@feature
Feature: Complete unique scenarios
  # The feature background must remain.
  Background:
    Given shared setup

  @ruleTag
  Rule: Account rules
    Background:
      Given rule setup

    @outlineTag
    Scenario Outline: Keep the whole outline
      Given payload <payload>
        \`\`\`json
        {"value": "<payload>"}
        \`\`\`
      And escaped data
        | value |
        | a\\|b |

      @first
      Examples: First block
        | payload |
        | one     |
        | two     |

      # This second block and all its rows must also remain.
      @selected
      Examples: Second block
        | payload |
        | three   |

    @selected
    Scenario: Another matching scenario
      Given it is separate

  @selected
  Scenario: Top-level matching scenario
    Given it is also separate

  @ignored
  Scenario: Do not include
    Given it is ignored
`;
    fs.writeFileSync(path.join(sourceDir, 'complete.feature'), source);

    await performUniqueScenarioSetup({
      sourceSpecDirectory: sourceDir,
      tmpSpecDirectory: outputDir,
      cleanTmpSpecDirectory: true,
      tagExpression: '@selected'
    });

    const outputFiles = fs.readdirSync(outputDir).sort();
    expect(outputFiles).toEqual([
      'complete_1.feature',
      'complete_2.feature',
      'complete_3.feature'
    ]);

    const outlinePath = path.join(outputDir, 'complete_1.feature');
    const outline = fs.readFileSync(outlinePath, 'utf8');
    expect(outline).toContain('Feature: Complete unique scenarios');
    expect(outline).toContain('Background:\n    Given shared setup');
    expect(outline).toContain('Rule: Account rules');
    expect(outline).toContain('Given rule setup');
    expect(outline).toContain('@selected\n      Examples: Second block');
    expect(outline).toContain('| three   |');
    expect(outline).toContain('```json');
    expect(outline).toContain('| a\\|b |');
    expect(outline).not.toContain('Examples: First block');
    expect(outline).not.toContain('| two     |');
    expect(outline).not.toContain('Scenario: Another matching scenario');
    expect(outline).not.toContain('Scenario: Do not include');

    const parsed = await parseFeature(outlinePath);
    expect(parsed.filter((envelope) => envelope.pickle)).toHaveLength(1);
    expect(parsed.find((envelope) => envelope.parseError)).toBeUndefined();
  });

  it('does not combine tags from different Examples blocks', async () => {
    const sourceDir = makeTempDir('unique-scenario-tags-source-');
    const outputDir = makeTempDir('unique-scenario-tags-output-');
    fs.writeFileSync(
      path.join(sourceDir, 'tags.feature'),
      `Feature: Pickle tag semantics
  Scenario Outline: Tags belong to individual runnable rows
    Given <value>

    @a
    Examples:
      | value |
      | one   |

    @b
    Examples:
      | value |
      | two   |
`
    );

    await performUniqueScenarioSetup({
      sourceSpecDirectory: sourceDir,
      tmpSpecDirectory: outputDir,
      cleanTmpSpecDirectory: true,
      tagExpression: '@a and @b'
    });

    expect(fs.readdirSync(outputDir)).toEqual([]);
  });

  it('supports a non-English default dialect and makes each output self-contained', async () => {
    const sourceDir = makeTempDir('unique-scenario-fr-source-');
    const outputDir = makeTempDir('unique-scenario-fr-output-');
    fs.writeFileSync(
      path.join(sourceDir, 'francais.feature'),
      `@retenir
Fonctionnalité: Scénarios complets
  Plan du scénario: Exemple localisé
    Soit une valeur <valeur>

    Exemples:
      | valeur |
      | une    |
      | deux   |
`
    );

    await performUniqueScenarioSetup({
      sourceSpecDirectory: sourceDir,
      tmpSpecDirectory: outputDir,
      cleanTmpSpecDirectory: true,
      tagExpression: '@retenir',
      language: 'fr'
    });

    const outputPath = path.join(outputDir, 'francais_1.feature');
    const output = fs.readFileSync(outputPath, 'utf8');
    expect(output.startsWith('# language: fr\n')).toBe(true);

    const parsed = await parseFeature(outputPath);
    expect(parsed.filter((envelope) => envelope.pickle)).toHaveLength(2);
    expect(parsed.find((envelope) => envelope.parseError)).toBeUndefined();
  });

  it('preserves English aliases, step keywords, descriptions, and both docstring styles', async () => {
    const { outputDir, files } = await runSplit({
      tagExpression: '@keep',
      source: {
        'aliases.feature': `@keep
Feature: English aliases
  A feature description
  that spans two lines

  Background: Shared
    A background description
    * a star background step
      """
      untyped docstring
      """

  Example: Concrete example
    An example description
    Given a context
    When an action
    Then an outcome
    And a conjunction
    But a contrast
      """json
      {"ok": true}
      """

  Scenario Template: Templated outline
    A template description with <item>
    Given item <item>
      \`\`\`
      empty-media docstring for <item>
      \`\`\`
    When table data
      | col   | note |
      | a\\\\b | x\\ny |

    Scenarios: Named examples
      An examples description
      | item |
      | one  |
      | two  |
`
      }
    });

    expect(files).toEqual(['aliases_1.feature', 'aliases_2.feature']);
    const example = readOutput(outputDir, 'aliases_1.feature');
    const outline = readOutput(outputDir, 'aliases_2.feature');

    expect(example).toContain('Feature: English aliases');
    expect(example).toContain('A feature description');
    expect(example).toContain('Background: Shared');
    expect(example).toContain('* a star background step');
    expect(example).toContain('"""\n      untyped docstring\n      """');
    expect(example).toContain('Example: Concrete example');
    expect(example).toContain('Given a context');
    expect(example).toContain('When an action');
    expect(example).toContain('Then an outcome');
    expect(example).toContain('And a conjunction');
    expect(example).toContain('But a contrast');
    expect(example).toContain('"""json\n      {"ok": true}\n      """');
    expect(example).not.toContain('Scenario Template:');

    expect(outline).toContain('Scenario Template: Templated outline');
    expect(outline).toContain('A template description with <item>');
    expect(outline).toContain('```\n      empty-media docstring for <item>\n      ```');
    expect(outline).toContain('Scenarios: Named examples');
    expect(outline).toContain('An examples description');
    expect(outline).toContain('| two  |');
    expect(outline).toContain('| a\\\\b | x\\ny |');
    expect(outline).not.toContain('Example: Concrete example');

    await expectValidGherkin(path.join(outputDir, files[0]), 1);
    await expectValidGherkin(path.join(outputDir, files[1]), 2);
  });

  it('matches inherited Feature and Rule tags without dropping unmatched sibling outlines', async () => {
    const { outputDir, files } = await runSplit({
      tagExpression: '@suite and not @wip',
      source: {
        'inherited.feature': `@suite
Feature: Inherited tags
  @wip
  Scenario: Skipped by not
    Given skip me

  @ruleOnly
  Rule: Nested
    Scenario Outline: Included by feature tag
      Given <name>

      Examples:
        | name  |
        | alice |
        | bob   |

    @wip
    Scenario: Also skipped
      Given skip me too
`
      }
    });

    expect(files).toEqual(['inherited_1.feature']);
    const output = readOutput(outputDir, files[0]);
    expect(output).toContain('@suite\nFeature: Inherited tags');
    expect(output).toContain('@ruleOnly\n  Rule: Nested');
    expect(output).toContain('Scenario Outline: Included by feature tag');
    expect(output).toContain('| alice |');
    expect(output).toContain('| bob   |');
    expect(output).not.toContain('Skipped by not');
    expect(output).not.toContain('Also skipped');
    await expectValidGherkin(path.join(outputDir, files[0]), 2);
  });

  it('keeps comments attached to the selected scenario and its examples', async () => {
    const { outputDir, files } = await runSplit({
      tagExpression: '@keep',
      source: {
        'comments.feature': `Feature: Comments
  # Feature-level comment
  @keep
  # Comment above the outline
  Scenario Outline: Commented outline
    Given <value>

    # Comment above first examples
    Examples:
      | value |
      | one   |

    # Comment above second examples
    Examples:
      | value |
      | two   |

  # Comment above ignored scenario
  Scenario: Ignored
    Given leftover
`
      }
    });

    expect(files).toEqual(['comments_1.feature']);
    const output = readOutput(outputDir, files[0]);
    expect(output).toContain('# Feature-level comment');
    expect(output).toContain('# Comment above the outline');
    expect(output).toContain('# Comment above first examples');
    expect(output).toContain('# Comment above second examples');
    expect(output).not.toContain('# Comment above ignored scenario');
    expect(output).not.toContain('Scenario: Ignored');
    await expectValidGherkin(path.join(outputDir, files[0]), 2);
  });

  it('processes nested feature files and honors singleFile', async () => {
    const sourceDir = makeTempDir('unique-scenario-nested-source-');
    const outputDir = makeTempDir('unique-scenario-nested-output-');
    writeFeature(
      sourceDir,
      path.join('nested', 'inner.feature'),
      `@keep
Feature: Nested
  Scenario: Inner
    Given nested
`
    );
    writeFeature(
      sourceDir,
      'ignored.feature',
      `@keep
Feature: Ignored sibling
  Scenario: Outer
    Given outer
`
    );

    await performUniqueScenarioSetup({
      sourceSpecDirectory: sourceDir,
      tmpSpecDirectory: outputDir,
      cleanTmpSpecDirectory: true,
      tagExpression: '@keep'
    });
    expect(fs.readdirSync(outputDir).sort()).toEqual(['ignored_1.feature', 'nested_inner_1.feature']);

    const singleOutput = makeTempDir('unique-scenario-single-output-');
    await performUniqueScenarioSetup({
      sourceSpecDirectory: sourceDir,
      tmpSpecDirectory: singleOutput,
      cleanTmpSpecDirectory: true,
      tagExpression: '@keep',
      singleFile: path.join(sourceDir, 'nested', 'inner.feature')
    });
    expect(fs.readdirSync(singleOutput)).toEqual(['nested_inner_1.feature']);
  });

  it('returns no files when nothing matches and warns when no feature files exist', async () => {
    const { files } = await runSplit({
      tagExpression: '@missing',
      source: {
        'none.feature': `Feature: No match
  Scenario: Untagged
    Given skip
`
      }
    });
    expect(files).toEqual([]);

    const emptySource = makeTempDir('unique-scenario-empty-source-');
    const emptyOutput = makeTempDir('unique-scenario-empty-output-');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await performUniqueScenarioSetup({
      sourceSpecDirectory: emptySource,
      tmpSpecDirectory: emptyOutput,
      cleanTmpSpecDirectory: true,
      tagExpression: '@keep'
    });
    expect(fs.readdirSync(emptyOutput)).toEqual([]);
    expect(warn).toHaveBeenCalledWith('No .feature files found.');
    warn.mockRestore();
  });

  it('removes matching tags from output tag lines when removeTags is provided', async () => {
    const source = `@suite @internal @qa-env
Feature: Checkout
  @ruleTag @qa-nightly
  Rule: Payments
    @outline @internal
    Scenario Outline: Pay with card
      Given user @internal is logged in
      And payload <value>

      @first @qa-us
      Examples: US
        | value |
        | one   |

      @smoke @qa-eu
      Examples: EU
        | value |
        | two   |
        | three |

    @wip
    Scenario: Not selected
      Given skip
`;

    const { outputDir, files } = await runSplit({
      tagExpression: '@smoke',
      removeTags: ['@internal', '@qa-*'],
      source: { 'checkout.feature': source }
    });

    expect(files).toEqual(['checkout_1.feature']);
    const output = readOutput(outputDir, files[0]);
    expect(output).toContain('@suite\nFeature: Checkout');
    expect(output).toContain('@ruleTag\n  Rule: Payments');
    expect(output).toContain('@outline\n    Scenario Outline: Pay with card');
    expect(output).toContain('Given user @internal is logged in');
    expect(output).toContain('@smoke\n      Examples: EU');
    expect(output).not.toContain('@qa-env');
    expect(output).not.toContain('@qa-nightly');
    expect(output).not.toContain('@qa-eu');
    expect(output.split('\n').filter((line) => /^\s*(@\S+)(\s+@\S+)*\s*$/.test(line) && /@internal\b/.test(line))).toEqual([]);
    await expectValidGherkin(path.join(outputDir, files[0]), 2);
  });

  it('leaves tags unchanged when removeTags is omitted or empty', async () => {
    const source = `@keep @internal
Feature: Unchanged tags
  @keep
  Scenario: Tagged
    Given a step
`;

    const omitted = await runSplit({
      tagExpression: '@keep',
      source: { 'plain.feature': source }
    });
    expect(readOutput(omitted.outputDir, omitted.files[0])).toContain('@keep @internal');

    const empty = await runSplit({
      tagExpression: '@keep',
      removeTags: [],
      source: { 'plain.feature': source }
    });
    expect(readOutput(empty.outputDir, empty.files[0])).toContain('@keep @internal');
  });

  it('rejects invalid Gherkin', async () => {
    const sourceDir = makeTempDir('unique-scenario-invalid-source-');
    const outputDir = makeTempDir('unique-scenario-invalid-output-');
    writeFeature(
      sourceDir,
      'broken.feature',
      `Feature: Broken
  Scenario: Unclosed docstring
    Given a step
      """
      still open
`
    );

    await expect(
      performUniqueScenarioSetup({
        sourceSpecDirectory: sourceDir,
        tmpSpecDirectory: outputDir,
        cleanTmpSpecDirectory: true,
        tagExpression: '@keep'
      })
    ).rejects.toThrow(/Invalid Gherkin/);
  });
});
