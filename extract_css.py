import os

html_path = r'c:\Users\MedSys0246\Desktop\inventrack\inventrack\index.html'
css_path = r'c:\Users\MedSys0246\Desktop\inventrack\inventrack\styles.css'

with open(html_path, 'r', encoding='utf-8') as f:
    content = f.read()

start_idx = content.find('<style>')
end_idx = content.find('</style>', start_idx) + len('</style>')

if start_idx != -1 and end_idx != -1:
    # Extract just the CSS content
    style_content = content[start_idx + len('<style>'):end_idx - len('</style>')]
    
    with open(css_path, 'w', encoding='utf-8') as f:
        f.write(style_content.strip() + '\n')
    
    # Replace the style tag with a link tag
    link_tag = '<link rel="stylesheet" href="styles.css">'
    new_content = content[:start_idx] + link_tag + content[end_idx:]
    
    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    
    print("Successfully extracted CSS to styles.css and updated index.html")
else:
    print("Could not find <style> tags")
