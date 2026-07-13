# ddys-webos

DDYS 的 LG webOS TV 电视端应用。它把 DDYS API 的首页、分类、搜索、详情和播放资源做成适合 LG 电视遥控器与 Magic Remote 操作的 packaged web app。

## 功能

- 首页推荐：最新更新、热门推荐、继续观看、分类入口。
- 分类浏览：电影、剧集、动画、综艺、纪录片。
- 搜索：支持电视输入法和 Magic Remote 指针输入。
- 详情页：封面、年份、类型、地区、评分、简介、播放资源。
- 播放器：HTML5 video，支持播放/暂停、快退、快进、返回。
- 遥控器：方向键移动焦点，确认键打开，Back 键返回，彩色键快捷切换搜索/收藏/历史/设置。
- Magic Remote：指针悬停会同步焦点，点击即可操作。
- 收藏、历史、继续观看和播放进度。
- 设置：API Base、API Key、鉴权模式、分页数量、缓存、资源过滤。
- 自检：webOS 环境、PalmSystem、webOS 对象、HTML5 video、MP4/HLS 能力、本地存储、API 连接。
- 打包：源码 ZIP 和 `.ipk` 包。

## 使用

Release 中提供：

- `ddys-webos-v0.1.0.ipk`：LG webOS 安装包。
- `ddys-webos-v0.1.0.zip`：源码与文档包。
- 对应 `.sha256` 校验文件。

安装通常需要 LG webOS TV 开发者模式和 webOS SDK/CLI。也可以用浏览器直接打开 `index.html` 调试界面和 API 行为。

## 配置

打开 App 后进入“设置”：

| 项目 | 默认值 | 说明 |
| --- | --- | --- |
| API Base | `https://ddys.io/api/v1` | DDYS API 地址 |
| API Key | 空 | 可选鉴权 Key |
| API Key 模式 | `query` | `query`、`bearer` 或 `header` |
| API Key Query | `api_key` | query 模式下的参数名 |
| 每页数量 | `24` | 首页、分类、搜索的分页数量 |
| 缓存秒数 | `600` | API 内存缓存时间，填 `0` 可关闭 |
| 只显示直连播放资源 | 关闭 | 开启后过滤网盘、磁力等资源 |
| 显示外部资源 | 开启 | 关闭后只展示可播放资源 |

## 遥控器

- 方向键：移动焦点。
- 确认键：打开影片、播放资源、保存设置。
- Back 键：播放页返回；其他页面回首页。
- 红色键：搜索。
- 绿色键：收藏。
- 黄色键：历史。
- 蓝色键：设置。
- 播放/暂停、快退、快进、停止：播放页控制。

## 兼容

目标是 LG webOS TV packaged web app。视频播放能力取决于电视型号、固件、资源格式、CORS 和网络条件。MP4 通常最稳；HLS 是否可直接播放由设备内置播放器决定。

## 验证

```bash
node tools/check.mjs
node --test tests/*.test.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-package.ps1
```
