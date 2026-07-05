import type { HistoricalMapData } from '../types';
/**
 * 三國鼎立(約 221–229 年定型後的格局)。
 *
 * 資料整理原則(見 repo 根目錄 map-data-sources-research.md §3):
 * - 城池為史料明確記載(attested);座標取現代對應城市位置(inferred)——
 *   戰略尺度(1 unit = 1 km)下與漢代治所的偏差可忽略。
 * - 疆界為示意(stylized):漢末沒有線狀國界,只有城池控制。
 * - 河流取現代河道;黃河下游三國時走北道(滄州入海),已按古道近似繪製
 *   (inferred)。
 * - 本資料為自行整理之原創彙編(參考正史記載),無第三方資料庫版權負擔。
 */
export declare const THREE_KINGDOMS: HistoricalMapData;
