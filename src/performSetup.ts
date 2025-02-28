import { splitScenarioOutlinesByRows, SplitParams } from './featureSplitter';
import * as fsextra from 'fs-extra';

export async function performSetup(options: SplitParams) {
  try {
    if (options.cleanTmpSpecDirectory) {
      fsextra.removeSync(options.tmpSpecDirectory);
    }
    fsextra.ensureDirSync(options.tmpSpecDirectory);
    await splitScenarioOutlinesByRows({
      sourceSpecDirectory: options.sourceSpecDirectory,
      tmpSpecDirectory: options.tmpSpecDirectory,
      tagExpression: options.tagExpression,
      singleFile: options.singleFile,
      language: options.language,
      cleanTmpSpecDirectory: options.cleanTmpSpecDirectory
    });
  } catch (error) {
    console.log('Error: ', error);
  }
}
//'./tests/features'
//'./tmp'
//performSetup({cleanTmpSpecDirectory: true, sourceSpecDirectory:'./samplefiles',tmpSpecDirectory:'./tmp',tagExpression: '@scenarioOutlineTag21' });
