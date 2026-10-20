# 林间木屋 · A Cabin in the Woods

一个在森林中的 3D 乡村木屋网页场景。黄昏、炊烟、暖灯与松林薄雾，全部由代码实时生成，没有任何图片素材。

**在线访问：** https://wshwzn.github.io/forest-cabin/

## 这是什么

基于 Three.js 的实时渲染场景，不是视频也不是贴图。木纹、石墙、植被、天空全部在运行时用程序化方式生成，每帧由 GPU 重新计算。

## 操作

| 操作 | 效果 |
| --- | --- |
| 拖动 | 环视（可在「拖拽 / 视角」两种手感间切换） |
| 滚轮 / 双指捏合 | 拉近、推远 |
| ← / → | 切换镜头 |
| 1 – 6 | 直接跳到某一镜 |
| B | 宽银幕黑边 |
| M | 环境音 |
| V | 切换拖动方式 |
| H | 隐藏界面 |
| F | 全屏 |

## 本地运行

页面使用 ES 模块，浏览器不允许 `file://` 加载模块，因此需要一个本地 HTTP 服务：

```bash
node tools/serve.mjs . 5178
```

然后打开 http://127.0.0.1:5178/

如需让同一局域网内的手机访问：

```bash
node tools/serve.mjs . 5178 0.0.0.0
```

启动后会打印可用的局域网地址。

## 结构

```text
index.html          页面骨架与 HUD
styles.css          界面样式
src/main.js         场景编排、相机、输入、渲染循环
src/cabin.js        木屋：原木、窗、门廊、烟囱、杂物
src/forest.js       针叶林与白桦
src/foliage.js      草丛与灌木
src/terrain.js      地形与地面细节
src/textures.js     程序化贴图（木纹、石缝、地面）
src/atmosphere.js   天空、雾、体积光、尘、炊烟、萤火虫、飞鸟
src/postprocessing.js  泛光、胶片调色、暗角、颗粒
src/audio.js        程序化环境音
src/shots.js        镜头表
vendor/three        本地内置的 Three.js
```

## 说明

- 需要浏览器硬件加速。如果画面卡成幻灯片，请检查浏览器设置中的「使用图形加速」是否开启
- `test/`、`shots/`、`node_modules/` 未纳入版本控制，它们是本地调试产物
