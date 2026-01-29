# Environment Variables for Vercel

Add this environment variable to your Vercel project settings:

## Template URL
```
NEXT_PUBLIC_TEMPLATE_URL=https://pub-b582ad6d283d4856ad81447d904f0691.r2.dev/templates/product-selection-v2.docx
```

## How to Add in Vercel:
1. Go to https://vercel.com/your-project/settings/environment-variables
2. Add new variable:
   - Name: `NEXT_PUBLIC_TEMPLATE_URL`
   - Value: `https://pub-b582ad6d283d4856ad81447d904f0691.r2.dev/templates/product-selection-v2.docx`
   - Environments: Production, Preview, Development
3. Click "Save"
4. Redeploy

## What This Does:
- Template will be fetched from R2 instead of from /public
- No Git LFS storage used
- Fast CDN delivery
- No build size limits



