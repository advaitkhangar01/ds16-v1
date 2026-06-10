const fs = require('fs');
const path = require('path');

const dir = "D:\\Freelance\\ds16-v1\\server\\node_modules\\supertest\\lib";
console.log("Listing:", dir);
try {
  const files = fs.readdirSync(dir);
  console.log("Files:", files);
  for (const f of files) {
    const p = path.join(dir, f);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) {
      console.log(`Subdir: ${f}, files:`, fs.readdirSync(p));
    }
  }
} catch (err) {
  console.error("Error:", err.message);
}
