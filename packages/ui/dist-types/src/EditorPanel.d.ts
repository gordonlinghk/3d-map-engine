import type { BuildingEditorLike } from './types';
export declare function EditorPanel({ editor, onExport, onSaveDraft, onOpenDraft, }: {
    editor: BuildingEditorLike;
    onExport?: () => void;
    onSaveDraft?: () => void;
    onOpenDraft?: () => void;
}): import("react").JSX.Element;
