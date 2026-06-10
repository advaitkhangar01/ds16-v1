const fs = require('fs');
const path = require('path');

const target = "D:\\Freelance\\ds16-v1\\server\\node_modules\\supertest\\lib\\tests\\projects.test.js";

console.log("Checking path:", target);
console.log("fs.existsSync(target):", fs.existsSync(target));

try {
  const stats = fs.statSync(target);
  console.log("File exists! Stats:", stats);
  const content = fs.readFileSync(target, 'utf8');
  console.log("Content first 200 chars:", content.substring(0, 200));
} catch (err) {
  console.error("Error reading file:", err.message);
}
