# 文档识别服务

## 启动

```text
pnpm install
pnpm start
```

服务地址：`http://电脑局域网IP:8787`

手机和电脑必须连接同一个 Wi-Fi。启动App前设置：

```text
EXPO_PUBLIC_EXTRACTION_API_URL=http://电脑局域网IP:8787/extract
```

接口：

- `GET /health`：检查服务是否在线
- `POST /extract`：上传 Word、PDF、图片或文本文件，返回去重后的词条数组

图片OCR首次运行可能需要下载语言数据，识别速度会比Word和PDF慢。

## 云端部署

服务已提供 `Dockerfile`，部署后将App中的 `EXPO_PUBLIC_EXTRACTION_API_URL` 设置为：

```text
https://你的固定域名/extract
```

不要把本地 `localhost` 地址写进正式App。

项目根目录已提供 `render.yaml`。在Render中连接项目仓库并选择该配置后，平台会按Dockerfile创建识别服务，并提供固定HTTPS域名。
