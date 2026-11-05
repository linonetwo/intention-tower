# 在 Linux 上构建 Windows 试玩包

这是开发者构建说明；玩家请看 [Windows 试玩指南](windows.md)。需要 x86-64 Linux、Node.js 22、pnpm、Rust、Windows MSVC Rust target、cargo-xwin、clang、LLVM 的 `lld-link` 和 `llvm-rc`，以及包含插件和 stubs 的 NSIS。构建会下载微软工具链/SDK 和 Tauri NSIS 插件；请预留数 GB 磁盘空间并遵守相应许可。

例如在 Ubuntu 安装标准系统依赖后，准备 Rust 工具：

```sh
sudo apt-get install clang lld llvm nsis
rustup target add x86_64-pc-windows-msvc
cargo install --locked --version 0.23.1 cargo-xwin
```

保持机器现有 Cargo 缓存和临时目录设置，并将 `XWIN_CACHE_DIR` 指向有空间的持久缓存目录，避免 SDK 下载到项目目录。然后在 `intention-tower-game` 目录执行：

```sh
pnpm install --frozen-lockfile
./scripts/build-windows-nsis.sh
```

脚本执行完整的前端生产构建和 Windows 交叉构建。安装程序输出在 `$CARGO_TARGET_DIR/x86_64-pc-windows-msvc/release/bundle/nsis/`；未设置 `CARGO_TARGET_DIR` 时位于 `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`。Tauri CLI 2.5 在 Linux 上的 `--bundles` 只接受 Linux 格式，脚本因此通过配置覆盖选择 NSIS。

标准系统安装的 NSIS 使用 `/usr/share/nsis`。如果无管理员权限，将 Debian 的 NSIS 包解压到其他目录时，Tauri 可能仍设置标准路径；可在 PATH 前放一个本地 `makensis` 启动脚本，设置 `NSISDIR` 为解压后的 `usr/share/nsis`，再执行解压后的 `usr/bin/makensis`。不要将该本机路径写入项目配置。

交叉构建不等同于 Windows 运行测试；当前流程不配置代码签名。Tauri 官方说明此方式仍属较少测试的交叉编译路径：[Windows installer 文档](https://v2.tauri.app/distribute/windows-installer/#build-windows-apps-on-linux-and-macos)。
