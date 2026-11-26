# 外刊精读 · Press Reader

一个以中文为界面的英文精读工具。从链接、RSS 或粘贴的文本创建文章，用分段译文与生词标注辅助阅读，再做逐句精听、听写和闪卡复习。网页构建产物是一个自包含的 HTML 文件。

## 运行

需要 Node.js 22 或更高版本，无需安装 npm 依赖。

```sh
npm start
```

该命令会构建并打开网页；也可以在 Windows 双击 `start.cmd`，或在 macOS / Linux 执行 `bash start.sh`。默认只监听本机，通常是 `http://localhost:8123`。如需用同一可信 Wi-Fi 下的手机访问，可先运行 `npm run build`，再执行 `npm run serve -- --lan`，使用终端显示的局域网地址。不要把这个无账号认证的本地服务暴露到公网。

无需 API Key 即可在「文章库」载入原创示例。使用 AI 精读时，在「设置 → AI 服务」填写 OpenAI 兼容的服务地址、模型和自己的 API Key。请求会将待分析的文章文本发给所选服务；请只配置可信的 HTTPS 服务。应用数据（包括 API Key）保存在当前浏览器配置中，应用内导出的备份不包含 API Key。支持直接打开构建后的 `index.html` 离线使用；网页和 RSS 抓取需要本地服务。

## 测试

- `npm run test:unit`：纯函数单元测试，无需浏览器或网络。
- `npm test`：构建、单元测试和桌面/移动网页冒烟测试。需安装 Chrome、Chromium 或 Edge，也可用 `BROWSER_PATH` 指定可执行文件。实时抓取和 RSS 检查取决于网络及来源站点。
- `npm run test:feeds`：单独检查真实订阅源的可达性。

## Android

安装 JDK 17+ 和 Android SDK（包含 `platforms/android-34`、Build Tools；安装到设备还需要 Platform Tools），并设置 `JAVA_HOME` 和 `ANDROID_HOME`。运行 `npm run apk` 生成 `dist/` 下的 APK；`npm run apk:install` 可安装到连接的设备。构建会在本机生成或复用 `android/debug.keystore`，产物仅供本地测试，不应作为正式发布包分发。运行设备冒烟测试时，先执行 `npm run apk:install -- --debug-webview`，再执行 `npm run test:android`。

## 本地刊物数据

默认构建和源码仓库不附带第三方刊物正文。若你拥有可在本机使用的 EPUB，可以将文件放在 `data/epub/`，运行 `npm run data:atlantic` 生成本地数据，再用 `npm run build -- --with-atlantic` 构建网页，或用 `npm run apk -- --with-atlantic` 构建 APK。网页生成后用 `npm run serve` 启动，不要用会重新执行默认构建的 `npm start`。不要提交这些刊物数据，也不要分发含有未获分发许可内容的构建产物。
