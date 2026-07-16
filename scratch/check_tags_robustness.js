// scratch/check_tags_robustness.js
const { DOCUMENT_TAGS, DOCUMENT_TYPE_SLUG_MAP } = require('../server/utils/constants');

console.log("Starting robustness checks on document configuration...");

const errors = [];
const slugSet = new Set();

// 1. Check length
console.log(`- Total document tags: ${DOCUMENT_TAGS.length}`);
console.log(`- Total mapped slugs: ${Object.keys(DOCUMENT_TYPE_SLUG_MAP).length}`);

if (DOCUMENT_TAGS.length !== Object.keys(DOCUMENT_TYPE_SLUG_MAP).length) {
  errors.push("Count mismatch between DOCUMENT_TAGS and DOCUMENT_TYPE_SLUG_MAP.");
}

// 2. Check bidirectional mapping & values
DOCUMENT_TAGS.forEach(tag => {
  const slug = DOCUMENT_TYPE_SLUG_MAP[tag];
  if (!slug) {
    errors.push(`Tag "${tag}" is missing from DOCUMENT_TYPE_SLUG_MAP.`);
    return;
  }
  
  // Check slug characters
  if (!/^[a-z0-9-]+$/.test(slug)) {
    errors.push(`Slug "${slug}" for tag "${tag}" contains invalid filesystem characters (must be lowercase alphanumeric + hyphens).`);
  }
  
  // Check duplicates
  if (slugSet.has(slug)) {
    errors.push(`Duplicate slug detected: "${slug}"`);
  }
  slugSet.add(slug);
});

// Check if any mapping keys do not exist in DOCUMENT_TAGS
Object.keys(DOCUMENT_TYPE_SLUG_MAP).forEach(tag => {
  if (!DOCUMENT_TAGS.includes(tag)) {
    errors.push(`Tag "${tag}" in DOCUMENT_TYPE_SLUG_MAP is missing from DOCUMENT_TAGS.`);
  }
});

if (errors.length > 0) {
  console.error("\n❌ Robustness check failed with errors:");
  errors.forEach(err => console.error(`  - ${err}`));
  process.exit(1);
} else {
  console.log("\n✅ Robustness check passed! All configurations are fully aligned and safe for filesystem operations.");
}
