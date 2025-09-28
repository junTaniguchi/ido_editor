import type { EditorView } from '@codemirror/view';

export interface EditorRefValue {
  view: EditorView | null;
}
