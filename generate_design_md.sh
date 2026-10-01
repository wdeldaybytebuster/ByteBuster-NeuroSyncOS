#!/bin/bash
echo "# NeuroSync Sovereign OS Design System" > DESIGN.md
echo "" >> DESIGN.md
echo "## Brand Guidelines" >> DESIGN.md
echo "The brand identity is an Executive System, moving away from speculative AI towards Defense-in-Depth reliability. The UI should be highly responsive, resilient, and convey a high degree of sovereign control." >> DESIGN.md
echo "" >> DESIGN.md
echo "## Color Palette" >> DESIGN.md
echo "- Primary: \`#0A0A0A\` (Dark Obsidian)" >> DESIGN.md
echo "- Accent: \`#4A90E2\` (System Blue)" >> DESIGN.md
echo "- Warning: \`#F39C12\` (Alert Orange)" >> DESIGN.md
echo "- Success: \`#27AE60\` (Secure Green)" >> DESIGN.md
echo "" >> DESIGN.md
echo "## Typography" >> DESIGN.md
echo "Modern, monospaced-inspired for data, with clean sans-serif (Inter, Roboto, or Outfit) for primary readable text." >> DESIGN.md
echo "" >> DESIGN.md
echo "## Logos" >> DESIGN.md

for logo in public/*Logo.png; do
  name=$(basename "$logo" .png)
  # using file URI so the local Stitch MCP can read it
  echo "### $name" >> DESIGN.md
  echo "![$name](file:///home/williamdeldaymarketing/Projects/NeuroSyncMega/$logo)" >> DESIGN.md
  echo "" >> DESIGN.md
done

echo "DESIGN.md generated successfully."
