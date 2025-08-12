import { markdown } from '@codemirror/lang-markdown';
import { html } from '@codemirror/lang-html';
import { json } from '@codemirror/lang-json';
import { javascript } from '@codemirror/lang-javascript';
import { LanguageSupport } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import { rectangularSelection } from '@codemirror/view';

/**
 * ファイル名に基づいて適切な言語サポートを取得する
 */
export const getLanguageByFileName = (fileName: string): LanguageSupport => {
  const lowerFileName = fileName.toLowerCase();
  
  if (lowerFileName.endsWith('.md') || lowerFileName.endsWith('.markdown')) {
    return markdown();
  } else if (lowerFileName.endsWith('.html') || lowerFileName.endsWith('.htm')) {
    return html();
  } else if (lowerFileName.endsWith('.json') || lowerFileName.endsWith('.ipynb')) {
    return json();
  } else if (lowerFileName.endsWith('.js') || lowerFileName.endsWith('.jsx') || 
             lowerFileName.endsWith('.ts') || lowerFileName.endsWith('.tsx')) {
    return javascript();
  } else if (lowerFileName.endsWith('.yml') || lowerFileName.endsWith('.yaml')) {
    // YAMLのサポートが追加されていないため、JSONで代用
    return json();
  }
  
  // デフォルトはマークダウン
  return markdown();
};

/**
 * テーマの設定を取得する
 */
export const getTheme = (isDark: boolean) => {
  return isDark ? oneDark : EditorView.theme({
    "&": {
      backgroundColor: "#ffffff",
      color: "#333333"
    },
    ".cm-content": {
      caretColor: "#0e9",
    },
    "&.cm-focused .cm-cursor": {
      borderLeftColor: "#0e9"
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "#d7d4f0"
    },
    ".cm-panels": {
      backgroundColor: "#f5f5f5",
      color: "#333333"
    },
    ".cm-panels.cm-panels-top": {
      borderBottom: "1px solid #ddd"
    },
    ".cm-panels.cm-panels-bottom": {
      borderTop: "1px solid #ddd"
    },
    ".cm-searchMatch": {
      backgroundColor: "#ffa",
      color: "#000000"
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: "#ff4"
    },
    ".cm-activeLine": {
      backgroundColor: "#f5f9ff"
    },
    ".cm-selectionMatch": {
      backgroundColor: "#d4d4d4"
    },
    ".cm-matchingBracket, .cm-nonmatchingBracket": {
      backgroundColor: "#ecf0f1",
      color: "#2980b9"
    },
    ".cm-gutters": {
      backgroundColor: "#f5f5f5",
      color: "#999999",
      border: "none"
    },
    ".cm-activeLineGutter": {
      backgroundColor: "#e0e6f1"
    },
    ".cm-foldPlaceholder": {
      backgroundColor: "#eee",
      border: "none",
      color: "#999999"
    },
    ".cm-tooltip": {
      border: "1px solid #ddd",
      backgroundColor: "#f5f5f5"
    },
    ".cm-tooltip .cm-tooltip-arrow:before": {
      borderTopColor: "#ddd"
    },
    ".cm-tooltip .cm-tooltip-arrow:after": {
      borderTopColor: "#f5f5f5"
    },
    ".cm-tooltip-autocomplete": {
      "& > ul > li[aria-selected]": {
        backgroundColor: "#ddd",
        color: "#333333"
      }
    }
  });
};

/**
 * エディタの共通設定
 */
export const getEditorExtensions = (
  language: LanguageSupport, 
  theme: any, 
  readOnly: boolean = false, 
  lineWrapping: boolean = true,
  enableRectangularSelection: boolean = false
) => {
  const extensions = [
    language,
    theme,
    EditorView.editable.of(!readOnly)
  ];
  
  if (lineWrapping) {
    extensions.push(EditorView.lineWrapping);
  }
  
  if (enableRectangularSelection) {
    extensions.push(rectangularSelection());
  }
  
  return extensions;
};

/**
 * ファイルの種類を判定する
 */
export const getFileType = (fileName: string): 'text' | 'markdown' | 'html' | 'json' | 'yaml' | 'sql' | 'csv' | 'tsv' | 'parquet' | 'mermaid' | 'excel' => {
  const lowerFileName = fileName.toLowerCase();
  
  if (lowerFileName.endsWith('.md') || lowerFileName.endsWith('.markdown')) {
    return 'markdown';
  } else if (lowerFileName.endsWith('.html') || lowerFileName.endsWith('.htm')) {
    return 'html';
  } else if (lowerFileName.endsWith('.json') || lowerFileName.endsWith('.ipynb')) {
    return 'json';
  } else if (lowerFileName.endsWith('.yml') || lowerFileName.endsWith('.yaml')) {
    return 'yaml';
  } else if (lowerFileName.endsWith('.sql')) {
    return 'sql';
  } else if (lowerFileName.endsWith('.csv')) {
    return 'csv';
  } else if (lowerFileName.endsWith('.tsv') || lowerFileName.endsWith('.tab')) {
    return 'tsv';
  } else if (lowerFileName.endsWith('.parquet')) {
    return 'parquet';
  } else if (lowerFileName.endsWith('.mmd')) {
    return 'mermaid';
  } else if (lowerFileName.endsWith('.xlsx') || lowerFileName.endsWith('.xls')) {
    return 'excel';
  }
  
  return 'text';
};
