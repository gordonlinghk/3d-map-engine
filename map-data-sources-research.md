# 地圖數據來源調研與技術選型文檔

> 目的:為 3D Map Engine 擴展「多地圖數據來源」能力(現代城市之外:歷史、主題、不同時代的 3D 地圖),供選型決策用。
> 特別案例:**古代三國時期中國地圖**的可行性深度分析。
> 撰寫日期:2026-07-06。本輪只做調研,不改代碼。
> 查證方式:所有關鍵授權條款與資料可用性均經網上核實(含 API 實測),來源連結附於各節;無法核實處明確標註「待確認」。

---

## 0. 引擎現狀(評估基準)

目前引擎已有兩類資料來源,新來源的接入成本以此為參照:

| 現有來源 | 路徑 | 已建立的基礎設施 |
|---|---|---|
| 程序生成 | seed + `MapConfig` → `generateWorld()` | determinism、chunk 高度網格、道路圖、街區 |
| OSM 真實城市 | Overpass / Photon → `@map-engine/osm` → `osmToWorld()` | **`MapWorld` 統一格式**、bbox 分塊抓取、烘焙 CLI、`GeocodingProvider` 抽象 |

**核心資產:`MapWorld` 已經是一個與資料來源無關的統一地圖格式**(chunks 高度網格 + 建築 footprint + 道路圖 + 水體/綠地多邊形 + 物件 metadata)。任何新來源的本質工作都是「寫一個 X→MapWorld 的轉換器」,渲染層零改動——OSM adapter 已證明此路可行。

---

## 1. 數據來源類型分類

| 類型 | 代表來源 | 對本引擎的角色 |
|---|---|---|
| 現代城市與地理 | OSM/Overpass、Geofabrik PBF | **已接入**;大範圍可再深化 |
| 全球小比例尺底圖 | Natural Earth | 洲/國家尺度的海岸線、河流、邊界(歷史地圖的現代底圖) |
| 地名 gazetteer | GeoNames、Wikidata、WHG、TGAZ | 搜尋、標註、古今地名對照 |
| 歷史地圖(向量) | CHGIS、OpenHistoricalMap、historical-basemaps | 歷史政區、疆界、治所點位 |
| 歷史地圖(掃描 raster) | 譚其驤地圖集掃描、David Rumsey、CCTS WMTS | **只能做人工參考底圖**,不能直接轉 3D |
| 地形 / 高程 (DEM) | SRTM、Copernicus GLO-30、AWS Terrain Tiles | 真實地形——現代與歷史地圖**通用**(山川千年基本不變) |
| 水文圖層 | HydroSHEDS/HydroRIVERS、OSM water、Natural Earth rivers | 河流網絡(注意:現代河道 ≠ 古代河道,見 §3.3) |
| 人工整理資料 | 自建 JSON/YAML(城池、勢力、事件) | 歷史/主題地圖的**主體**,不確定性可控 |
| 商業 API | Google/Mapbox/HERE | **經查證:ToS 禁止本引擎的用法,排除**(見 §2.9) |

---

## 2. 可靠數據來源推薦(逐一評估)

評估欄位:內容 / 3D 適用 / 歷史適用 / 格式 / 授權 / API key / 費用 / 可靠性 / 接入難度 / 主要限制。

### 2.1 OpenStreetMap(已接入)
- **內容**:全球建築 footprint、道路、水體、綠地、POI。
- **3D 適用**:✅ 已驗證(擠出建築、道路圖、車流)。**歷史適用**:❌(只有現狀)。
- **格式**:Overpass JSON(live)、`.osm.pbf`([Geofabrik](https://download.geofabrik.de/) 區域擠出檔,適合超大範圍離線烘焙)。
- **授權**:ODbL 1.0(署名 + 衍生資料庫 share-alike)。**API key**:不需要。**費用**:免費(公共 Overpass 禮儀 <10k queries/日、帶 UA)。
- **可靠性**:高。**接入難度**:已完成。
- **限制**:無高程(見 2.5 補足)、無歷史;公共伺服器無 SLA。

### 2.2 Natural Earth
- **內容**:1:10m/50m/110m 三級——海岸線、河流+湖泊、國界/一級政區、城市點。
- **3D 適用**:✅ 洲/國家尺度(不適合城市街道級)。**歷史適用**:◐ 作為歷史地圖的「自然地理底圖」極佳(海岸線、山川輪廓)。
- **格式**:Shapefile / GeoPackage / SQLite(官方);GeoJSON 有社群鏡像。
- **授權**:**Public Domain,連署名都不要求**([官方條款](https://www.naturalearthdata.com/about/terms-of-use/))。**API key**:無(直接 HTTP 下載,全包 ~576MB)。**費用**:免費。
- **可靠性**:高。**接入難度**:低(一次性下載 + 轉 GeoJSON)。
- **限制**:比例尺粗,無城市內部細節;政區是現代的。

### 2.3 GeoNames
- **內容**:>2,500 萬全球地名,含人口、海拔、多語言別名。
- **3D 適用**:◐(點位標註,非幾何)。**歷史適用**:◐(以現代地名為主,含部分歷史別名)。
- **格式**:TSV dump(`allCountries.zip`,每日更新)+ REST API(JSON)。
- **授權**:CC-BY 4.0([官方](https://www.geonames.org/about.html))。**API key**:需免費註冊 username。**費用**:免費(10,000 credits/日)。
- **可靠性**:高。**接入難度**:低。
- **限制**:對本引擎與 Photon 功能重疊;歷史地名不成體系。

### 2.4 Wikidata / DBpedia
- **內容**:結構化知識圖譜;歷史政權、古城條目(部分有座標,如鄴城 [Q1274372](https://www.wikidata.org/wiki/Q1274372) 實測有 P625 座標)。
- **3D 適用**:◐(點位 + metadata,無幾何面)。**歷史適用**:✅ 但零散(見 §3)。
- **格式**:[SPARQL](https://query.wikidata.org/sparql)(JSON)、REST。
- **授權**:**CC0(公有領域)**——可打包進開源 repo、可商用。**API key**:不需要。**費用**:免費。
- **可靠性**:條目品質不均;三國真實政區覆蓋零散(實測:「許都」「建業」多命中消歧義頁或《三國演義》虛構地點條目)。**接入難度**:低-中(SPARQL 查詢 + 人工篩選)。
- **限制**:**無成套的三國州—郡—縣層級資料**;需人工核對。

### 2.5 高程 DEM(現代與歷史通用的地形底座)

| 來源 | 解析度 | 格式 | 授權 | 取得 | 適用性 |
|---|---|---|---|---|---|
| [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/)(Tilezen) | z0-15 | **terrarium PNG**(`h = R*256+G+B/256−32768`)| PD/開放,[需署名](https://github.com/tilezen/joerd/blob/master/docs/attribution.md) | HTTP 直取,**免帳號免 key** | **首選**:tile 制與引擎 chunk 天然對齊 |
| [Copernicus GLO-30](https://registry.opendata.aws/copernicus-dem/) | 30m | Cloud-Optimized GeoTIFF | 免費含商用,**須保留 DLR/Airbus 版權聲明** | AWS S3 免帳號 | 品質最新;GeoTIFF 解析要多做工 |
| SRTM 30m | 30m | HGT/GeoTIFF | 美國政府作品,公有領域 | 需免費 Earthdata 帳號 | 經典;60°N 以上無資料 |
| [OpenTopography API](https://portal.opentopography.org/apidocs/) | 聚合多源 | GeoTIFF(bbox 裁切) | 沿用底層資料授權 | 需免費 API key,50 次/24h(非學術) | 適合 CLI 烘焙,不適合 live |

- **3D 適用**:✅✅(直接解決 OSM v1「平地」限制)。**歷史適用**:✅✅(山脈河谷千年不變,三國地圖照用)。
- **接入難度**:中(terrarium PNG 解碼極簡單——一張 `<canvas>` 讀 RGB 即可;重點工作是重採樣到 chunk 高度網格 + 與現有 `OSM_GROUND` 平地邏輯銜接)。
- **限制**:AWS Terrain Tiles 混合多上游,個別地區品質不一;z15 (~5m/px) 對街道級夠用。

### 2.6 HydroSHEDS / HydroRIVERS(河流網絡)
- **內容**:全球 850 萬條河段(集水區 ≥10 km²),含流量分級。
- **3D 適用**:✅(河流 polyline → 引擎水體層)。**歷史適用**:◐(現代河道;古河道問題見 §3.3)。
- **格式**:Shapefile / Geodatabase。
- **授權**:v1 為**自有 License**(免費含商用、須署名、**限制再散布**,[條款](https://www.hydrosheds.org/page/license));附屬品 HydroATLAS 等為 CC-BY 4.0。v2 授權「待確認」。
- **可靠性**:高。**接入難度**:中。
- **限制**:再散布限制意味不宜整包 commit 進 repo,適合烘焙時引用。

### 2.7 CHGIS(哈佛/復旦 中國歷史 GIS)——三國資料的學術金標準
- **內容**:**221 BCE–1911 CE 連續時間序列**的縣/府級治所點位(含起訖年代)、府級面;以譚其驤《中國歷史地圖集》為基準、由復旦史地所重編。**實測 [TGAZ API](https://chgis.hudci.org/tgaz/) 查「许昌」→ 许昌县 (221~533 CE, 114.010, 33.992, 隸潁川郡)——三國年代點位真實存在且可查詢**。
- **3D 適用**:✅(點位+年代;面資料在早期年代不完整——官方自述 1350 CE 前有缺口)。**歷史適用**:✅✅ 就是為此而生。
- **格式**:Shapefile([Harvard Dataverse V6](https://dataverse.harvard.edu/dataverse/chgis_v6),分 GBK/UTF-8)。
- **授權**:⚠️ **專有 [EULA](https://doi.org/10.7910/DVN/FDLFJ3):僅限非商業學術/教育;禁止再散布(不得打包進公開發行的作品);商用須另簽授權**。
- **API key**:TGAZ 查詢 API 免 key。**費用**:免費(非商業)。
- **可靠性**:高(學術權威)。**接入難度**:資料本身易處理;**授權是主要障礙**。
- **限制**:不能把資料集直接打包進本開源 repo 或商業遊戲;合法用法 = 作為人工整理時的**查證參考**(逐點核對事實性座標),或去函申請商業授權(「待確認」可行性)。

### 2.8 其他歷史來源
| 來源 | 要點 | 授權 | 三國適用 |
|---|---|---|---|
| [OpenHistoricalMap](https://www.openhistoricalmap.org/) | 有專屬 Overpass 實例(**與現有 fetchOsmArea 幾乎即插即用**);**實測三國覆蓋極稀疏**:魏/蜀/吳只有政權點位節點,疆域面 relation = 0 | **CC0** | 現階段資料太少;架構上最易接 |
| [World Historical Gazetteer](https://whgazetteer.org/public_data/) | 中國部分收錄 CHGIS 的 **1911 年切片**(4 萬+ 城鎮),非三國切片 | CC-BY 4.0 | 間接參考 |
| [historical-basemaps](https://github.com/aourednik/historical-basemaps) (GitHub) | `world_200.geojson`/`world_300.geojson` 世界尺度政權疆界(無 250 年檔) | GPL-3.0(傳染性) | 僅洲際尺度粗輪廓,可作勢力範圍的起稿參考 |
| 中研院 [CCTS](https://gis.rchss.sinica.edu.tw/ccts/) | 譚圖底圖 WebGIS;只開放 WMTS raster 圖磚,向量不下載 | **未明示,待確認**(需洽 gis@gate.sinica.edu.tw) | 人工參考 |
| 譚其驤《中國歷史地圖集》 | 紙本/掃描仍在版權期;**無合法開放向量版**;網上流傳的向量化 repo 多為未授權描摹,有版權風險 | 版權保護中 | 只可「人眼參考」,不可描摹入庫 |
| [eSericaLab/eSerica-geojson-map](https://github.com/eSericaLab/eSerica-geojson-map) | 三國勢力面+城市點 GeoJSON,但作者自述基於《三國志 11/13》遊戲地圖;**無 LICENSE 檔** | 未授權(法律上保留所有權利) | 結構可參考,資料不可直接用 |

### 2.9 商業地圖 API(Google / Mapbox / HERE)——**排除**
經逐條核實 ToS,三家對「抓取資料 → 轉成自有 3D 世界格式 → 離線保存」**全部明確禁止**:
- **Google Maps Platform**:[ToS §3.2.3](https://cloud.google.com/maps-platform/terms) 禁止 scraping、pre-fetch、cache(暫存上限 30 天)、禁止導出 Content 到第三方平台。
- **Mapbox**:[Product Terms](https://www.mapbox.com/legal/tos)「No Tracing, Deriving, or Extracting」條款,禁止提取 tileset 資料建 derivative works(Terrain-RGB 同樣受限)。
- **HERE**:freemium 250k 次/月(數字「待確認」),但同樣不允許建立永久離線副本。

**結論:本引擎的核心用法(資料→烘焙→自有格式)只有開放資料是乾淨路徑。** 商業 API 唯一合規用法是 runtime 即時顯示(不保存),與引擎架構不符,不建議接入。

---

## 3. 古代三國中國地圖可行性分析

### 3.1 結論先行

**可行,但不是「接一個 API」的問題,而是「建一個人工整理的資料包 + 真實地形」的問題。** 沒有任何單一來源能直接餵出三國 3D 地圖;但「真實 DEM 地形 + 人工整理的城池/勢力資料(以 CC0 來源為骨幹、以 CHGIS/TGAZ 為查證參考)」的組合完全可行,且工作量可控(MVP 約 50–100 個城池點 + 3 個勢力面 + 主要河流)。

### 3.2 可取得什麼

| 資料 | 最佳來源 | 可得性 |
|---|---|---|
| **地形(山脈、高原、盆地)** | AWS Terrain Tiles / Copernicus DEM | ✅ 完整、免費、合法——蜀道之難、秦嶺、長江天險都是真實地形 |
| **城池點位**(許昌、鄴、成都、建業…) | 人工整理;逐點以 TGAZ 查證 + Wikidata(CC0)交叉核對 | ✅ 可得,需人工;約數十至數百點 |
| **州郡層級**(十三州、郡) | 正史(《後漢書·郡國志》《三國志》)+ TGAZ 查證 | ◐ 州治/郡治點位可考;**州界面沒有可靠開放資料** |
| **勢力範圍**(魏/蜀/吳) | 人工繪製(參考 historical-basemaps world_200 粗輪廓 + 史料) | ◐ 本質上是推定,且隨年份劇烈變動(220 vs 262 差異大) |
| **河流** | HydroRIVERS / Natural Earth(現代河道) | ⚠️ 可得但有史實陷阱(見 3.3) |
| **道路**(馳道、蜀道、棧道) | 無開放 GIS 資料;史料 + 地形推定 | ❌ 需人工;可用引擎現有道路圖沿河谷/隘口手工佈線 |
| **建築**(城牆、宮殿) | 無;程序生成 + 風格化 | ❌ 走「主題化程序生成」(中式城郭 preset) |

### 3.3 不完整或有爭議之處(必須誠實面對)

1. **疆界本質上是推定**:漢末三國沒有現代意義的線狀國界,只有城池控制與勢力消長;任何「魏蜀吳界線」都是後人繪製的示意。譚圖本身也選定特定年份(如 262 年)作切片。
2. **黃河改道**:黃河下游河道歷史上多次大改道,**現代河道 ≠ 三國河道**;直接用 HydroRIVERS 會把黃河畫錯位置(下游數百公里級誤差)。長江主河道相對穩定。海岸線亦有變化(如江漢平原、渤海灣淤積)。
3. **早期年代資料缺口**:CHGIS 官方自述 1350 CE 前空間覆蓋有缺口;縣級點位有,但**面資料(政區界)在三國年代不完整**。
4. **地名爭議**:同名異地、治所遷移(如州治多次移動)、《三國演義》虛構地名混入(Wikidata 實測就有「Romance of the Three Kingdoms 的許都」條目)。

### 3.4 設計方向:歷史準確 vs 遊戲化近似

**建議:遊戲化近似為主、史實錨點為輔("historically grounded, not historically exact")。** 理由:
- 你的引擎是低模風格化渲染,本來就不是學術製圖工具;
- 「準確」在疆界問題上根本不存在,追求它是無底洞;
- 但**城池位置和地形必須真**——這是「三國地圖」有別於架空地圖的靈魂,而這兩樣恰好是可靠可得的。

### 3.5 資料不確定性標註(schema 層面解決)

在人工資料包的 schema 中內建溯源與置信欄位,例如:

```json
{
  "id": "city:xuchang",
  "name": "許昌(許都)",
  "position": { "lat": 33.992, "lon": 114.010 },
  "kind": "capital",
  "faction": "wei",
  "period": { "from": 196, "to": 280 },
  "confidence": "attested",          // attested(史料明確) | inferred(推定) | stylized(遊戲化)
  "sources": ["《三國志·武帝紀》", "TGAZ hvd_80325 查證"],
  "notes": "220 年前為漢獻帝行都"
}
```

- `confidence` 三級制貫穿城池/邊界/道路;UI 上勢力範圍用虛線+漸變(視覺語言表明「示意」),城池 InfoPanel 顯示出處。
- 文檔與 demo 頁面明示:「本地圖為風格化演繹,非學術復原」。
- **這同時解決法律問題**:人工整理 + 逐點標注出處 = 自有著作的資料集(座標作為歷史事實不受著作權保護,但不可成套複製 CHGIS 資料庫——資料庫權利保護的是「彙編」)。

### 3.6 法律紅線總結

- ✅ 可以:引用 Wikidata(CC0)座標;閱讀史料/TGAZ 逐點查證自己整理的資料;用真實 DEM;參考 historical-basemaps 起稿(注意 GPL 傳染,建議只參考不複製)。
- ❌ 不可以:把 CHGIS shapefile 打包進 repo(EULA 禁止再散布);描摹譚圖掃描件成向量;直接使用無 LICENSE 的 GitHub 三國 GeoJSON。

---

## 4. 數據格式與接入方式

### 4.1 格式適配度

| 格式 | 對本引擎 | 處理方式 |
|---|---|---|
| **GeoJSON** | ★★★ 首選交換格式 | 直接 parse;與 `Vec2[]` footprint/polygon 天然對應 |
| **手工 JSON(自定 schema)** | ★★★ 歷史資料包首選 | 即 §3.5 schema;可 commit 進 repo、可 code review |
| **terrarium PNG tiles** | ★★★ 高程首選 | canvas 解碼 → 重採樣進 chunk 高度網格 |
| Overpass JSON | ★★★(已用) | 現有管線 |
| `.osm.pbf` | ★★ | 烘焙 CLI 用(超大範圍);需 pbf parser 依賴 |
| **Shapefile** | ★ 不直接支援 | **離線轉換**:`ogr2ogr` / [mapshaper](https://mapshaper.org/) → GeoJSON(進 bake pipeline,不進 runtime) |
| GeoTIFF (DEM) | ★ | 同上,離線轉 heightmap;runtime 用 terrarium 即可 |
| CSV/TSV (GeoNames) | ★★ | 一次性 import 腳本 |
| Vector/Raster Tiles (MVT/WMTS) | ✗ | MVT 解碼成本高;raster 無法轉 3D——不接 |
| SPARQL JSON (Wikidata) | ★★ | 整理腳本用,不進 runtime |

### 4.2 轉換 pipeline 與統一 schema

**不需要發明新的統一 schema——`MapWorld` 就是統一 schema**,只需小幅擴充:

```
來源層          轉換層(離線為主)                 統一層         渲染層
─────────      ──────────────────────           ────────      ────────
Overpass  ──→  osmToWorld()          (已有)  ┐
terrarium ──→  demToChunks()         (新)    ├─→  MapWorld ──→ @map-engine/three
GeoJSON   ──→  geojsonToLayers()     (新)    │    (擴充:      (不動)
手工 JSON ──→  curatedToWorld()      (新)    ┘     provenance,
                                                    era, labels)
```

- 轉換一律走 **bake(離線)優先**:與 B12 已建立的「烘焙 → `?world=` 載入」管線同構,歷史地圖天然是「烘焙一次、載入多次」。
- `MapWorld` 需要的擴充(向後相容,全部 optional):`meta.provenance`(來源+授權署名清單——ODbL/CC-BY 的署名義務由 schema 保證)、`meta.era`(年代)、物件級 `confidence`/`sources`(進現有 `metadata` 欄位即可,**零 schema 變更**)。

---

## 5. 推薦的資料抽象架構

沿用引擎已驗證的兩個模式:**「來源 adapter 輸出 MapWorld」**(osm 包)+ **「Provider 介面可插拔」**(GeocodingProvider)。

```
@map-engine/core                     ← 不新增任何來源邏輯(鐵律)
   └─ MapWorld(統一 schema)

@map-engine/sources(新包,或按來源分包)
   ├─ MapDataProvider          介面:id、capabilities、fetch(region, options) → SourceBundle
   ├─ ModernCityProvider       = 現有 osm 包重新歸位(Overpass + Photon)
   ├─ TerrainProvider          terrarium/Copernicus → chunk 高度網格
   ├─ LayerDataProvider        GeoJSON 圖層(河流/邊界/綠地)→ waterPolygons/greenPolygons/districts
   ├─ HistoricalMapProvider    人工資料包(§3.5 schema)+ 可選 OHM Overpass
   └─ normalize/               各 provider 專屬的 X→MapWorld adapter(純函數、可單測)

composeWorld(providers[]) → MapWorld   ← 關鍵:多 provider 疊合
   例:三國地圖 = TerrainProvider(真實 DEM)
              + HistoricalMapProvider(城池/勢力/河流修正)
              + 程序生成(中式建築填充城池內部)
```

**職責邊界**:
- 每個 provider 只負責「取得 + 轉成 MapWorld 片段」,**絕不碰渲染**(渲染層只認 MapWorld,現有 8 個圖層 group 直接復用;新視覺元素如「勢力範圍著色」是渲染層對 `districts` 既有概念的擴展)。
- `capabilities` 聲明(`terrain? buildings? roads? water? labels?`)讓 `composeWorld` 知道誰提供什麼、衝突時誰優先(例:HistoricalMapProvider 的古河道覆蓋 TerrainProvider 推出的現代水面)。
- **新增地圖類型 = 新增一個 provider 包 + 一個 bake 配方**,demo/渲染零改動——與 B7(osm)、B11(geocoding)的擴展路徑完全一致。
- 署名義務(ODbL/CC-BY/DLR 聲明)由 provider 寫進 `meta.provenance`,UI 自動渲染(現有 OSM attribution 的一般化)。

---

## 6. 方案比較與建議

| # | 方案 | 適合場景 | 優點 | 缺點 | 成本/難度 | 資料可靠性 | 第一階段? |
|---|---|---|---|---|---|---|---|
| A | **TerrainProvider:真實高程接入**(AWS Terrain Tiles → chunk) | 立即提升現有 OSM 城市(解決 v1 平地限制);為歷史地圖打地基 | 免費免 key;現代+歷史通用;工作量最小的高價值項 | 本身不產生新地圖類型 | 低(1–2 sessions) | 高 | ✅ **強烈建議** |
| B | **三國 MVP:人工資料包 + 真實地形**(§3.5 schema,50–100 城池、3 勢力、主要河流、中式建築 preset) | 你的目標場景;引擎差異化賣點 | 授權 100% 乾淨(自有資料+CC0+PD);不確定性可控可標註;直接產出可玩成果 | 人工整理需時;疆界永遠是近似 | 中(資料整理 2–3 天人工 + 開發 2–3 sessions);依賴 A 的地形 | 中-高(逐點查證) | ✅ **建議(A 之後)** |
| C | OpenHistoricalMap 接入(復用 Overpass 管線) | 未來歐美近代城市歷史地圖 | 技術上幾乎免費(改個 endpoint);CC0 | **三國覆蓋實測≈零**,現在接了沒內容 | 低 | 中(社群資料) | ⏸ 架構預留即可 |
| D | CHGIS 深度整合 | 學術級中國歷史地圖產品 | 資料最權威完整 | **授權禁止再散布/商用**;需與 Fairbank Center 談授權(結果待確認) | 低(技術)/高(法務) | 最高 | ❌ 只作查證參考 |
| E | 商業 API(Google/Mapbox/HERE) | — | — | **ToS 明確禁止本引擎用法**(§2.9) | — | — | ❌ 排除 |

### 最終建議:優先做 A → B(+ C 留架構位)

1. **A. TerrainProvider(真實高程)先行**——一石三鳥:修復 OSM v1 最大限制(香港是平的)、給三國地圖提供「蜀道天險」的地形真實感、建立 §5 架構的第一個非 OSM provider(把抽象打磨對)。免費、免 key、授權乾淨、範圍小。
2. **B. 三國 MVP 隨後**——這是唯一能同時滿足「可行、合法、有靈魂」的路徑:真實地形 + 人工整理的史實錨點資料包(Wikidata CC0 為骨幹、TGAZ 逐點查證、confidence 三級標註)+ 中式風格化程序建築。不要等「完美的歷史資料」——它不存在;資料包本身會成為你項目的獨有資產。
3. **C. 架構上為 OHM/其他來源留 provider 插槽**,但不投入內容開發,等社群資料成熟。

> 按此路徑,第一階段(A)完成後,現有全部功能(城市搜尋、烘焙、編輯器、草稿)自動獲得真實地形;第二階段(B)產出第一張非現代地圖,驗證整個多來源架構。

---

## 附:待確認清單

| 項目 | 需要做什麼 |
|---|---|
| CHGIS 商業授權可行性 | 去函 Fairbank Center / CHGIS Management Committee 詢價(若日後遊戲商業化且想要學術級資料) |
| 中研院 CCTS 資料授權 | 洽 gis@gate.sinica.edu.tw |
| HydroSHEDS v2 授權 | 2025 年後發布,發布後複查 |
| HERE freemium 精確額度 | 以官方 pricing 頁為準(現引用為第三方數字) |
| Mapbox 免費請求額度數字 | 以官方 pricing 頁為準 |
| 復旦「中國歷史地理信息平台」內容 | 需註冊登入後評估(https://timespace-china.fudan.edu.cn/FDCHGIS/) |
| Wikidata P4711(CHGIS ID)覆蓋率 | 整理三國城池清單時實測 |
