"use client";

import type { AnnotationStats as AnnotationStatsData } from "../../../hooks/useAnnotation";

type Props = {
  stats: AnnotationStatsData;
  regionClsList: string[];
};

/** SVG ドーナツチャート（ライブラリ不要） */
function DonutChart({ annotated, total }: { annotated: number; total: number }) {
  const R = 34;
  const cx = 44;
  const cy = 44;
  const circumference = 2 * Math.PI * R;
  const ratio = total > 0 ? annotated / total : 0;
  const annotatedArc = ratio * circumference;
  const pct = Math.round(ratio * 100);

  return (
    <svg width="88" height="88" viewBox="0 0 88 88" aria-label={`アノテーション完了率 ${pct}%`}>
      {/* トラック */}
      <circle
        cx={cx} cy={cy} r={R}
        fill="none"
        stroke="rgba(237,241,250,0.1)"
        strokeWidth="11"
      />
      {/* 完了分 */}
      <circle
        cx={cx} cy={cy} r={R}
        fill="none"
        stroke={pct === 100 ? "#7cf0ba" : pct > 0 ? "#7cb4f0" : "rgba(237,241,250,0.1)"}
        strokeWidth="11"
        strokeDasharray={`${annotatedArc} ${circumference - annotatedArc}`}
        strokeDashoffset={circumference / 4}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.45s cubic-bezier(.4,0,.2,1)" }}
      />
      <text x={cx} y={cy - 5} textAnchor="middle" fill="#edf1fa" fontSize="13" fontWeight="700">
        {pct}%
      </text>
      <text x={cx} y={cy + 9} textAnchor="middle" fill="rgba(237,241,250,0.45)" fontSize="8">
        完了
      </text>
    </svg>
  );
}

export default function AnnotationStats({ stats, regionClsList }: Props) {
  if (stats.total === 0) return null;

  const allClassCounts = [
    ...regionClsList.map((cls) => ({ cls, count: stats.classCounts[cls] ?? 0, unknown: false })),
    ...Object.entries(stats.classCounts)
      .filter(([cls]) => !regionClsList.includes(cls))
      .map(([cls, count]) => ({ cls, count, unknown: true })),
  ];
  const maxCount = Math.max(...allClassCounts.map((c) => c.count), 1);

  return (
    <div className="panel annotation-stats-panel">
      <p className="eyebrow" style={{ marginBottom: "0.85rem" }}>アノテーション状況</p>

      <div className="annotation-stats-layout">
        {/* ドーナツチャート + 凡例 */}
        <div className="annotation-stats-donut-wrap">
          <DonutChart annotated={stats.annotated} total={stats.total} />
          <div className="annotation-stats-legend">
            <div className="annotation-stats-legend-row">
              <span className="annotation-stats-dot annotated" />
              <span className="muted" style={{ fontSize: "0.74rem" }}>
                済み <strong style={{ color: "#edf1fa" }}>{stats.annotated}</strong>
              </span>
            </div>
            <div className="annotation-stats-legend-row">
              <span className="annotation-stats-dot unannotated" />
              <span className="muted" style={{ fontSize: "0.74rem" }}>
                未完 <strong style={{ color: "#edf1fa" }}>{stats.unannotated}</strong>
              </span>
            </div>
            <div className="annotation-stats-legend-row">
              <span className="muted" style={{ fontSize: "0.74rem" }}>
                合計 <strong style={{ color: "#edf1fa" }}>{stats.total}</strong> 枚
              </span>
            </div>
          </div>
        </div>

        {/* クラス別バーチャート */}
        {allClassCounts.length > 0 && (
          <div className="annotation-stats-classes">
            <p className="muted" style={{ fontSize: "0.7rem", marginBottom: "0.45rem" }}>
              クラス別リージョン数
            </p>
            {allClassCounts.map(({ cls, count, unknown }) => {
              const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
              return (
                <div key={cls} className="annotation-stats-bar-row">
                  <div className="annotation-stats-bar-label">
                    <span style={{ color: unknown ? "#ff9d9d" : "rgba(237,241,250,0.85)", fontSize: "0.73rem" }}>
                      {unknown ? `⚠ ${cls}` : cls}
                    </span>
                    <span
                      style={{
                        color: unknown ? "#ff9d9d" : "#7cb4f0",
                        fontSize: "0.73rem",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {count}
                    </span>
                  </div>
                  <div className="annotation-stats-bar-track">
                    <div
                      className={`annotation-stats-bar-fill${unknown ? " error" : ""}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 整合性チェック結果 */}
      {stats.issues.length > 0 && (
        <div className="annotation-stats-issues">
          {stats.issues.map((issue, i) => (
            <div key={i} className={`annotation-issue annotation-issue-${issue.level}`}>
              <span className="annotation-issue-icon">
                {issue.level === "error" ? "🔴" : "🟡"}
              </span>
              <span>{issue.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* 問題なし */}
      {stats.issues.length === 0 && stats.annotated > 0 && (
        <p className="annotation-stats-ok">
          ✓ 画像・クラス・ラベルに不一致はありません。学習に進めます。
        </p>
      )}
    </div>
  );
}
