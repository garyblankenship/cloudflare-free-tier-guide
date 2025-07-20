#!/usr/bin/env node

/**
 * Script to regenerate complete.md from all guide sections
 * This ensures the complete guide stays in sync with individual sections
 * 
 * Usage: node regenerate-complete.js
 */

const fs = require('fs').promises;
const path = require('path');

// Define the ordered list of files
const FILES = [
    '01-introduction.md',
    '02-real-tradeoffs.md',
    '03-cloudflare-pages.md',
    '04-workers.md',
    '05-hono-framework.md',
    '06-d1-database.md',
    '07-kv-store.md',
    '08-r2-storage.md',
    '09-vectorize.md',
    '10-workers-ai.md',
    '11-additional-services.md',
    '12-integration-cookbook.md',
    '13-closing.md'
];

async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function regenerateComplete() {
    console.log('🔄 Regenerating complete.md...\n');

    // Check if we're in the correct directory
    const introExists = await fileExists('01-introduction.md');
    if (!introExists) {
        console.error('❌ Error: Guide files not found. Please run this script from the cloudflare directory.');
        process.exit(1);
    }

    // No backups - trust git for version control

    // Start building the complete guide
    let content = '';
    
    // Add header
    content += '# The Complete Cloudflare Free Tier Guide\n\n';
    content += `*Generated on: ${new Date().toLocaleString()}*\n\n`;
    content += '---\n\n';

    // Process each file
    let sectionsIncluded = 0;
    for (const file of FILES) {
        const exists = await fileExists(file);
        
        if (exists) {
            console.log(`✅ Adding ${file}`);
            const fileContent = await fs.readFile(file, 'utf8');
            content += fileContent;
            content += '\n\n---\n\n';
            sectionsIncluded++;
        } else {
            console.log(`⚠️  Warning: ${file} not found, skipping...`);
        }
    }

    // Add footer
    content += '\n---\n\n';
    content += `*End of guide. Generated from individual sections on ${new Date().toLocaleString()}*\n`;

    // Write the complete file
    await fs.writeFile('complete.md', content);

    // Get statistics
    const stats = await fs.stat('complete.md');
    const lines = content.split('\n').length;
    const sizeKB = (stats.size / 1024).toFixed(2);

    console.log('\n✨ Complete.md regenerated successfully!');
    console.log('📊 Statistics:');
    console.log(`   - Total lines: ${lines.toLocaleString()}`);
    console.log(`   - File size: ${sizeKB} KB`);
    console.log(`   - Sections included: ${sectionsIncluded}/${FILES.length}`);

    // Verify the file was created
    if (stats.size > 0) {
        console.log('\n✅ Verification passed: complete.md exists and is not empty');
    } else {
        console.error('\n❌ Error: complete.md was not created properly');
        process.exit(1);
    }
}

// Run the script
regenerateComplete().catch(error => {
    console.error('❌ Error:', error.message);
    process.exit(1);
});