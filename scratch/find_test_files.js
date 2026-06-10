const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      // Walk everything except node_modules, unless it's supertest
      if (file !== 'node_modules' || dir.endsWith('node_modules')) {
        results = results.concat(walk(filePath));
      }
      if (file === 'node_modules') {
        const supertestPath = path.join(filePath, 'supertest');
        if (fs.existsSync(supertestPath)) {
          results = results.concat(walk(supertestPath));
        }
      }
    } else {
      if (file.endsWith('.test.js')) {
        results.push(filePath);
      }
    }
  });
  return results;
}

try {
  const root = path.join(__dirname, '..');
  console.log("Root directory is:", root);
  const testFiles = walk(root);
  console.log("Found test files:");
  testFiles.forEach(f => console.log(f));
} catch (err) {
  console.error("Error walking directory:", err.message);
}
