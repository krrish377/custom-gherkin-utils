import { processFeatureFiles } from '../src/featureParser';
import * as fs from 'fs-extra';
import path from 'path';

describe('Feature File Processing (Real Files)', () => {
  const featureDir = path.resolve(__dirname, 'features');
  const expectedDir = path.resolve(__dirname, 'expected_results');

  const featureFiles = fs.readdirSync(featureDir).filter(file => file.endsWith('.feature'));

  featureFiles.forEach(file => {
    test(`Processing: ${file}`, async () => {
      const featureFilePath = path.join(featureDir, file);
      const expectedFilePath = path.join(expectedDir, file);
      const tempFilePath = path.join(featureDir, `temp_${file}`);

      try {
        // Copy feature file to a temp file before modifying
        fs.copyFileSync(featureFilePath, tempFilePath);

        // Process the temp file
        await processFeatureFiles(tempFilePath);

        // Read modified content
        const modifiedContent = fs.readFileSync(tempFilePath, 'utf8').trim();
        const expectedContent = fs.readFileSync(expectedFilePath, 'utf8').trim();

        // Compare with expected output
        expect(modifiedContent).toBe(expectedContent);
      } finally {
        // Cleanup - Remove temp file after test
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      }
    });
  });
});
