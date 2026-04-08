"use client";

import { motion } from "framer-motion";

export type TopbarProps = {
  imgIdx: number;
  totalImages: number;
  imageName: string;
  onPrev: () => void;
  onNext: () => void;
  onSave: () => void;
  onClose: () => void;
};

export default function Topbar({
  imgIdx,
  totalImages,
  imageName,
  onPrev,
  onNext,
  onSave,
  onClose,
}: TopbarProps) {
  return (
    <div className="kanno-topbar">
      <div className="kanno-topbar-left">
        <span className="kanno-img-name">
          {imgIdx + 1} / {totalImages} - {imageName}
        </span>
      </div>
      <div className="kanno-topbar-right">
        <motion.button
          type="button"
          className="kanno-nav-btn"
          disabled={imgIdx === 0}
          onClick={onPrev}
        >
          前
        </motion.button>
        <motion.button
          type="button"
          className="kanno-nav-btn"
          disabled={imgIdx === totalImages - 1}
          onClick={onNext}
        >
          次
        </motion.button>
        <motion.button type="button" className="kanno-save-btn" onClick={onSave}>
          保存して閉じる
        </motion.button>
        <motion.button type="button" className="kanno-close-btn" onClick={onClose}>
          x
        </motion.button>
      </div>
    </div>
  );
}
