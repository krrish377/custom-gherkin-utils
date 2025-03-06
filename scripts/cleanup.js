// This script removes unnecessary files from dist folder
const fs = require('fs-extra');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..'); // Move up to project root
const distPath = path.join(projectRoot, 'dist');

// Directories to remove
const directories = ['tests', 'src'].map((dir) => path.join(distPath, dir));

// Files to remove (glob pattern for *.d.ts.map)
const removeFiles = (dir, pattern) => {
  fs.readdirSync(dir).forEach((file) => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      removeFiles(filePath, pattern);
    } else if (file.endsWith(pattern)) {
      fs.removeSync(filePath);
    }
  });
};

// Remove directories
directories.forEach((dir) => {
  if (fs.existsSync(dir)) {
    fs.removeSync(dir);
    console.log(`Removed: ${dir}`);
  }
});

// Remove .d.ts.map files
removeFiles(distPath, '.d.ts.map');

console.log('Cleanup completed.');
