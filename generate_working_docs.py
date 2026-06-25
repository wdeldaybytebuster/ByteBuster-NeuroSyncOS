import os
import glob
import re

directories_to_scan = [
    '/home/williamdeldaymarketing/Projects/NeuroSyncMega/docs/docs/**/*.md',
    '/home/williamdeldaymarketing/Projects/NeuroSyncMega/docs/context/**/*.md'
]

def generate_working_file(filepath):
    if '_working.md' in filepath:
        return
    
    filename, ext = os.path.splitext(filepath)
    working_filepath = f"{filename}_working{ext}"
    
    if os.path.exists(working_filepath):
        return
        
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Extract title
    title_match = re.search(r'^#\s+(.*)', content, re.MULTILINE)
    title = title_match.group(1) if title_match else os.path.basename(filepath)
    
    # Extract first paragraph as summary
    # Remove frontmatter
    body = re.sub(r'^---\n.*?\n---\n', '', content, flags=re.DOTALL)
    # Remove all headers
    body = re.sub(r'^#+ .*?\n', '', body, flags=re.MULTILINE)
    
    paragraphs = [p.strip() for p in body.split('\n\n') if p.strip()]
    first_paragraph = paragraphs[0] if paragraphs else "No summary available."
    
    summary = f"**Document Summary: {title}**\n\n{first_paragraph}"
    
    working_content = f"{summary}\n\n===\n\n<!-- Append-only log of changes managed by BaseVault -->\n"
    
    with open(working_filepath, 'w', encoding='utf-8') as f:
        f.write(working_content)
    
    print(f"Created {working_filepath}")

for pattern in directories_to_scan:
    for filepath in glob.glob(pattern, recursive=True):
        if os.path.isfile(filepath):
            generate_working_file(filepath)

print("Finished generating _working files.")
