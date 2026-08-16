import zipfile
import xml.etree.ElementTree as ET
import sys
import os

def docx_to_txt(docx_path):
    if not os.path.exists(docx_path):
        print(f"File not found: {docx_path}")
        return ""
    
    try:
        with zipfile.ZipFile(docx_path) as z:
            xml_content = z.read('word/document.xml')
            
        root = ET.fromstring(xml_content)
        
        # Namespace map
        namespaces = {
            'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
        }
        
        paragraphs = []
        for p in root.findall('.//w:p', namespaces):
            texts = []
            for t in p.findall('.//w:t', namespaces):
                if t.text:
                    texts.append(t.text)
            if texts:
                paragraphs.append("".join(texts))
        return "\n".join(paragraphs)
    except Exception as e:
        return f"Error reading {docx_path}: {str(e)}"

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python read_docx.py <path_to_docx>")
        sys.exit(1)
        
    path = sys.argv[1]
    text = docx_to_txt(path)
    # Save the text version next to the file
    out_name = os.path.splitext(path)[0] + ".txt"
    with open(out_name, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"Extracted text saved to {out_name}")
