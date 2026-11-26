import { BarChart, RadarChart, ScatterChart } from "echarts/charts";
import {
  GridComponent,
  RadarComponent,
  TooltipComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import ReactEChartsCore from "echarts-for-react/esm/core";

echarts.use([
  RadarChart,
  BarChart,
  ScatterChart,
  RadarComponent,
  GridComponent,
  TooltipComponent,
  SVGRenderer,
]);

/* ธีมกราฟกลาง — ค่าตรงกับ token ใน index.css (ECharts วาดเป็น SVG อ่าน CSS variable ไม่ได้ จึงเก็บค่าไว้ที่นี่ที่เดียว) */
const CHART = {
  font: '"IBM Plex Sans Thai", system-ui, sans-serif',
  user: "#2747D0", // --color-primary
  userSoft: "#9DB0F0", // --color-primary-mid
  req: "#B45309", // --color-warn
  ink: "#111827", // --color-ink
  ink2: "#374151", // --color-ink-2
  muted: "#4B5563", // --color-muted
  line: "#E5E7EB", // --color-line
  good: "#15803d", // --color-good
  warnInk: "#92400e", // --color-warn-ink
};

/** สีส่วนที่ยังขาด (ส้มอ่อน ใกล้กับลายทางของ GapBar — SVG renderer ใช้ pattern จาก canvas ไม่ได้แน่นอน จึงใช้สีพื้น) */
const GAP_FILL = "#fde3c0";
const FONT = CHART.font;
const USER = CHART.user;
const REQ = CHART.req;

/** tooltip สไตล์เดียวกันทุกกราฟ: การ์ดขาว ขอบเส้นบาง เงานุ่ม */
const TOOLTIP = {
  backgroundColor: "#fff",
  borderColor: CHART.line,
  borderWidth: 1,
  padding: [8, 12],
  extraCssText:
    "border-radius:10px;box-shadow:0 10px 24px -6px rgb(17 24 39 / 0.12);",
  textStyle: { fontFamily: FONT, fontSize: 13, color: CHART.ink },
};

/** ตัดบรรทัดตามขอบเขตคำภาษาไทย (ไม่แยกสระ/วรรณยุกต์ออกจากพยัญชนะ) */
const seg =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter("th", { granularity: "word" })
    : null;
function wrapThai(s: string, max = 12): string {
  if (!seg || s.length <= max) return s;
  const lines: string[] = [];
  let cur = "";
  for (const { segment } of seg.segment(s)) {
    if (cur && (cur + segment).length > max) {
      lines.push(cur);
      cur = segment.trimStart();
    } else cur += segment;
  }
  if (cur) lines.push(cur);
  return lines.join("\n");
}

export interface RadarItem {
  name: string;
  user: number;
  required: number;
}

/** Radar: ทักษะของคุณ (น้ำเงิน ทึบ) vs ที่อาชีพต้องการ (ส้ม เส้นประ) */
export function SkillRadar({
  items,
  highlight,
  height = 380,
}: {
  items: RadarItem[];
  highlight?: string;
  height?: number;
}) {
  const option = {
    textStyle: { fontFamily: FONT },
    tooltip: {
      ...TOOLTIP,
      trigger: "item",
      formatter: (p: { seriesName: string; value: number[] }) =>
        `<b>${p.seriesName}</b><br/>` +
        items
          .map((it, i) => `${it.name}: ${Math.round(p.value[i])}`)
          .join("<br/>"),
    },
    radar: {
      radius: height >= 420 ? "64%" : "58%",
      center: ["50%", "52%"],
      indicator: items.map((it) => ({ name: it.name, max: 100 })),
      splitNumber: 4,
      axisName: {
        color: CHART.ink2,
        fontSize: 12,
        fontFamily: FONT,
        formatter: (n: string) => {
          const t = wrapThai(n);
          return n === highlight
            ? t
                .split("\n")
                .map((l) => `{hl|${l}}`)
                .join("\n")
            : t;
        },
        rich: {
          hl: { color: USER, fontWeight: 700, fontSize: 13, fontFamily: FONT },
        },
      },
      splitLine: { lineStyle: { color: CHART.line } },
      splitArea: { show: false },
      axisLine: { lineStyle: { color: CHART.line } },
    },
    series: [
      {
        type: "radar",
        symbolSize: 8,
        data: [
          {
            name: "ที่ต้องการ",
            value: items.map((i) => i.required),
            lineStyle: { color: REQ, width: 2, type: "dashed" },
            itemStyle: { color: REQ, borderColor: "#fff", borderWidth: 2 },
            areaStyle: { opacity: 0 },
          },
          {
            name: "ของคุณ",
            value: items.map((i) => i.user),
            lineStyle: { color: USER, width: 2 },
            itemStyle: { color: USER, borderColor: "#fff", borderWidth: 2 },
            areaStyle: { color: USER, opacity: 0.15 },
          },
        ],
      },
    ],
  };
  return (
    <ReactEChartsCore
      echarts={echarts}
      option={option}
      notMerge
      style={{ height, width: "100%" }}
      opts={{ renderer: "svg" }}
    />
  );
}

/** แท่งพัฒนาการคะแนนตามครั้งที่ประเมิน */
export function HistoryBars({
  labels,
  values,
}: {
  labels: string[];
  values: number[];
}) {
  const option = {
    textStyle: { fontFamily: FONT },
    grid: { left: 8, right: 8, top: 28, bottom: 28, containLabel: false },
    tooltip: {
      ...TOOLTIP,
      trigger: "item",
      formatter: (p: { name: string; value: number }) =>
        `${p.name}<br/><b>${p.value.toFixed(1)}%</b>`,
    },
    xAxis: {
      type: "category",
      data: labels,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: CHART.line } },
      axisLabel: { color: CHART.muted, fontSize: 12, fontFamily: FONT },
    },
    yAxis: { type: "value", min: 0, max: 100, show: false },
    series: [
      {
        type: "bar",
        barMaxWidth: 56,
        data: values.map((v, i) => ({
          value: v,
          itemStyle: {
            color: i === values.length - 1 ? USER : CHART.userSoft,
            borderRadius: [4, 4, 0, 0],
          },
        })),
        label: {
          show: true,
          position: "top",
          color: CHART.ink,
          fontWeight: 700,
          fontFamily: FONT,
          formatter: (p: { value: number }) => `${p.value.toFixed(1)}%`,
        },
      },
    ],
  };
  return (
    <ReactEChartsCore
      echarts={echarts}
      option={option}
      notMerge
      style={{ height: 200, width: "100%" }}
      opts={{ renderer: "svg" }}
    />
  );
}

/** Radar ชุดเดียว: สรุปคำตอบของผู้ใช้เอง (ใช้ตอนจบหมวดในแบบประเมิน — ไม่ใช่ผลโมเดล) */
export function ProfileRadar({
  items,
  height = 320,
}: {
  items: { name: string; value: number }[];
  height?: number;
}) {
  const top = Math.max(...items.map((i) => i.value));
  const option = {
    textStyle: { fontFamily: FONT },
    tooltip: {
      ...TOOLTIP,
      trigger: "item",
      formatter: () =>
        items
          .map((it) => `${it.name}: ${Math.round(it.value / 25) + 1} / 5`)
          .join("<br/>"),
    },
    radar: {
      radius: "60%",
      center: ["50%", "52%"],
      indicator: items.map((it) => ({ name: it.name, max: 100 })),
      splitNumber: 4,
      axisName: {
        color: CHART.ink2,
        fontSize: 12,
        fontFamily: FONT,
        formatter: (n: string) => {
          const t = wrapThai(n, 10);
          const hit = items.find((i) => i.name === n)?.value === top;
          return hit
            ? t
                .split("\n")
                .map((l) => `{hl|${l}}`)
                .join("\n")
            : t;
        },
        rich: {
          hl: { color: USER, fontWeight: 700, fontSize: 13, fontFamily: FONT },
        },
      },
      splitLine: { lineStyle: { color: CHART.line } },
      splitArea: { show: false },
      axisLine: { lineStyle: { color: CHART.line } },
    },
    series: [
      {
        type: "radar",
        symbolSize: 7,
        animationDuration: 700,
        data: [
          {
            name: "คำตอบของคุณ",
            value: items.map((i) => i.value),
            lineStyle: { color: USER, width: 2 },
            itemStyle: { color: USER, borderColor: "#fff", borderWidth: 2 },
            areaStyle: { color: USER, opacity: 0.18 },
          },
        ],
      },
    ],
  };
  return (
    <ReactEChartsCore
      echarts={echarts}
      option={option}
      notMerge
      style={{ height, width: "100%" }}
      opts={{ renderer: "svg" }}
    />
  );
}

/** กราฟแท่งแนวนอน: คะแนนผู้ใช้ (แท่ง) เทียบระดับที่อาชีพต้องการ (ขีดสีส้ม) — คลิกแท่ง/ชื่อเพื่อเลือกทักษะ */
export function SkillBars({
  items,
  selected,
  onSelect,
}: {
  items: { feature: string; name: string; user: number; required: number }[];
  selected?: string | null;
  onSelect: (feature: string) => void;
}) {
  const names = items.map((r) => r.name);
  const option = {
    textStyle: { fontFamily: FONT },
    animationDurationUpdate: 300,
    grid: { left: 8, right: 118, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      ...TOOLTIP,
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: "rgba(39,71,208,0.06)" } },
      formatter: (ps: { dataIndex: number }[]) => {
        const r = items[ps[0].dataIndex];
        const gap = Math.max(0, r.required - r.user);
        return `<b>${r.name}</b><br/>ของคุณ ${r.user.toFixed(0)} · ต้องการ ${r.required.toFixed(0)}<br/>${
          gap > 0 ? `<span style="color:${REQ}">ขาด ${gap.toFixed(0)}</span>` : "ถึงเกณฑ์แล้ว"
        }`;
      },
    },
    xAxis: {
      type: "value",
      min: 0,
      max: 100,
      interval: 25,
      axisLabel: { color: CHART.muted, fontSize: 12, fontFamily: FONT },
      splitLine: { lineStyle: { color: CHART.line } },
    },
    yAxis: {
      type: "category",
      data: names,
      inverse: true,
      triggerEvent: true,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: CHART.line } },
      axisLabel: {
        fontSize: 13,
        fontFamily: FONT,
        width: 150,
        overflow: "truncate",
        color: CHART.ink2,
        formatter: (v: string, i: number) => (items[i]?.feature === selected ? `{sel|${v}}` : v),
        rich: { sel: { color: USER, fontWeight: 700, fontSize: 13, fontFamily: FONT } },
      },
    },
    series: [
      {
        name: "ของคุณ",
        type: "bar",
        stack: "skill",
        barMaxWidth: 20,
        data: items.map((r) => {
          const ok = r.user >= r.required;
          const dim = selected && r.feature !== selected;
          return {
            value: r.user,
            itemStyle: {
              color: ok ? (dim ? "#86C9A0" : CHART.good) : dim ? CHART.userSoft : USER,
              borderRadius: ok ? [0, 4, 4, 0] : 0,
            },
            // ถึงเกณฑ์: เส้น "ต้องการ" อยู่ในแท่ง → เขียนรวมไว้ท้ายแท่งแทน ไม่ให้ป้ายซ้อนกัน
            label: ok
              ? { show: true, position: "right", color: CHART.good, fontWeight: 700, fontSize: 11, fontFamily: FONT,
                  formatter: () => `${r.user.toFixed(0)} ✓ (ต้องการ ${r.required.toFixed(0)})` }
              : { show: true, position: r.user >= 12 ? "insideRight" : "right", color: r.user >= 12 ? "#fff" : CHART.ink,
                  fontWeight: 700, fontSize: 11, fontFamily: FONT, formatter: () => r.user.toFixed(0) },
          };
        }),
      },
      {
        name: "ที่ยังขาด",
        type: "bar",
        stack: "skill",
        barMaxWidth: 20,
        data: items.map((r) => {
          const gap = Math.max(0, r.required - r.user);
          return {
            value: gap,
            itemStyle: {
              color: GAP_FILL,
              borderColor: "rgba(180,83,9,0.25)",
              borderWidth: gap ? 1 : 0,
              borderRadius: [0, 4, 4, 0],
            },
            label: {
              show: gap >= 8,
              position: "inside",
              color: CHART.warnInk,
              fontWeight: 700,
              fontSize: 11,
              fontFamily: FONT,
              formatter: () => `ขาด ${gap.toFixed(0)}`,
            },
          };
        }),
      },
      {
        name: "ที่ต้องการ",
        type: "scatter",
        symbol: "rect",
        symbolSize: [2, 26],
        z: 3,
        itemStyle: { color: REQ },
        label: {
          show: true,
          position: "right",
          distance: 6,
          color: CHART.warnInk,
          fontSize: 11,
          fontFamily: FONT,
          formatter: (p: { value: number }) => `ต้องการ ${Number(p.value).toFixed(0)}`,
        },
        data: items.map((r) => ({ value: r.required, label: { show: r.user < r.required } })),
      },
    ],
  };
  const onEvents = {
    click: (e: { componentType: string; dataIndex?: number; value?: unknown }) => {
      if (e.componentType === "series" && e.dataIndex != null) onSelect(items[e.dataIndex].feature);
      else if (e.componentType === "yAxis") {
        const hit = items.find((r) => r.name === e.value);
        if (hit) onSelect(hit.feature);
      }
    },
  };
  return (
    <ReactEChartsCore
      echarts={echarts}
      option={option}
      notMerge
      onEvents={onEvents}
      style={{ height: Math.max(160, items.length * 38 + 40), width: "100%", cursor: "pointer" }}
      opts={{ renderer: "svg" }}
    />
  );
}
