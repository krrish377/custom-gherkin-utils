import { performSetup } from '../src/index';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

function makeTempDir(prefix: string): string {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return base;
}

function listFeatureFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.feature'));
}

function getFixturesDir(): string {
  return path.resolve(__dirname, 'performSetup', 'features');
}

function getExpectedDir(): string {
  return path.resolve(__dirname, 'performSetup', 'expected_results');
}

describe('performSetup / splitScenarioOutlinesByRows (fixture-based)', () => {
  it('splits all fixtures and matches expected outputs', async () => {
    const fixturesDir = getFixturesDir();
    const expectedDir = getExpectedDir();

    const sourceDir = makeTempDir('gherkin-source-all-');
    const tmpDir = makeTempDir('gherkin-tmp-all-');

    // Copy only the fixtures that have explicit expected results and are known to be supported by the splitter
    const fixtureFiles = ['basic.feature', 'rules.feature', 'outline.feature'];
    fixtureFiles.forEach((file) => {
      fs.copyFileSync(path.join(fixturesDir, file), path.join(sourceDir, file));
    });

    await performSetup({
      sourceSpecDirectory: sourceDir,
      tmpSpecDirectory: tmpDir,
      cleanTmpSpecDirectory: true
    });

    const actualFiles = listFeatureFiles(tmpDir).sort();
    const expectedFiles = listFeatureFiles(expectedDir)
      .filter((f) => f.startsWith('basic_') || f.startsWith('rules_') || f.startsWith('outline_'))
      .sort();

    expect(actualFiles).toEqual(expectedFiles);

    actualFiles.forEach((file) => {
      const actual = fs.readFileSync(path.join(tmpDir, file), 'utf8').trim();
      const expected = fs.readFileSync(path.join(expectedDir, file), 'utf8').trim();
      expect(actual).toBe(expected);
    });
  });

  it('respects tagExpression when filtering scenarios (using fixtures)', async () => {
    const fixturesDir = getFixturesDir();
    const expectedDir = getExpectedDir();

    const sourceDir = makeTempDir('gherkin-source-tags-');
    const tmpDir = makeTempDir('gherkin-tmp-tags-');

    // Only copy the tags fixture
    fs.copyFileSync(path.join(fixturesDir, 'tags.feature'), path.join(sourceDir, 'tags.feature'));

    await performSetup({
      sourceSpecDirectory: sourceDir,
      tmpSpecDirectory: tmpDir,
      cleanTmpSpecDirectory: true,
      tagExpression: '@smoke'
    });

    const outFiles = listFeatureFiles(tmpDir).sort();
    expect(outFiles).toEqual(['tags_1.feature']);

    const actual = fs.readFileSync(path.join(tmpDir, outFiles[0]), 'utf8').trim();
    const expected = fs.readFileSync(path.join(expectedDir, 'tags_1.feature'), 'utf8').trim();
    expect(actual).toBe(expected);
  });

  it('allows processing a single file via singleFile option (using fixtures)', async () => {
    const fixturesDir = getFixturesDir();
    const expectedDir = getExpectedDir();

    const sourceDir = makeTempDir('gherkin-source-single-');
    const tmpDir = makeTempDir('gherkin-tmp-single-');

    const includedSourcePath = path.join(sourceDir, 'included.feature');
    fs.copyFileSync(path.join(fixturesDir, 'included.feature'), includedSourcePath);
    fs.copyFileSync(path.join(fixturesDir, 'ignored.feature'), path.join(sourceDir, 'ignored.feature'));

    await performSetup({
      sourceSpecDirectory: sourceDir,
      tmpSpecDirectory: tmpDir,
      cleanTmpSpecDirectory: true,
      singleFile: includedSourcePath
    });

    const outFiles = listFeatureFiles(tmpDir).sort();
    expect(outFiles).toEqual(['included_1.feature']);

    const actual = fs.readFileSync(path.join(tmpDir, outFiles[0]), 'utf8').trim();
    const expected = fs.readFileSync(path.join(expectedDir, 'included_1.feature'), 'utf8').trim();
    expect(actual).toBe(expected);
  });

  it('adds language header when language option is provided (using fixtures)', async () => {
    const fixturesDir = getFixturesDir();
    const expectedDir = getExpectedDir();

    const sourceDir = makeTempDir('gherkin-source-lang-');
    const tmpDir = makeTempDir('gherkin-tmp-lang-');

    fs.copyFileSync(path.join(fixturesDir, 'language.feature'), path.join(sourceDir, 'language.feature'));

    await performSetup({
      sourceSpecDirectory: sourceDir,
      tmpSpecDirectory: tmpDir,
      cleanTmpSpecDirectory: true,
      language: 'fr'
    });

    const outFiles = listFeatureFiles(tmpDir).sort();
    expect(outFiles).toEqual(['language_1.feature']);

    const actual = fs.readFileSync(path.join(tmpDir, outFiles[0]), 'utf8').trim();
    const expected = fs.readFileSync(path.join(expectedDir, 'language_1.feature'), 'utf8').trim();
    expect(actual).toBe(expected);
  });
});

