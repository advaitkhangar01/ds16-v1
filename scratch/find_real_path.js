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
        console.log("FOUND RAW PATH:", filePath);
        console.log("DIR IS:", dir);
        console.log("FILE IS:", file);
        try {
          console.log("REAL PATH:", fs.realpathSync(filePath));
        } catch (e) {
          console.log("REAL PATH ERROR:", e.message);
        }
      }
    }
  } catch (err) {
    // ignore
  }
}

console.log("Searching D:\\ for projects.test.js...");
search("D:\\", "projects.test.js");
console.log("Done.");
