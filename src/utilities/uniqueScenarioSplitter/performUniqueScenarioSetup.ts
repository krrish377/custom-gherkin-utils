import * as fs from 'fs-extra';
import {
  splitUniqueScenariosByTag,
  UniqueScenarioSplitParams
} from './uniqueScenarioSplitter';

/**
 * Options for {@link performUniqueScenarioSetup}.
 *
 * Extends {@link UniqueScenarioSplitParams} with output-folder cleanup.
 */
export interface UniqueScenarioSetupParams extends UniqueScenarioSplitParams {
  /**
   * When `true`, `tmpSpecDirectory` is deleted before writing new files.
   * The directory is always created if it does not exist.
   */
  cleanTmpSpecDirectory: boolean;
}

/**
 * Public entry point for unique-scenario splitting.
 *
 * Cleans and/or creates `tmpSpecDirectory`, then writes one self-contained
 * `.feature` file per matching `Scenario` or `Scenario Outline`.
 *
 * Matching uses Cucumber pickle tags (Feature, Rule, Scenario, and Examples
 * tags are inherited the same way Cucumber does). A matching outline is
 * written once and keeps only the `Examples` blocks that matched; other
 * blocks are dropped. Optional {@link UniqueScenarioSplitParams.removeTags}
 * then strips unwanted tags from output tag lines.
 *
 * @param options - Source, output, tag filter, and optional tag-stripping settings.
 * @returns Resolves when all matching files have been written.
 * @throws {Error} If a source file contains invalid Gherkin.
 *
 * @example
 * ```ts
 * import { performUniqueScenarioSetup } from 'custom-gherkin-utils';
 *
 * await performUniqueScenarioSetup({
 *   cleanTmpSpecDirectory: true,
 *   sourceSpecDirectory: './features',
 *   tmpSpecDirectory: './out',
 *   tagExpression: '@smoke and not @wip',
 *   removeTags: ['@internal', '@qa-*']
 * });
 * ```
 *
 * @see {@link splitUniqueScenariosByTag} for the same split without directory setup.
 */
export async function performUniqueScenarioSetup(
  options: UniqueScenarioSetupParams
): Promise<void> {
  if (options.cleanTmpSpecDirectory) {
    fs.removeSync(options.tmpSpecDirectory);
  }
  fs.ensureDirSync(options.tmpSpecDirectory);
  await splitUniqueScenariosByTag(options);
}
