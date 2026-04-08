# Blankpaper Web OpenAI

OpenAI official-route edition of the Blankpaper web app.

白纸产品的 OpenAI 官方路由 Web 版，基于 Next.js 16、React 19、TypeScript 与 Tailwind CSS 4。

## Overview

This directory keeps the same front-end experience as Blankpaper Web, but swaps the server-side AI route to OpenAI Responses API.

这个目录和主版白纸 Web 保持同一套前端体验，只把服务端 `/api/generate` 换成 OpenAI 官方 Responses API。前端不会暴露密钥，文字和图片会先发送到本地路由，再由服务端转发给 OpenAI。

Main repository guide:

- [../README.md](../README.md)

## Features

- AI-assisted structured blankpaper generation
- image uploads and audio recording on the paper
- public square, secret-code access, and local history
- scene/background effects for a stronger visual identity
- browser-local persistence for quick prototyping

## Run

```bash
cd /Users/sunyuefeng/Documents/trae_projects/whitepaper/whitepaper-web-openai
npm install
cp .env.example .env.local
npm run dev
```

Open:

```text
http://localhost:3000
```

## AI Configuration

Set the OpenAI credentials on the server side:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_API_URL` optional, defaults to `https://api.openai.com/v1/responses`
- `OPENAI_REASONING_EFFORT` optional

The front-end only sends:

- title
- text prompt
- up to 4 image data URLs
- locale

## Notes

- Image input is sent as `data:image/...` URLs to the local route, then forwarded to OpenAI.
- This version is intended for open-source/self-hosted deployments where the server owner configures the OpenAI environment variables.
- The UI, editing flow, background effects, preview mode, and local paper persistence are aligned with the main `whitepaper-web` app.

## License

This directory follows the repository-level `GNU Affero General Public License v3.0`.

- derivatives that are deployed over a network must disclose source
- the license is standard open source
- commercial use is allowed under AGPL terms

See:

- [../LICENSE](../LICENSE)

## Donate

- [Support me on Ko-fi](https://ko-fi.com/O5O01KTRSP)
