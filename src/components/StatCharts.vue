<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsType } from 'echarts/core'

// 按需注册：本组件只用柱状图、饼图、折线图，避免把整个 echarts 打进产物。
echarts.use([BarChart, LineChart, PieChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

const props = defineProps<{ scope: 'guardian' | 'admin'; elderName?: string }>()
const recognitionChart = ref<HTMLElement>()
const categoryChart = ref<HTMLElement>()
const completionChart = ref<HTMLElement>()
const instances: EChartsType[] = []

function renderCharts(): void {
  instances.forEach((chart) => chart.dispose())
  instances.length = 0
  if (!recognitionChart.value || !categoryChart.value || !completionChart.value) return
  const recognition = echarts.init(recognitionChart.value)
  recognition.setOption({
    color: ['#1f766e'], tooltip: { trigger: 'axis' }, grid: { left: 38, right: 18, top: 24, bottom: 30 },
    xAxis: { type: 'category', data: props.scope === 'admin' ? ['1月', '2月', '3月', '4月', '5月', '6月'] : ['1月', '2月', '3月', '4月', '5月', '6月'], axisLine: { lineStyle: { color: '#c8d6d1' } } },
    yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#edf1ef' } } },
    series: [{ type: 'bar', data: props.scope === 'admin' ? [3, 5, 8, 12, 16, 21] : [12, 18, 15, 24, 20, 28], barMaxWidth: 32, itemStyle: { borderRadius: [4, 4, 0, 0] } }],
  })
  const categories = echarts.init(categoryChart.value)
  categories.setOption({
    color: ['#27786f', '#e9a23b', '#7693ad'], tooltip: { trigger: 'item' },
    legend: { bottom: 0, textStyle: { color: '#4d605b' } },
    series: [{ type: 'pie', radius: ['42%', '70%'], center: ['50%', '44%'], itemStyle: { borderColor: '#fff', borderWidth: 3 }, label: { formatter: '{b}\n{d}%' }, data: [{ name: '慢性病用药', value: 46 }, { name: '营养补充', value: 24 }, { name: '其他', value: 30 }] }],
  })
  const completion = echarts.init(completionChart.value)
  completion.setOption({
    color: ['#c76b3c'], tooltip: { trigger: 'axis', valueFormatter: (value: number) => `${value}%` }, grid: { left: 42, right: 18, top: 24, bottom: 30 },
    xAxis: { type: 'category', data: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'], axisLine: { lineStyle: { color: '#c8d6d1' } } },
    yAxis: { type: 'value', min: 0, max: 100, axisLabel: { formatter: '{value}%' }, splitLine: { lineStyle: { color: '#edf1ef' } } },
    series: [{ type: 'line', smooth: true, symbolSize: 8, data: [82, 91, 86, 94, 88, 96, 92], areaStyle: { opacity: 0.12 } }],
  })
  instances.push(recognition, categories, completion)
}

let resizeObserver: ResizeObserver | undefined
onMounted(() => {
  renderCharts()
  resizeObserver = new ResizeObserver(() => instances.forEach((chart) => chart.resize()))
  ;[recognitionChart.value, categoryChart.value, completionChart.value].forEach((element) => element && resizeObserver?.observe(element))
})
watch(() => [props.scope, props.elderName], renderCharts)
onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  instances.forEach((chart) => chart.dispose())
})
</script>

<template>
  <div class="chart-grid">
    <section class="surface chart-panel"><div class="section-title"><h2>{{ props.scope === 'admin' ? '用户增长趋势' : '每月药品识别次数' }}</h2><span>近 6 个月</span></div><div ref="recognitionChart" class="chart-canvas" /></section>
    <section class="surface chart-panel"><div class="section-title"><h2>药品分类占比</h2><span>识别记录</span></div><div ref="categoryChart" class="chart-canvas" /></section>
    <section class="surface chart-panel chart-wide"><div class="section-title"><h2>{{ props.scope === 'admin' ? '全平台服药完成率' : '每周服药完成率' }}</h2><span>{{ props.elderName || '全部老人' }}</span></div><div ref="completionChart" class="chart-canvas chart-canvas-wide" /></section>
  </div>
</template>
