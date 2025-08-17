#!/usr/bin/env python3
"""
Script to remove console.log statements and their orphaned arguments from TypeScript files.
This handles multi-line console.log statements properly.
"""

import re
import sys
import os

def remove_console_logs(content):
    """Remove console.log statements and their arguments."""
    
    # Pattern to match console.log with potentially multi-line arguments
    # This handles nested objects, arrays, and function calls
    pattern = r'console\.log\s*\([^;]*?\);?'
    
    # Start with the content
    result = content
    
    # Keep removing console.log statements until no more are found
    previous_length = 0
    while len(result) != previous_length:
        previous_length = len(result)
        
        # Find console.log statements
        matches = list(re.finditer(r'console\.log\s*\(', result))
        
        for match in reversed(matches):  # Process from end to beginning to maintain indices
            start = match.start()
            
            # Find the matching closing parenthesis
            paren_count = 0
            i = match.end() - 1  # Start at the opening paren
            
            while i < len(result):
                if result[i] == '(':
                    paren_count += 1
                elif result[i] == ')':
                    paren_count -= 1
                    if paren_count == 0:
                        # Found the matching closing paren
                        end = i + 1
                        
                        # Check if there's a semicolon after
                        while end < len(result) and result[end] in [' ', '\t', '\n']:
                            end += 1
                        if end < len(result) and result[end] == ';':
                            end += 1
                        
                        # Remove the console.log statement
                        result = result[:start] + result[end:]
                        break
                i += 1
    
    # Clean up any remaining orphaned object literals that might be left
    # This is more aggressive and might catch some edge cases
    lines = result.split('\n')
    cleaned_lines = []
    
    for line in lines:
        # Skip lines that are just orphaned object literals or arrays
        stripped = line.strip()
        if (stripped.startswith('{') and stripped.endswith('},') and 
            not stripped.startswith('{') or 'function' in stripped):
            continue
        if (stripped.startswith('[') and stripped.endswith('],') and
            not 'const' in stripped and not 'let' in stripped and not 'var' in stripped):
            continue
            
        cleaned_lines.append(line)
    
    return '\n'.join(cleaned_lines)

def process_file(file_path):
    """Process a single file to remove console.log statements."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        original_content = content
        cleaned_content = remove_console_logs(content)
        
        if cleaned_content != original_content:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(cleaned_content)
            print(f"Cleaned {file_path}")
            return True
        else:
            print(f"No console.log statements found in {file_path}")
            return False
            
    except Exception as e:
        print(f"Error processing {file_path}: {e}")
        return False

def main():
    files_to_clean = [
        'src/components/analysis/DataAnalysis.tsx',
        'src/components/analysis/MultiFileAnalysis.tsx',
        'src/components/preview/DataPreview.tsx',
        'src/lib/dataPreviewUtils.ts',
        'src/lib/dataAnalysisUtils.ts',
        'src/components/preview/ExcelPreview.tsx',
        'src/components/layout/MainLayout.tsx'
    ]
    
    cleaned_count = 0
    for file_path in files_to_clean:
        if os.path.exists(file_path):
            if process_file(file_path):
                cleaned_count += 1
        else:
            print(f"File not found: {file_path}")
    
    print(f"\nCleaned {cleaned_count} files total.")

if __name__ == "__main__":
    main()