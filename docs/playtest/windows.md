# Windows 试玩指南

## 下载和安装

1. 打开提供给你的试玩构建下载页面，下载 `intention-tower-windows` 构建产物。GitHub Actions 的产物下载可能需要登录和仓库访问权限；如果没有权限，请联系提供试玩包的人。
2. 解压下载的 ZIP，运行其中的 NSIS 安装程序（`.exe`），按提示完成安装。请只运行来自你信任的提供者的安装包。
3. 安装程序需要 Microsoft Edge WebView2 Runtime。安装时如提示下载该组件，请连接网络并按提示操作；已有该组件的电脑通常无需重复安装。

试玩安装包未配置代码签名，Windows 可能显示未知发布者或 SmartScreen 警告。遇到警告时，请先核实安装包来源；不要运行来源不明的文件。

## 启动和卸载

从开始菜单打开“Experimental Dog’s Tower of Meaning”即可开始游戏。游戏使用安装在本机的 Tauri 程序和游戏核心，不需要启动 MCP 或其他开发服务。

要卸载，请打开 Windows“设置 → 应用 → 已安装的应用”，找到游戏并选择卸载。
