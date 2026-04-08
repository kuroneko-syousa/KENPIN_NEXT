"use client";

export type AnnotationToolbarProps = {
  imagesCount: number;
  onOpen: () => void;
};

/** アノテーター起動ボタン（ステートレス） */
export default function AnnotationToolbar({ imagesCount, onOpen }: AnnotationToolbarProps) {
  if (imagesCount === 0) return null;

  return (
    <div className="workflow-actions" style={{ marginTop: "0.5rem" }}>
      <button type="button" className="ls-open-btn" onClick={onOpen}>
        <span className="ls-open-icon">🏷️</span>
        アノテーターを開く（{imagesCount} 枚）
      </button>
    </div>
  );
}
