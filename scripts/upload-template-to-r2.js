/**
 * Upload the clean template to R2 storage
 */

const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const templatePath = path.join(__dirname, '..', 'public', 'product-selection-v2.docx');

async function uploadTemplateToR2() {
  console.log('🔧 Uploading template to R2...\n');

  // Check if template exists
  if (!fs.existsSync(templatePath)) {
    console.log('❌ Template not found, creating it first...');
    require('./create-clean-template.js');
  }

  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const endpoint = process.env.R2_ENDPOINT;
  const bucket = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;

  if (!accessKeyId || !secretAccessKey || !endpoint || !bucket) {
    console.log('⚠️  R2 credentials not found in environment');
    console.log('   Skipping R2 upload, template will be served from /public\n');
    return;
  }

  const client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });

  const templateBuffer = fs.readFileSync(templatePath);
  const key = 'templates/product-selection-v2.docx';

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: templateBuffer,
        ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ACL: 'public-read',
        CacheControl: 'no-cache, no-store, must-revalidate',
      })
    );

    const url = `${publicUrl.replace(/\/$/, '')}/${key}`;
    console.log('✅ Template uploaded to R2!');
    console.log(`📍 URL: ${url}\n`);
    
    // Write the URL to a file for the app to use
    const urlFile = path.join(__dirname, '..', 'template-url.txt');
    fs.writeFileSync(urlFile, url);
    console.log('✅ Template URL saved to template-url.txt\n');
  } catch (error) {
    console.error('❌ Failed to upload to R2:', error.message);
    console.log('   Template will be served from /public\n');
  }
}

uploadTemplateToR2().catch(console.error);









