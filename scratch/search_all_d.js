const fs = require('fs');
const path = require('path');

function search(dir, name) {
  try {
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const filePath = path.join(dir, file);
      if (filePath.includes('supertest')) {
        console.log("TRAVERSING supertest PATH:", filePath);
      }
      let stat;
      try {
        stat = fs.statSync(filePath);
      } catch (e) {
        continue;
      }
      if (stat && stat.isDirectory()) {
        search(filePath, name);
      } else if (file === name) {
        console.log("FOUND:", filePath);
      }
    }
  } catch (err) {
    // ignore
  }
}

console.log("Searching D:\\Freelance for projects.test.js with traversal logs...");
search("D:\\Freelance", "projects.test.js");
console.log("Done.");
