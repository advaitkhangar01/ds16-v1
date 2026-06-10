const fs = require('fs');
const path = require('path');

const dir = "D:\\Freelance\\ds16-v1\\server\\tests";
console.log("Listing:", dir);
try {
  const files = fs.readdirSync(dir);
  console.log("Files:", files);
} catch (err) {
  console.error("Error:", err.message);
}
