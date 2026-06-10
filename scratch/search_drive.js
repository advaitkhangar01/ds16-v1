const fs = require('fs');
const path = require('path');

function search(dir, name) {
  try {
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const filePath = path.join(dir, file);
      let stat;
      try {
        stat = fs.statSync(filePath);
      } catch (e) {
        continue;
      }
      if (stat && stat.isDirectory()) {
        search(filePath, name);
      } else if (file === name) {
        console.log("FOUND AT:", filePath);
      }
    }
  } catch (err) {
    // Ignore errors
  }
}

console.log("Searching D:\\Freelance for projects.test.js...");
search("D:\\Freelance", "projects.test.js");
console.log("Search complete.");
