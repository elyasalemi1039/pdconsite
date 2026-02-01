/**
 * This script fixes Word's broken placeholder XML
 * Run with: node scripts/fix-template.js
 */

const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

const templatePath = path.join(__dirname, '..', 'public', 'product-selection.docx');
const backupPath = path.join(__dirname, '..', 'public', 'product-selection-backup.docx');
const outputPath = path.join(__dirname, '..', 'public', 'product-selection.docx');

console.log('🔧 Fixing Word template placeholders...\n');

// Backup the original
fs.copyFileSync(templatePath, backupPath);
console.log('✅ Backup created: product-selection-backup.docx');

// Read the .docx file
const content = fs.readFileSync(templatePath, 'binary');
const zip = new PizZip(content);

// Get the document.xml
let documentXml = zip.file('word/document.xml').asText();

console.log('\n📝 Original placeholders found:');
const originalMatches = documentXml.match(/\{\{[^}]+\}\}/g) || [];
console.log(originalMatches.slice(0, 10));

// Fix broken placeholders by removing XML tags between braces
// This regex finds patterns like {{<w:...>text</w:...>}} and cleans them

console.log('\n🔧 Fixing broken placeholders...');

// Fix address placeholder
documentXml = documentXml.replace(
  /\{\{(<[^>]+>)*a(<[^>]+>)*d(<[^>]+>)*d(<[^>]+>)*r(<[^>]+>)*e(<[^>]+>)*s(<[^>]+>)*s(<[^>]+>)*\}\}/gi,
  '{{address}}'
);

// Fix date placeholder
documentXml = documentXml.replace(
  /\{\{(<[^>]+>)*d(<[^>]+>)*a(<[^>]+>)*t(<[^>]+>)*e(<[^>]+>)*\}\}/gi,
  '{{date}}'
);

// Fix contact-name placeholder
documentXml = documentXml.replace(
  /\{\{(<[^>]+>)*c(<[^>]+>)*o(<[^>]+>)*n(<[^>]+>)*t(<[^>]+>)*a(<[^>]+>)*c(<[^>]+>)*t(<[^>]+>)*-(<[^>]+>)*n(<[^>]+>)*a(<[^>]+>)*m(<[^>]+>)*e(<[^>]+>)*\}\}/gi,
  '{{contact-name}}'
);

// Fix company placeholder
documentXml = documentXml.replace(
  /\{\{(<[^>]+>)*c(<[^>]+>)*o(<[^>]+>)*m(<[^>]+>)*p(<[^>]+>)*a(<[^>]+>)*n(<[^>]+>)*y(<[^>]+>)*\}\}/gi,
  '{{company}}'
);

// Fix phone-number placeholder
documentXml = documentXml.replace(
  /\{\{(<[^>]+>)*p(<[^>]+>)*h(<[^>]+>)*o(<[^>]+>)*n(<[^>]+>)*e(<[^>]+>)*-(<[^>]+>)*n(<[^>]+>)*u(<[^>]+>)*m(<[^>]+>)*b(<[^>]+>)*e(<[^>]+>)*r(<[^>]+>)*\}\}/gi,
  '{{phone-number}}'
);

// Fix email placeholder
documentXml = documentXml.replace(
  /\{\{(<[^>]+>)*e(<[^>]+>)*m(<[^>]+>)*a(<[^>]+>)*i(<[^>]+>)*l(<[^>]+>)*\}\}/gi,
  '{{email}}'
);

// Generic fixer for any remaining broken placeholders
// This removes any XML tags between the opening {{ and closing }}
const fixBrokenPlaceholders = (xml) => {
  return xml.replace(/\{\{([^}]*)\}\}/g, (match, inner) => {
    // Remove all XML tags from inside the placeholder
    const cleaned = inner.replace(/<[^>]+>/g, '');
    return `{{${cleaned}}}`;
  });
};

documentXml = fixBrokenPlaceholders(documentXml);

console.log('\n✅ Placeholders fixed!');
console.log('\n📝 Fixed placeholders:');
const fixedMatches = documentXml.match(/\{\{[^}]+\}\}/g) || [];
console.log([...new Set(fixedMatches)].slice(0, 15));

// Update the zip with the fixed XML
zip.file('word/document.xml', documentXml);

// Generate the new .docx
const newContent = zip.generate({
  type: 'nodebuffer',
  compression: 'DEFLATE'
});

// Write the fixed file
fs.writeFileSync(outputPath, newContent);

console.log('\n✅ Template fixed and saved!');
console.log('\n📋 Summary:');
console.log('  - Original: product-selection-backup.docx');
console.log('  - Fixed: product-selection.docx');
console.log('\n⚠️  Note: You still need to:');
console.log('  1. Remove the "Price" column from the table');
console.log('  2. Open in Word and verify it looks correct');
console.log('  3. Save and commit to Git\n');









