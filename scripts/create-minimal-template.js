const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");
const fs = require("fs");
const path = require("path");

// Create a minimal DOCX template from scratch
function createMinimalTemplate() {
  // Minimal valid DOCX structure
  const zip = new PizZip();

  // [Content_Types].xml
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );

  // _rels/.rels
  zip.folder("_rels").file(
    ".rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );

  // word/_rels/document.xml.rels
  zip.folder("word").folder("_rels").file(
    "document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`
  );

  // word/document.xml with table structure
  zip.folder("word").file(
    "document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    
    <!-- Header: Address -->
    <w:p>
      <w:pPr>
        <w:pStyle w:val="Heading1"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:b/>
          <w:sz w:val="32"/>
        </w:rPr>
        <w:t>Address: </w:t>
      </w:r>
      <w:r>
        <w:rPr>
          <w:sz w:val="32"/>
        </w:rPr>
        <w:t>{{address}}</w:t>
      </w:r>
    </w:p>

    <!-- Header: Date -->
    <w:p>
      <w:r>
        <w:rPr>
          <w:b/>
        </w:rPr>
        <w:t>Date: </w:t>
      </w:r>
      <w:r>
        <w:t>{{date}}</w:t>
      </w:r>
    </w:p>

    <!-- Spacer -->
    <w:p/>

    <!-- Table Title -->
    <w:p>
      <w:pPr>
        <w:pStyle w:val="Heading2"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:b/>
          <w:sz w:val="28"/>
        </w:rPr>
        <w:t>Context & Findings</w:t>
      </w:r>
    </w:p>

    <!-- Table -->
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="9000" w:type="dxa"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>
        </w:tblBorders>
      </w:tblPr>
      
      <!-- Header Row -->
      <w:tr>
        <w:tc>
          <w:tcPr>
            <w:tcW w:w="4500" w:type="dxa"/>
            <w:shd w:val="clear" w:color="auto" w:fill="D9E2F3"/>
          </w:tcPr>
          <w:p>
            <w:pPr>
              <w:jc w:val="left"/>
            </w:pPr>
            <w:r>
              <w:rPr>
                <w:b/>
              </w:rPr>
              <w:t>Context Detail</w:t>
            </w:r>
          </w:p>
        </w:tc>
        <w:tc>
          <w:tcPr>
            <w:tcW w:w="4500" w:type="dxa"/>
            <w:shd w:val="clear" w:color="auto" w:fill="D9E2F3"/>
          </w:tcPr>
          <w:p>
            <w:pPr>
              <w:jc w:val="left"/>
            </w:pPr>
            <w:r>
              <w:rPr>
                <w:b/>
              </w:rPr>
              <w:t>Finding/Requirement</w:t>
            </w:r>
          </w:p>
        </w:tc>
      </w:tr>

      <!-- Loop Rows: {#backgrounds} ... {/backgrounds} -->
      <w:tr>
        <w:tc>
          <w:tcPr>
            <w:tcW w:w="4500" w:type="dxa"/>
          </w:tcPr>
          <w:p>
            <w:r>
              <w:t>{#backgrounds}{context}</w:t>
            </w:r>
          </w:p>
        </w:tc>
        <w:tc>
          <w:tcPr>
            <w:tcW w:w="4500" w:type="dxa"/>
          </w:tcPr>
          <w:p>
            <w:r>
              <w:t>{finding}{/backgrounds}</w:t>
            </w:r>
          </w:p>
        </w:tc>
      </w:tr>

    </w:tbl>

    <!-- End Spacer -->
    <w:p/>
    
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`
  );

  // Generate the DOCX file
  const buffer = zip.generate({ type: "nodebuffer" });
  const outputPath = path.join(__dirname, "..", "public", "product-selection.docx");

  fs.writeFileSync(outputPath, buffer);
  console.log("✅ Minimal template created:", outputPath);
  console.log("\nTemplate structure:");
  console.log("  - Placeholders: {{address}}, {{date}}");
  console.log("  - Table loop: {#backgrounds} ... {/backgrounds}");
  console.log("  - Row fields: {context}, {finding}");
}

createMinimalTemplate();









